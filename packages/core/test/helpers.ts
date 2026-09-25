import type { Config, DatabaseAdapter } from '../src/index.js'

export const SECRET = 'x'.repeat(32)

/** Satisfies the config type; tests here never connect. */
export const fakeDb: DatabaseAdapter = {
  name: 'fake',
  init: () => Promise.reject(new Error('fake database')),
}

export function baseConfig(overrides: Partial<Config> = {}): Config {
  return { secret: SECRET, db: fakeDb, ...overrides }
}
