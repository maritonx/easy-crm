import { DEFAULT_ROLES, internalCollections, withMedia, withUsers } from './builtins.js'
import type { Config, ResolvedConfig } from './config.js'
import { ConfigError } from './errors.js'
import { validateConfig } from './validate-config.js'

export const DEFAULT_ADMIN_PATH = '/admin'
export const DEFAULT_API_PATH = '/api/cms'
export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024
export const DEFAULT_TOKEN_EXPIRATION = 7 * 24 * 60 * 60

const resolved = new WeakSet<object>()

/**
 * Runs plugins in order, adds the built-in collections, validates the result
 * and fills in defaults. Throws `ConfigError`. Resolving twice is a no-op.
 */
export async function resolveConfig(input: Config | ResolvedConfig): Promise<ResolvedConfig> {
  if (resolved.has(input)) return input as ResolvedConfig

  let config = input as Config
  const plugins = Array.isArray(config?.plugins) ? config.plugins : []
  for (const plugin of plugins) {
    if (typeof plugin !== 'function') break // reported by validateConfig
    config = await plugin(config)
  }
  if (typeof config === 'object' && config !== null && Array.isArray(config.collections ?? [])) {
    config = withMedia(withUsers(config))
  }

  const issues = validateConfig(config)
  if (issues.length > 0) throw new ConfigError(issues)

  const { plugins: _plugins, ...rest } = config
  const result: ResolvedConfig = {
    ...rest,
    routes: { api: `/${(config.routes?.api ?? DEFAULT_API_PATH).replace(/^\/+|\/+$/g, '')}` },
    admin: {
      path: config.admin?.path ?? DEFAULT_ADMIN_PATH,
      locale: config.admin?.locale ?? 'en',
    },
    upload: {
      dir: config.upload?.dir ?? 'uploads',
      maxFileSize: config.upload?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
      mimeTypes: config.upload?.mimeTypes ?? ['image/*', 'application/pdf'],
      imageSizes: config.upload?.imageSizes ?? [],
      ...(config.upload?.storage ? { storage: config.upload.storage } : {}),
    },
    auth: {
      roles: config.auth?.roles ?? DEFAULT_ROLES,
      tokenExpiration: config.auth?.tokenExpiration ?? DEFAULT_TOKEN_EXPIRATION,
      maxLoginAttempts: config.auth?.maxLoginAttempts ?? 5,
      lockWindow: config.auth?.lockWindow ?? 15 * 60,
      trustedOrigins: config.auth?.trustedOrigins ?? [],
    },
    collections: [...(config.collections ?? []), ...internalCollections],
    globals: config.globals ?? [],
  }
  resolved.add(result)
  return result
}
