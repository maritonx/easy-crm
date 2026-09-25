import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

export const MIN_PASSWORD_LENGTH = 8

// OWASP recommendation for scrypt. Parameters are stored in the hash, so they can change later.
const N = 2 ** 17
const R = 8
const P = 1
const KEY_LENGTH = 64
const MAX_MEM = 256 * 1024 * 1024

function derive(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
  length: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      length,
      { N: n, r, p, maxmem: MAX_MEM },
      (error, key) => (error ? reject(error) : resolve(key)),
    )
  })
}

/** Hashes a password as `scrypt$N$r$p$salt$hash` (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, N, R, P, KEY_LENGTH)
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$')
}

/** Checks a password against a hash in constant time. Malformed hashes never match. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltText, keyText] = stored.split('$')
  if (scheme !== 'scrypt' || !saltText || !keyText) return false
  const expected = Buffer.from(keyText, 'base64url')
  const key = await derive(
    password,
    Buffer.from(saltText, 'base64url'),
    Number(n),
    Number(r),
    Number(p),
    expected.length,
  )
  return key.length === expected.length && timingSafeEqual(key, expected)
}

let dummyHash: Promise<string> | undefined

/** Burns the same time as a real check, so response times don't reveal whether an email exists. */
export async function fakeVerify(password: string): Promise<false> {
  dummyHash ??= hashPassword('easy-cms-dummy-password')
  await verifyPassword(password, await dummyHash)
  return false
}
