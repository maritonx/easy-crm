import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ConfigError, findConfigFile, loadConfig } from '../src/index.js'

const fixture = (name: string) => join(import.meta.dirname, 'fixtures', name)

describe('loadConfig (FR-CFG-01)', () => {
  it('loads a TypeScript config that uses defineConfig', async () => {
    const config = await loadConfig({ cwd: fixture('ts') })
    expect(config.admin.locale).toBe('th')
    expect(config.collections.map((c) => c.slug)).toEqual(['posts'])
    expect(typeof config.collections[0]?.access?.update).toBe('function')
  })

  it('finds the config file', () => {
    expect(findConfigFile(fixture('ts'))).toBe(join(fixture('ts'), 'easy-cms.config.ts'))
    expect(findConfigFile(fixture('invalid'))).toBe(join(fixture('invalid'), 'easy-cms.config.mjs'))
  })

  it('accepts an explicit file', async () => {
    const config = await loadConfig({ cwd: fixture('.'), configFile: 'ts/easy-cms.config.ts' })
    expect(config.collections).toHaveLength(1)
  })

  it('explains how to create a config when none exists', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'easy-cms-'))
    await expect(loadConfig({ cwd: empty })).rejects.toThrow(/npx create-easy-cms/)
  })

  it('requires a default export', async () => {
    await expect(loadConfig({ cwd: fixture('no-default') })).rejects.toThrow(/no default export/)
  })

  it('validates the loaded config', async () => {
    await expect(loadConfig({ cwd: fixture('invalid') })).rejects.toThrow(ConfigError)
  })
})
