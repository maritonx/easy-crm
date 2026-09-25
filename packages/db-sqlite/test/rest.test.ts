import { createRestHandler, defineConfig, type RestHandler } from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

const config = defineConfig({
  secret: SECRET,
  db: db(),
  auth: { trustedOrigins: ['https://admin.example.com'] },
  collections: [
    {
      slug: 'posts',
      access: { read: () => true },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'views', type: 'number' },
        { name: 'tags', type: 'select', options: ['a', 'b'], hasMany: true },
        {
          name: 'boom',
          type: 'text',
          validate: (value) => {
            if (value === 'explode') throw new Error('database password is hunter2')
            return true
          },
        },
      ],
    },
    { slug: 'pages', fields: [{ name: 'title', type: 'text' }] },
  ],
  globals: [
    { slug: 'site', access: { read: () => true }, fields: [{ name: 'name', type: 'text' }] },
  ],
})

const BASE = 'http://cms.test/api/cms'
const PASSWORD = 'password123'

type CMS = Awaited<ReturnType<typeof open<typeof config>>>
let cms: CMS
let handle: RestHandler

beforeAll(async () => {
  cms = await open(config)
  handle = createRestHandler(cms, { getClientIp: (r) => r.headers.get('x-test-ip') ?? undefined })
})
afterAll(() => cms.destroy())

interface Call {
  method?: string
  body?: unknown
  headers?: Record<string, string>
}

async function call(path: string, { method = 'GET', body, headers = {} }: Call = {}) {
  const init: RequestInit = { method, headers: { ...headers } }
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
    ;(init.headers as Record<string, string>)['content-type'] ??= 'application/json'
  }
  const response = await handle(new Request(`${BASE}${path}`, init))
  const text = await response.text()
  return {
    status: response.status,
    headers: response.headers,
    json: text ? JSON.parse(text) : undefined,
  }
}

/** Logs in and returns headers that authenticate like a browser (cookie + CSRF header). */
async function browser(email: string) {
  const login = await call('/users/login', { method: 'POST', body: { email, password: PASSWORD } })
  expect(login.status).toBe(200)
  const cookies = login.headers.getSetCookie()
  const session = cookies.find((c) => c.startsWith('ecms-session='))?.split(';')[0] as string
  return {
    login,
    cookie: session,
    headers: {
      cookie: session,
      'x-csrf-token': login.json.csrfToken as string,
      origin: 'http://cms.test',
    },
    token: decodeURIComponent(session.split('=')[1] as string),
  }
}

describe('first admin', () => {
  it('reports whether users exist and registers the first admin once', async () => {
    expect((await call('/users/init')).json).toEqual({ hasUsers: false })
    const first = await call('/users/first-register', {
      method: 'POST',
      body: { email: 'admin@x.co', password: PASSWORD },
    })
    expect(first.status).toBe(201)
    expect(first.json.user).toMatchObject({ email: 'admin@x.co', role: 'admin' })
    expect(first.headers.getSetCookie().some((c) => c.startsWith('ecms-session='))).toBe(true)
    expect((await call('/users/init')).json).toEqual({ hasUsers: true })

    const again = await call('/users/first-register', {
      method: 'POST',
      body: { email: 'b@x.co', password: PASSWORD },
    })
    expect(again.status).toBe(403)
    await cms.create('users', { email: 'editor@x.co', password: PASSWORD, role: 'editor' })
  })
})

describe('auth endpoints (FR-REST-05, FR-AUTH-03)', () => {
  it('sets an HttpOnly, SameSite=Lax session cookie and a readable CSRF cookie', async () => {
    const { login } = await browser('admin@x.co')
    const [session, csrf] = login.headers.getSetCookie()
    expect(session).toMatch(/^ecms-session=.+; Path=\/; SameSite=Lax; HttpOnly; Max-Age=604800$/)
    expect(csrf).toMatch(/^ecms-csrf=.+; Path=\/; SameSite=Lax; Max-Age=604800$/)
    expect(login.json.user).not.toHaveProperty('passwordHash')
  })

  it('returns the current user from the cookie', async () => {
    const { cookie, login } = await browser('admin@x.co')
    const me = await call('/users/me', { headers: { cookie } })
    expect(me.json).toMatchObject({
      user: { email: 'admin@x.co' },
      csrfToken: login.json.csrfToken,
    })
    expect((await call('/users/me')).json).toEqual({ user: null })
  })

  it('rejects bad credentials with 401 and rate-limits with 429', async () => {
    const bad = await call('/users/login', {
      method: 'POST',
      body: { email: 'editor@x.co', password: 'nope' },
      headers: { 'x-test-ip': '9.9.9.9' },
    })
    expect(bad).toMatchObject({
      status: 401,
      json: { errors: [{ message: 'Invalid email or password' }] },
    })
    for (let i = 0; i < 4; i++) {
      await call('/users/login', {
        method: 'POST',
        body: { email: 'editor@x.co', password: 'nope' },
        headers: { 'x-test-ip': '9.9.9.9' },
      })
    }
    const locked = await call('/users/login', {
      method: 'POST',
      body: { email: 'editor@x.co', password: PASSWORD },
      headers: { 'x-test-ip': '9.9.9.9' },
    })
    expect(locked.status).toBe(429)
  })

  it('logs out and clears cookies', async () => {
    const { headers, cookie } = await browser('admin@x.co')
    const out = await call('/users/logout', { method: 'POST', headers })
    expect(out.status).toBe(200)
    expect(out.headers.getSetCookie().every((c) => c.includes('Max-Age=0'))).toBe(true)
    expect((await call('/users/me', { headers: { cookie } })).json.user).toBeNull()
  })

  it('accepts a Bearer token without CSRF', async () => {
    const { token } = await browser('admin@x.co')
    const created = await call('/pages', {
      method: 'POST',
      body: { title: 'Via bearer' },
      headers: { authorization: `Bearer ${token}` },
    })
    expect(created.status).toBe(201)
  })
})

describe('CSRF protection (NFR-SEC-01)', () => {
  it('requires the CSRF header for cookie-authenticated writes', async () => {
    const { headers } = await browser('admin@x.co')
    const { 'x-csrf-token': _, ...noToken } = headers
    expect(
      (await call('/posts', { method: 'POST', body: { title: 'x' }, headers: noToken })).status,
    ).toBe(403)
    expect(
      (
        await call('/posts', {
          method: 'POST',
          body: { title: 'x' },
          headers: { ...headers, 'x-csrf-token': 'wrong' },
        })
      ).status,
    ).toBe(403)
    expect((await call('/posts', { method: 'POST', body: { title: 'ok' }, headers })).status).toBe(
      201,
    )
  })

  it('rejects untrusted origins and cross-site requests, even for login', async () => {
    const { headers } = await browser('admin@x.co')
    expect(
      (
        await call('/posts', {
          method: 'POST',
          body: { title: 'x' },
          headers: { ...headers, origin: 'https://evil.test' },
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await call('/posts', {
          method: 'POST',
          body: { title: 'x' },
          headers: { ...headers, origin: 'https://admin.example.com' },
        })
      ).status,
    ).toBe(201)
    const crossSite = await call('/users/login', {
      method: 'POST',
      body: { email: 'admin@x.co', password: PASSWORD },
      headers: { 'sec-fetch-site': 'cross-site' },
    })
    expect(crossSite.status).toBe(403)
  })
})

describe('collections (FR-REST-01..04)', () => {
  let admin: Awaited<ReturnType<typeof browser>>
  beforeAll(async () => {
    admin = await browser('admin@x.co')
    for (const [title, views, tags] of [
      ['Alpha', 1, ['a']],
      ['Beta', 2, ['a', 'b']],
      ['Gamma', 3, []],
    ] as const) {
      await cms.create('posts', { title, views, tags: [...tags] })
    }
  })

  it('lists with bracket where, sort, limit and page', async () => {
    const res = await call('/posts?where[views][gte]=2&sort=-views&limit=1&page=2')
    expect(res.status).toBe(200)
    expect(res.json).toMatchObject({ totalDocs: 2, page: 2, limit: 1, docs: [{ title: 'Beta' }] })
    const or = await call(
      '/posts?where[or][0][title][equals]=Alpha&where[or][1][tags][in]=b&sort=title&limit=100',
    )
    expect(or.json.docs.map((d: { title: string }) => d.title)).toEqual(['Alpha', 'Beta'])
    const json = await call(
      `/posts?where=${encodeURIComponent(JSON.stringify({ title: { like: 'amm' } }))}`,
    )
    expect(json.json.docs.map((d: { title: string }) => d.title)).toEqual(['Gamma'])
    const exists = await call(
      '/posts?where[tags][exists]=false&where[title][not_equals]=null&limit=100',
    )
    expect(exists.json.docs.map((d: { title: string }) => d.title)).toContain('Gamma')
  })

  it('rejects bad query parameters with 400', async () => {
    for (const q of [
      'limit=101',
      'limit=0',
      'page=0',
      'depth=4',
      'where[nope][equals]=1',
      'where[__proto__][x]=1',
      'where=notjson',
    ]) {
      const res = await call(`/posts?${q}`)
      expect(res.status, q).toBe(400)
      expect(res.json.errors[0].message, q).toEqual(expect.any(String))
    }
  })

  it('creates, reads, updates and deletes', async () => {
    const created = await call('/posts', {
      method: 'POST',
      body: { title: 'New' },
      headers: admin.headers,
    })
    expect(created.status).toBe(201)
    const id = created.json.id
    expect((await call(`/posts/${id}`)).json).toMatchObject({ title: 'New' })
    const patched = await call(`/posts/${id}`, {
      method: 'PATCH',
      body: { views: 9 },
      headers: admin.headers,
    })
    expect(patched.json).toMatchObject({ title: 'New', views: 9 })
    expect((await call(`/posts/${id}`, { method: 'DELETE', headers: admin.headers })).status).toBe(
      200,
    )
    expect((await call(`/posts/${id}`)).status).toBe(404)
  })

  it('returns validation errors with field paths', async () => {
    const res = await call('/posts', {
      method: 'POST',
      body: { views: 'many' },
      headers: admin.headers,
    })
    expect(res.status).toBe(400)
    expect(res.json.errors).toEqual(
      expect.arrayContaining([
        { message: 'is required', field: 'title' },
        { message: 'must be a number', field: 'views' },
      ]),
    )
  })

  it('applies access: 401 for anonymous, 403 for forbidden', async () => {
    expect((await call('/pages')).status).toBe(401)
    expect((await call('/pages')).headers.get('www-authenticate')).toBe('Bearer')
    const editor = await browser('editor@x.co')
    const res = await call('/users', {
      method: 'POST',
      body: { email: 'z@x.co', password: PASSWORD, role: 'admin' },
      headers: editor.headers,
    })
    expect(res.status).toBe(403)
  })

  it('hides internal and unknown collections', async () => {
    for (const path of ['/sessions', '/login-attempts', '/nope', '/posts/1/extra', '']) {
      expect((await call(path, { headers: admin.headers })).status, path).toBe(404)
    }
  })

  it('checks content type, JSON and body size', async () => {
    expect(
      (
        await call('/posts', {
          method: 'POST',
          body: 'title=x',
          headers: { ...admin.headers, 'content-type': 'text/plain' },
        })
      ).status,
    ).toBe(415)
    expect(
      (await call('/posts', { method: 'POST', body: '{nope', headers: admin.headers })).status,
    ).toBe(400)
    expect(
      (await call('/posts', { method: 'POST', body: '[1]', headers: admin.headers })).status,
    ).toBe(400)
    const huge = JSON.stringify({ title: 'x'.repeat(1024 * 1024 + 10) })
    expect(
      (await call('/posts', { method: 'POST', body: huge, headers: admin.headers })).status,
    ).toBe(413)
  })

  it('answers 405 for unsupported methods', async () => {
    const res = await call('/posts', { method: 'PUT', body: {}, headers: admin.headers })
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET, POST')
  })

  it('sends no-store and nosniff headers', async () => {
    const res = await call('/posts')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })
})

describe('globals', () => {
  it('reads and updates', async () => {
    const { headers } = await browser('admin@x.co')
    expect((await call('/globals/site')).json).toMatchObject({ name: null })
    expect(
      (await call('/globals/site', { method: 'POST', body: { name: 'Easy' }, headers })).json,
    ).toMatchObject({ name: 'Easy' })
    expect((await call('/globals/nope')).status).toBe(404)
  })
})

describe('changing your own password', () => {
  it('ends other sessions and issues a new cookie for this browser', async () => {
    await cms.create('users', { email: 'self@x.co', password: PASSWORD, role: 'editor' })
    const a = await browser('self@x.co')
    const b = await browser('self@x.co')
    const res = await call(`/users/${a.login.json.user.id}`, {
      method: 'PATCH',
      body: { password: 'brand new pass' },
      headers: a.headers,
    })
    expect(res.status).toBe(200)
    const fresh = res.headers
      .getSetCookie()
      .find((c) => c.startsWith('ecms-session='))
      ?.split(';')[0]
    expect(fresh).toBeDefined()
    expect(
      (await call('/users/me', { headers: { cookie: fresh as string } })).json.user,
    ).toMatchObject({ email: 'self@x.co' })
    expect((await call('/users/me', { headers: { cookie: b.cookie } })).json.user).toBeNull()
  })
})

describe('unexpected errors (FR-REST-06)', () => {
  it('hide details in production', async () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    const prodHandler = createRestHandler(cms)
    process.env.NODE_ENV = previous
    const token = (await cms.auth.login({ email: 'admin@x.co', password: PASSWORD })).token
    const logged: string[] = []
    const original = cms.logger.error
    ;(cms.logger as { error: (m: string) => void }).error = (m) => logged.push(m)
    try {
      const response = await prodHandler(
        new Request(`${BASE}/posts`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ title: 't', boom: 'explode' }),
        }),
      )
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ errors: [{ message: 'Internal Server Error' }] })
      expect(logged[0]).toContain('hunter2')
    } finally {
      ;(cms.logger as { error: (m: string) => void }).error = original
    }
  })
})
