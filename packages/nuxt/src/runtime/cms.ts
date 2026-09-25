import {
  type AuthUser,
  type Config,
  createEasyCMS,
  type EasyCMS,
  readCookie,
  SESSION_COOKIE,
} from '@easy-cms/core'
import { getRequestHeader, type H3Event } from 'h3'

interface Cached {
  config: Config
  promise: Promise<EasyCMS>
}

const KEY = Symbol.for('easy-cms.nuxt')
const store = globalThis as unknown as { [KEY]?: Cached }

/**
 * Returns the Easy CMS instance for this server, creating it on first use.
 * When the config module is reloaded (dev HMR) the old instance is closed.
 */
export function getEasyCMS(config: Config): Promise<EasyCMS> {
  const cached = store[KEY]
  if (cached?.config === config) return cached.promise
  if (cached) void cached.promise.then((cms) => cms.destroy()).catch(() => {})

  const promise = createEasyCMS(config)
  store[KEY] = { config, promise }
  promise.catch(() => {
    // Let the next request retry instead of caching the failure.
    if (store[KEY]?.promise === promise) delete store[KEY]
  })
  return promise
}

/** The logged-in Easy CMS user for a request (session cookie or Bearer token), or `null`. */
export async function getEasyCMSUser(config: Config, event: H3Event): Promise<AuthUser | null> {
  const cms = await getEasyCMS(config)
  const authorization = getRequestHeader(event, 'authorization')
  if (authorization?.startsWith('Bearer ')) return cms.auth.verify(authorization.slice(7).trim())
  const cookie = getRequestHeader(event, 'cookie')
  const token = cookie
    ? readCookie(new Request('http://x', { headers: { cookie } }), SESSION_COOKIE)
    : undefined
  return cms.auth.verify(token)
}
