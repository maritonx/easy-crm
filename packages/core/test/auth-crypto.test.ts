import { describe, expect, it } from 'vitest'
import { csrfToken, hashToken, newToken, signToken, unsignToken } from '../src/auth/tokens.js'
import { hashPassword, verifyPassword } from '../src/index.js'

const SECRET = 's'.repeat(32)

describe('passwords', () => {
  it('hashes with a random salt and verifies', async () => {
    const [a, b] = await Promise.all([hashPassword('pässword'), hashPassword('pässword')])
    expect(a).not.toBe(b)
    expect(await verifyPassword('pässword', a)).toBe(true)
    expect(await verifyPassword('password', a)).toBe(false)
  })

  it('normalizes unicode before hashing', async () => {
    const hash = await hashPassword('café')
    expect(await verifyPassword('café', hash)).toBe(true)
  })

  it('never matches malformed hashes', async () => {
    for (const bad of ['', 'plain', 'bcrypt$1$2$3$4$5', 'scrypt$16384$8$1$$']) {
      expect(await verifyPassword('x', bad)).toBe(false)
    }
  })
})

describe('tokens', () => {
  it('signs and verifies', () => {
    const token = newToken()
    const signed = signToken(SECRET, token)
    expect(unsignToken(SECRET, signed)).toBe(token)
    expect(unsignToken('o'.repeat(32), signed)).toBeUndefined()
    expect(unsignToken(SECRET, `${signed}x`)).toBeUndefined()
    expect(unsignToken(SECRET, token)).toBeUndefined()
  })

  it('derives distinct hashes and CSRF tokens', () => {
    const token = newToken()
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/)
    expect(csrfToken(SECRET, token)).not.toBe(signToken(SECRET, token).split('.')[1])
    expect(newToken()).not.toBe(token)
  })
})
