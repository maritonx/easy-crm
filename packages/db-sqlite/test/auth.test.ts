import {
  defineConfig,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, open, rawClient, SECRET } from './helpers.js'

const config = defineConfig({
  secret: SECRET,
  db: db(),
  auth: { maxLoginAttempts: 3 },
  collections: [
    {
      slug: 'posts',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'author', type: 'relationship', to: 'users' },
      ],
    },
  ],
})

const PASSWORD = 'correct horse'

async function withUser(extra: Record<string, unknown> = {}) {
  const cms = await open(config)
  const user = await cms.create('users', {
    email: 'Ann@Example.com',
    password: PASSWORD,
    role: 'admin',
    ...extra,
  })
  return { cms, user }
}

describe('users collection (FR-CFG-06, FR-AUTH-02/06)', () => {
  it('is built in with email, name, role and active', async () => {
    const { cms, user } = await withUser()
    expect(user).toMatchObject({
      email: 'ann@example.com',
      role: 'admin',
      active: true,
      name: null,
    })
    expect(Object.keys(user)).not.toContain('passwordHash')
    expect(Object.keys(user)).not.toContain('password')
    await cms.destroy()
  })

  it('stores a scrypt hash, never the password', async () => {
    const { cms } = await withUser()
    const client = rawClient(cms.cwd)
    const { rows } = await client.execute('SELECT password_hash FROM ecms_users')
    client.close()
    expect(String(rows[0]?.password_hash)).toMatch(/^scrypt\$131072\$8\$1\$/)
    expect(String(rows[0]?.password_hash)).not.toContain(PASSWORD)
    await cms.destroy()
  })

  it('never returns the hash, even when populated', async () => {
    const { cms, user } = await withUser()
    const post = await cms.create('posts', { title: 'P', author: user.id })
    expect(post.author).toMatchObject({ id: user.id, email: 'ann@example.com' })
    expect(post.author).not.toHaveProperty('passwordHash')
    expect((await cms.find('users')).docs[0]).not.toHaveProperty('passwordHash')
    await cms.destroy()
  })

  it('requires a password of at least 8 characters', async () => {
    const cms = await open(config)
    // @ts-expect-error password is required
    await expect(cms.create('users', { email: 'a@b.co', role: 'editor' })).rejects.toMatchObject({
      errors: [{ field: 'password', message: 'is required' }],
    })
    await expect(
      cms.create('users', { email: 'a@b.co', role: 'editor', password: 'short' }),
    ).rejects.toThrow(ValidationError)
    await cms.destroy()
  })

  it('ignores attempts to set the hash directly', async () => {
    const { cms, user } = await withUser()
    await cms.update('users', user.id, { passwordHash: 'scrypt$1$1$1$x$y' } as never)
    await expect(
      cms.auth.login({ email: 'ann@example.com', password: PASSWORD }),
    ).resolves.toBeTruthy()
    await cms.destroy()
  })

  it('merges fields and access from a user-defined users collection', async () => {
    const cms = await open({
      ...config,
      collections: [
        ...config.collections,
        { slug: 'users', fields: [{ name: 'phone', type: 'text' }] },
      ],
    })
    const user = await cms.create('users', {
      email: 'x@y.co',
      password: PASSWORD,
      role: 'editor',
      phone: '081',
    })
    expect(user).toMatchObject({ phone: '081', role: 'editor' })
    await cms.destroy()
  })

  it('supports custom roles', async () => {
    const cms = await open({ ...config, auth: { roles: ['admin', 'author', 'reviewer'] } })
    const user = await cms.create('users', {
      email: 'x@y.co',
      password: PASSWORD,
      role: 'reviewer',
    })
    expect(user.role).toBe('reviewer')
    await expect(
      cms.create('users', { email: 'z@y.co', password: PASSWORD, role: 'editor' }),
    ).rejects.toThrow(ValidationError)
    await cms.destroy()
  })
})

describe('login / verify / logout (FR-AUTH-01/03/04)', () => {
  it('logs in with a case-insensitive email and verifies the session', async () => {
    const { cms, user } = await withUser()
    const session = await cms.auth.login({ email: ' ANN@example.com ', password: PASSWORD })
    expect(session.user).toMatchObject({ id: user.id, email: 'ann@example.com', role: 'admin' })
    expect(session.user).not.toHaveProperty('passwordHash')
    expect(session.token).toMatch(/^[\w-]+\.[\w-]+$/)
    expect(new Date(session.expiresAt).getTime() - Date.now()).toBeGreaterThan(
      6.9 * 24 * 3600 * 1000,
    )

    expect(await cms.auth.verify(session.token)).toMatchObject({ id: user.id })
    await cms.auth.logout(session.token)
    expect(await cms.auth.verify(session.token)).toBeNull()
    await cms.destroy()
  })

  it('stores only a hash of the session token', async () => {
    const { cms } = await withUser()
    const session = await cms.auth.login({ email: 'ann@example.com', password: PASSWORD })
    const client = rawClient(cms.cwd)
    const { rows } = await client.execute('SELECT token_hash FROM ecms_sessions')
    client.close()
    expect(rows).toHaveLength(1)
    expect(session.token).not.toContain(String(rows[0]?.token_hash))
    await cms.destroy()
  })

  it('rejects wrong passwords, unknown emails and inactive users with the same message', async () => {
    const { cms } = await withUser()
    await cms.create('users', {
      email: 'off@example.com',
      password: PASSWORD,
      role: 'editor',
      active: false,
    })
    for (const args of [
      { email: 'ann@example.com', password: 'wrong password' },
      { email: 'nobody@example.com', password: PASSWORD },
      { email: 'off@example.com', password: PASSWORD },
      { email: '', password: '' },
    ]) {
      const error = await cms.auth.login(args).catch((e) => e)
      expect(error).toBeInstanceOf(UnauthorizedError)
      expect(error.message).toBe('Invalid email or password')
    }
    await cms.destroy()
  })

  it('rejects tampered, unknown and expired tokens', async () => {
    const cms = await open({ ...config, auth: { tokenExpiration: 1 } })
    await cms.create('users', { email: 'a@b.co', password: PASSWORD, role: 'admin' })
    const session = await cms.auth.login({ email: 'a@b.co', password: PASSWORD })
    const [token, signature] = session.token.split('.')
    expect(await cms.auth.verify(`${token}x.${signature}`)).toBeNull()
    expect(await cms.auth.verify('garbage')).toBeNull()
    expect(await cms.auth.verify(undefined)).toBeNull()

    await new Promise((r) => setTimeout(r, 1100))
    expect(await cms.auth.verify(session.token)).toBeNull()
    await cms.destroy()
  })

  it('ends sessions when the user is deactivated or changes password', async () => {
    const { cms, user } = await withUser()
    const other = await cms.create('users', { email: 'b@b.co', password: PASSWORD, role: 'editor' })
    const s1 = await cms.auth.login({ email: 'b@b.co', password: PASSWORD })
    await cms.update('users', other.id, { active: false })
    expect(await cms.auth.verify(s1.token)).toBeNull()

    const s2 = await cms.auth.login({ email: 'ann@example.com', password: PASSWORD })
    await cms.update('users', user.id, { password: 'a new password' })
    expect(await cms.auth.verify(s2.token)).toBeNull()
    await expect(cms.auth.login({ email: 'ann@example.com', password: PASSWORD })).rejects.toThrow(
      UnauthorizedError,
    )
    await expect(
      cms.auth.login({ email: 'ann@example.com', password: 'a new password' }),
    ).resolves.toBeTruthy()
    await cms.destroy()
  })
})

describe('rate limiting (FR-AUTH-05)', () => {
  it('locks an email + IP after too many failures, and clears on success', async () => {
    const { cms } = await withUser()
    const attempt = (password: string, ip = '1.1.1.1') =>
      cms.auth.login({ email: 'ann@example.com', password, ip })

    await expect(attempt('wrong-1')).rejects.toThrow(UnauthorizedError)
    await expect(attempt('wrong-2')).rejects.toThrow(UnauthorizedError)
    await expect(attempt(PASSWORD)).resolves.toBeTruthy() // success clears failures
    for (let i = 0; i < 3; i++)
      await expect(attempt(`wrong-${i}`)).rejects.toThrow(UnauthorizedError)
    await expect(attempt(PASSWORD)).rejects.toThrow(TooManyRequestsError)
    await expect(attempt(PASSWORD, '2.2.2.2')).resolves.toBeTruthy()
    await cms.destroy()
  })
})

describe('first admin', () => {
  it('can be registered once, while there are no users', async () => {
    const cms = await open(config)
    expect(await cms.auth.hasUsers()).toBe(false)
    const session = await cms.auth.registerFirstUser({
      email: 'first@example.com',
      password: PASSWORD,
    })
    expect(session.user).toMatchObject({ role: 'admin', email: 'first@example.com' })
    expect(await cms.auth.verify(session.token)).toBeTruthy()
    await expect(
      cms.auth.registerFirstUser({ email: 'second@example.com', password: PASSWORD }),
    ).rejects.toMatchObject({
      status: 403,
    })
    await cms.destroy()
  })
})

describe('last admin guard', () => {
  it('refuses to demote, deactivate or delete the last active admin', async () => {
    const { cms, user } = await withUser()
    await expect(cms.update('users', user.id, { role: 'editor' })).rejects.toMatchObject({
      errors: [{ field: 'role', message: 'cannot remove the last active admin' }],
    })
    await expect(cms.update('users', user.id, { active: false })).rejects.toThrow(ValidationError)
    await expect(cms.delete('users', user.id)).rejects.toThrow(ValidationError)

    await cms.create('users', { email: 'two@example.com', password: PASSWORD, role: 'admin' })
    await expect(cms.update('users', user.id, { role: 'editor' })).resolves.toMatchObject({
      role: 'editor',
    })
    await cms.destroy()
  })
})
