import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** A new random session token (sent to the client, never stored). */
export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

/** What the database stores instead of the token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function hmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

/** Cookie value: `<token>.<signature>`, so forged cookies are rejected without a database lookup. */
export function signToken(secret: string, token: string): string {
  return `${token}.${hmac(secret, `session:${token}`)}`
}

/** Returns the token if the signature is valid. */
export function unsignToken(secret: string, value: string): string | undefined {
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return undefined
  const token = value.slice(0, dot)
  return safeEqual(value.slice(dot + 1), hmac(secret, `session:${token}`)) ? token : undefined
}

/** CSRF token bound to the session: the client echoes it in a header. */
export function csrfToken(secret: string, token: string): string {
  return hmac(secret, `csrf:${token}`)
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
