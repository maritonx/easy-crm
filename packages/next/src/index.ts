import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { createAdminHandler } from '@easy-cms/admin'
import {
  type AuthUser,
  type Config,
  createEasyCMS,
  createRestHandler,
  type EasyCMS,
  readCookie,
  resolveConfig,
  SESSION_COOKIE,
} from '@easy-cms/core'

type Handler = (request: Request) => Promise<Response>

interface Cached {
  config: Config
  promise: Promise<unknown>
}

const KEY = Symbol.for('easy-cms.next')
const store = globalThis as unknown as { [KEY]?: Cached }

/**
 * The Easy CMS Local API for this server, typed from your config. Use it in Server
 * Components, Route Handlers and Server Actions. The instance survives hot reloads.
 */
export function getEasyCMS<const C extends Config>(config: C): Promise<EasyCMS<C>> {
  const cached = store[KEY]
  if (cached?.config === config) return cached.promise as Promise<EasyCMS<C>>
  if (cached) void (cached.promise as Promise<EasyCMS>).then((cms) => cms.destroy()).catch(() => {})
  const promise = createEasyCMS(config)
  store[KEY] = { config, promise }
  promise.catch(() => {
    // Let the next call retry instead of caching the failure.
    if (store[KEY]?.promise === promise) delete store[KEY]
  })
  return promise
}

export interface RouteHandlerOptions {
  /** Use `X-Forwarded-For` for the client IP (login rate limiting). Enable behind a proxy you trust, e.g. Vercel. */
  readonly trustProxy?: boolean
}

/**
 * REST API route handlers. In `app/api/cms/[...path]/route.ts` (matching `routes.api`):
 *
 * ```ts
 * import config from '@/easy-cms.config'
 * import { createRouteHandlers } from '@easy-cms/next'
 * export const { GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS } = createRouteHandlers(config)
 * ```
 */
export function createRouteHandlers(config: Config, options: RouteHandlerOptions = {}) {
  const handlers = new WeakMap<EasyCMS, Handler>()
  const handle: Handler = async (request) => {
    const cms = (await getEasyCMS(config)) as EasyCMS
    let handler = handlers.get(cms)
    if (!handler) {
      handler = createRestHandler(cms, {
        getClientIp: (r) =>
          options.trustProxy
            ? r.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined
            : undefined,
      })
      handlers.set(cms, handler)
    }
    return handler(request)
  }
  return {
    GET: handle,
    HEAD: handle,
    POST: handle,
    PATCH: handle,
    PUT: handle,
    DELETE: handle,
    OPTIONS: handle,
  }
}

/**
 * Admin UI route handlers. In `app/admin/[[...path]]/route.ts` (matching `admin.path`):
 *
 * ```ts
 * import config from '@/easy-cms.config'
 * import { createAdminRouteHandlers } from '@easy-cms/next'
 * export const { GET, HEAD } = createAdminRouteHandlers(config)
 * ```
 */
export function createAdminRouteHandlers(config: Config, options: { appDir?: string } = {}) {
  let handler: Promise<Handler> | undefined
  const handle: Handler = async (request) => {
    handler ??= resolveConfig(config).then((resolved) =>
      createAdminHandler({
        basePath: resolved.admin.path,
        apiPath: resolved.routes.api,
        locale: resolved.admin.locale,
        appDir: options.appDir ?? adminAppDir(),
        // Next.js strips trailing slashes; redirecting back would loop.
        trailingSlashRedirect: false,
      }),
    )
    return (await handler)(request)
  }
  return { GET: handle, HEAD: handle }
}

/** The logged-in Easy CMS user for the current request (session cookie or Bearer token), or `null`. */
export async function getEasyCMSUser(config: Config): Promise<AuthUser | null> {
  // next/headers only works inside a request; import it lazily so this module loads anywhere.
  const { headers } = await import('next/headers.js')
  const all = await headers()
  const cms = (await getEasyCMS(config)) as EasyCMS
  const authorization = all.get('authorization')
  if (authorization?.startsWith('Bearer ')) return cms.auth.verify(authorization.slice(7).trim())
  const cookie = all.get('cookie')
  const token = cookie
    ? readCookie(new Request('http://x', { headers: { cookie } }), SESSION_COOKIE)
    : undefined
  return cms.auth.verify(token)
}

/**
 * Where the built admin app is on disk. Next may bundle this package, so instead of relying on
 * `import.meta.url` follow the real dependency chain: project → @easy-cms/next → @easy-cms/admin.
 */
function adminAppDir(): string {
  const fromProject = createRequire(join(process.cwd(), 'package.json'))
  const nextPackage = fromProject.resolve('@easy-cms/next/package.json')
  const adminPackage = createRequire(nextPackage).resolve('@easy-cms/admin/package.json')
  return join(dirname(adminPackage), 'dist/app')
}
