import type { Config } from '../src/index.js'

export const SECRET = 'x'.repeat(32)

export function baseConfig(overrides: Partial<Config> = {}): Config {
  return { secret: SECRET, db: { name: 'test' }, ...overrides }
}
