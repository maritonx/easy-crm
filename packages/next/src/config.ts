import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { CONFIG_FILE_NAMES, importConfig } from '@easy-cms/core'

/** The subset of Next's config this helper reads and sets. */
interface NextConfigLike {
  serverExternalPackages?: string[]
  outputFileTracingIncludes?: Record<string, string[]>
  [key: string]: unknown
}

type NextConfigInput =
  | NextConfigLike
  | ((
      phase: string,
      ctx: { defaultConfig: NextConfigLike },
    ) => NextConfigLike | Promise<NextConfigLike>)

export interface WithEasyCMSOptions {
  /** Path to the Easy CMS config, relative to the project root. Default: `easy-cms.config.ts` (or .mts/.js/.mjs). */
  readonly configPath?: string
}

/**
 * Packages Next must load from node_modules instead of bundling: they read files next to
 * themselves (the admin app, PGlite's WebAssembly) or load native binaries.
 */
export const SERVER_EXTERNAL_PACKAGES = [
  '@easy-cms/core',
  '@easy-cms/admin',
  '@easy-cms/drizzle',
  '@easy-cms/db-sqlite',
  '@easy-cms/db-postgres',
  '@libsql/client',
  'libsql',
  '@electric-sql/pglite',
  'drizzle-kit',
  'drizzle-orm',
  'postgres',
  'sharp',
  'jiti',
]

/**
 * Wraps `next.config.ts` so the server build includes what Easy CMS needs at runtime:
 *
 * ```ts
 * import { withEasyCMS } from '@easy-cms/next/config'
 * export default withEasyCMS({ ... })
 * ```
 */
export function withEasyCMS(nextConfig: NextConfigInput = {}, options: WithEasyCMSOptions = {}) {
  return async (phase: string, ctx: { defaultConfig: NextConfigLike }): Promise<NextConfigLike> => {
    const base = typeof nextConfig === 'function' ? await nextConfig(phase, ctx) : nextConfig
    const root = process.cwd()
    const include = [...(await tracedFiles(root, options.configPath))]
    return {
      ...base,
      serverExternalPackages: [
        ...new Set([...(base.serverExternalPackages ?? []), ...SERVER_EXTERNAL_PACKAGES]),
      ],
      outputFileTracingIncludes: {
        ...base.outputFileTracingIncludes,
        '/**': [...(base.outputFileTracingIncludes?.['/**'] ?? []), ...include],
      },
    }
  }
}

/** Files the standalone output needs that static tracing cannot see, as globs relative to the project. */
async function tracedFiles(root: string, configPath: string | undefined): Promise<string[]> {
  const toGlob = (path: string) => relative(root, path).replace(/\\/g, '/')
  const files = ['easy-cms/migrations/**']

  // The admin SPA is read from disk by the admin route handler.
  try {
    const adminPackage = createRequire(join(root, 'package.json')).resolve(
      '@easy-cms/admin/package.json',
    )
    files.push(`${toGlob(join(dirname(adminPackage), 'dist/app'))}/**`)
  } catch {
    // @easy-cms/admin comes with @easy-cms/next; if it cannot be resolved there is nothing to add.
  }

  // Native binaries the database adapter loads dynamically (e.g. libsql).
  const file = configPath
    ? isAbsolute(configPath)
      ? configPath
      : resolve(root, configPath)
    : CONFIG_FILE_NAMES.map((name) => join(root, name)).find((path) => existsSync(path))
  if (file && existsSync(file)) {
    try {
      const config = await importConfig(file)
      for (const path of config?.db?.bundle?.traceInclude ?? []) files.push(toGlob(path))
    } catch (error) {
      console.warn(`[easy-cms] Could not read ${file} at build time: ${(error as Error).message}`)
    }
  }
  return files
}
