import { type Config, createRestHandler, type EasyCMS, type RestHandler } from '@easy-cms/core'
import { defineEventHandler, getRequestIP, sendWebResponse, toWebRequest } from 'h3'
import { getEasyCMS } from './cms.js'

export interface HandlerOptions {
  readonly basePath: string
  /** Trust `X-Forwarded-For` for the client IP (only behind a proxy you control). */
  readonly trustProxy: boolean
}

/** Mounts the Easy CMS REST API as a Nitro event handler. */
export function createHandler(config: Config, options: HandlerOptions) {
  const handlers = new WeakMap<EasyCMS, RestHandler>()
  const clientIps = new WeakMap<Request, string | undefined>()

  return defineEventHandler(async (event) => {
    const cms = await getEasyCMS(config)
    let handler = handlers.get(cms)
    if (!handler) {
      handler = createRestHandler(cms, {
        basePath: options.basePath,
        getClientIp: (r) => clientIps.get(r),
      })
      handlers.set(cms, handler)
    }
    const request = toWebRequest(event)
    clientIps.set(request, getRequestIP(event, { xForwardedFor: options.trustProxy }))
    return sendWebResponse(event, await handler(request))
  })
}
