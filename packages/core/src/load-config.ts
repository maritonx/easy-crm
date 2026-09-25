import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createJiti } from 'jiti'
import type { Config, ResolvedConfig } from './config.js'
import { resolveConfig } from './resolve-config.js'

export const CONFIG_FILE_NAMES = [
  'easy-cms.config.ts',
  'easy-cms.config.mts',
  'easy-cms.config.js',
  'easy-cms.config.mjs',
] as const

export interface LoadConfigOptions {
  /** Directory to search. Default `process.cwd()`. */
  readonly cwd?: string
  /** Explicit config file path, relative to `cwd`. */
  readonly configFile?: string
}

/** Finds the config file in `cwd`, returning its absolute path or `undefined`. */
export function findConfigFile(cwd: string = process.cwd()): string | undefined {
  for (const name of CONFIG_FILE_NAMES) {
    const path = resolve(cwd, name)
    if (existsSync(path)) return path
  }
  return undefined
}

/** Loads `easy-cms.config.ts` (or `.mts`/`.js`/`.mjs`) and resolves it. */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<ResolvedConfig> {
  const cwd = options.cwd ?? process.cwd()
  const file = options.configFile ? resolve(cwd, options.configFile) : findConfigFile(cwd)

  if (!file || !existsSync(file)) {
    const looked = options.configFile ?? CONFIG_FILE_NAMES.join(', ')
    throw new Error(
      `Easy CMS config not found in ${cwd} (looked for ${looked}).\n    → run \`npx create-easy-cms\` to create one`,
    )
  }

  const jiti = createJiti(import.meta.url, { moduleCache: false, interopDefault: false })
  const mod = await jiti.import<{ default?: Config }>(file)
  if (!mod.default) {
    throw new Error(`${file} has no default export.\n    → export default defineConfig({ ... })`)
  }
  return resolveConfig(mod.default)
}
