import type { Config, ResolvedConfig } from './config.js'
import { ConfigError } from './errors.js'
import { validateConfig } from './validate-config.js'

export const DEFAULT_ADMIN_PATH = '/admin'
export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024

/** Runs plugins in order, validates the result and fills in defaults. Throws `ConfigError`. */
export async function resolveConfig(input: Config): Promise<ResolvedConfig> {
  let config = input
  const plugins = Array.isArray(input?.plugins) ? input.plugins : []
  for (const plugin of plugins) {
    if (typeof plugin !== 'function') break // reported by validateConfig
    config = await plugin(config)
  }

  const issues = validateConfig(config)
  if (issues.length > 0) throw new ConfigError(issues)

  const { plugins: _plugins, ...rest } = config
  return {
    ...rest,
    admin: {
      path: config.admin?.path ?? DEFAULT_ADMIN_PATH,
      locale: config.admin?.locale ?? 'en',
    },
    upload: {
      dir: config.upload?.dir ?? 'uploads',
      maxFileSize: config.upload?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
      mimeTypes: config.upload?.mimeTypes ?? ['image/*', 'application/pdf'],
    },
    collections: config.collections ?? [],
    globals: config.globals ?? [],
  }
}
