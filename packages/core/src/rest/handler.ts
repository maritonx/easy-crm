import type { AuthUser } from '../access.js'
import type { Session } from '../auth/auth.js'
import { safeEqual } from '../auth/tokens.js'
import { INTERNAL_COLLECTIONS, MEDIA, USERS } from '../builtins.js'
import type { Config } from '../config.js'
import {
  EasyCMSError,
  ForbiddenError,
  NotFoundError,
  PayloadTooLargeError,
  UnauthorizedError,
  ValidationError,
} from '../errors.js'
import type { EasyCMS } from '../local-api.js'
import { EXTENSIONS } from '../media.js'
import { adminSchema } from './admin-schema.js'
import { parseDepth, parseListQuery } from './query.js'

export const SESSION_COOKIE = 'ecms-session'
export const CSRF_COOKIE = 'ecms-csrf'
export const CSRF_HEADER = 'x-csrf-token'
const MAX_BODY_BYTES = 1024 * 1024

export interface RestHandlerOptions {
  /** Path the handler is mounted at. Default: `routes.api` from the config (`/api/cms`). */
  readonly basePath?: string
  /** Client IP, used with the email to rate-limit logins. Adapters provide it. */
  readonly getClientIp?: (request: Request) => string | undefined
}

export type RestHandler = (request: Request) => Promise<Response>

class HttpError extends EasyCMSError {}

interface Context {
  readonly request: Request
  readonly url: URL
  readonly user: AuthUser | null
  /** How the request authenticated; cookie auth needs CSRF protection. */
  readonly via: 'cookie' | 'bearer' | null
  readonly token: string | undefined
  readonly headers: Headers
}

/** Creates the REST API as a Web-standard `(Request) => Response` handler. */
export function createRestHandler<C extends Config>(
  instance: EasyCMS<C>,
  options: RestHandlerOptions = {},
): RestHandler {
  // The handler works with any collection by slug, so it uses the untyped API.
  const cms = instance as unknown as EasyCMS
  const basePath = (options.basePath ?? cms.config.routes.api).replace(/\/+$/, '')
  const production = process.env.NODE_ENV === 'production'

  return async (request) => {
    const headers = new Headers({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    })
    try {
      const url = new URL(request.url)
      if (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) {
        throw new HttpError('Not found', 404)
      }
      const segments = url.pathname
        .slice(basePath.length)
        .split('/')
        .filter(Boolean)
        .map((s) => decodeURIComponent(s))

      const { token, via } = readToken(request)
      const user = token ? await cms.auth.verify(token) : null
      const ctx: Context = { request, url, user, via: user ? via : null, token, headers }

      const method = request.method.toUpperCase()
      if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') checkCsrf(cms, ctx)

      const result = await route(cms, ctx, method, segments, options)
      if (result.body instanceof Response) return result.body
      return new Response(JSON.stringify(result.body), { status: result.status ?? 200, headers })
    } catch (error) {
      return errorResponse(cms, error, headers, production)
    }
  }
}

interface Result {
  body: unknown
  status?: number
}

async function route(
  cms: EasyCMS,
  ctx: Context,
  method: string,
  segments: string[],
  options: RestHandlerOptions,
): Promise<Result> {
  const [first, second, third] = segments
  const access = { overrideAccess: false, user: ctx.user } as const
  // Drafts are only for logged-in users; anonymous requests always see published documents.
  const draft = ctx.user !== null && ctx.url.searchParams.get('draft') === 'true'

  if (segments.length === 0) throw new HttpError('Not found', 404)

  // Auth endpoints
  if (first === USERS && second !== undefined && third === undefined && !/^\d+$/.test(second)) {
    switch (`${method} ${second}`) {
      case 'POST login': {
        const body = await readJson(ctx.request)
        const session = await cms.auth.login({
          email: String(body.email ?? ''),
          password: String(body.password ?? ''),
          ip: options.getClientIp?.(ctx.request),
        })
        setSessionCookies(cms, ctx, session)
        return {
          body: { user: session.user, exp: session.expiresAt, csrfToken: session.csrfToken },
        }
      }
      case 'POST logout': {
        if (ctx.token) await cms.auth.logout(ctx.token)
        clearSessionCookies(ctx)
        return { body: { message: 'Logged out' } }
      }
      case 'GET me': {
        const csrfToken =
          ctx.via === 'cookie' && ctx.token ? cms.auth.csrfFor(ctx.token) : undefined
        if (csrfToken)
          ctx.headers.append('set-cookie', cookie(ctx, CSRF_COOKIE, csrfToken, { httpOnly: false }))
        return { body: { user: ctx.user, ...(csrfToken ? { csrfToken } : {}) } }
      }
      case 'GET init':
        return { body: { hasUsers: await cms.auth.hasUsers() } }
      case 'POST first-register': {
        const body = await readJson(ctx.request)
        const session = await cms.auth.registerFirstUser({
          email: String(body.email ?? ''),
          password: String(body.password ?? ''),
          ...(typeof body.name === 'string' ? { name: body.name } : {}),
        })
        setSessionCookies(cms, ctx, session)
        return {
          status: 201,
          body: { user: session.user, exp: session.expiresAt, csrfToken: session.csrfToken },
        }
      }
    }
    throw new HttpError('Not found', 404)
  }

  // Admin UI metadata
  if (first === 'admin') {
    if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
    if (!ctx.user) throw new UnauthorizedError()
    if (second === 'schema' && third === undefined)
      return { body: await adminSchema(cms, ctx.user) }
    // /admin/access/:collection/:id → what the user may do with that document
    const [, , collection, id, extra] = segments
    if (second === 'access' && collection && id && extra === undefined) {
      if (
        INTERNAL_COLLECTIONS.has(collection) ||
        !cms.config.collections.some((c) => c.slug === collection)
      ) {
        throw new HttpError(`Unknown collection "${collection}"`, 404)
      }
      return { body: await cms.documentPermissions(collection, id, ctx.user) }
    }
    throw new HttpError('Not found', 404)
  }

  // Globals
  if (first === 'globals') {
    if (!second || third !== undefined) throw new HttpError('Not found', 404)
    if (!cms.config.globals.some((g) => g.slug === second))
      throw new HttpError(`Unknown global "${second}"`, 404)
    if (method === 'GET')
      return { body: await cms.findGlobal(second, { ...access, ...parseDepth(ctx.url), draft }) }
    if (method === 'POST') {
      const body = await readJson(ctx.request)
      return { body: await cms.updateGlobal(second, body, { ...access, ...parseDepth(ctx.url) }) }
    }
    throw methodNotAllowed(ctx, 'GET, POST')
  }

  // Media files are public and immutable (their names are unique).
  if (first === MEDIA && second === 'file' && third !== undefined && segments.length === 3) {
    if (method !== 'GET' && method !== 'HEAD') throw methodNotAllowed(ctx, 'GET, HEAD')
    return { body: await serveFile(cms, third, method === 'HEAD') }
  }
  if (first === MEDIA && second === undefined && method === 'POST') {
    const { file, data } = await readUpload(ctx.request, cms.config.upload.maxFileSize)
    return {
      status: 201,
      body: await cms.upload(file, data, { ...access, ...parseDepth(ctx.url) }),
    }
  }

  // Collections
  const collection = first as string
  if (
    INTERNAL_COLLECTIONS.has(collection) ||
    !cms.config.collections.some((c) => c.slug === collection)
  ) {
    throw new HttpError(`Unknown collection "${collection}"`, 404)
  }
  if (third !== undefined) throw new HttpError('Not found', 404)

  if (second === undefined) {
    if (method === 'GET') {
      const query = parseListQuery(ctx.url)
      return { body: await cms.find(collection, { ...access, ...query, draft }) }
    }
    if (method === 'POST') {
      const body = await readJson(ctx.request)
      return {
        status: 201,
        body: await cms.create(collection, body, { ...access, ...parseDepth(ctx.url) }),
      }
    }
    throw methodNotAllowed(ctx, 'GET, POST')
  }

  const id = second
  if (method === 'GET') {
    const doc = await cms.findById(collection, id, { ...access, ...parseDepth(ctx.url), draft })
    if (!doc) throw new NotFoundError(collection, id)
    return { body: doc }
  }
  if (method === 'PATCH') {
    const body = await readJson(ctx.request)
    const doc = await cms.update(collection, id, body, { ...access, ...parseDepth(ctx.url) })
    // Changing your own password ends every session; start a fresh one for this browser.
    if (
      collection === USERS &&
      body.password &&
      ctx.user &&
      String(ctx.user.id) === String(doc.id) &&
      ctx.via === 'cookie'
    ) {
      setSessionCookies(cms, ctx, await cms.auth.createSession(doc.id))
    }
    return { body: doc }
  }
  if (method === 'DELETE') {
    return { body: await cms.delete(collection, id, access) }
  }
  throw methodNotAllowed(ctx, 'GET, PATCH, DELETE')
}

function methodNotAllowed(ctx: Context, allow: string) {
  ctx.headers.set('allow', allow)
  return new HttpError('Method not allowed', 405)
}

function readToken(request: Request): {
  token: string | undefined
  via: 'cookie' | 'bearer' | null
} {
  const authorization = request.headers.get('authorization')
  if (authorization?.startsWith('Bearer '))
    return { token: authorization.slice(7).trim(), via: 'bearer' }
  const token = readCookie(request, SESSION_COOKIE)
  return { token, via: token ? 'cookie' : null }
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq).trim() === name)
      return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return undefined
}

/**
 * Blocks cross-site writes (NFR-SEC-01): the Origin must be ours or trusted,
 * and cookie-authenticated requests must echo the session's CSRF token.
 */
function checkCsrf(cms: EasyCMS, ctx: Context) {
  const origin = ctx.request.headers.get('origin')
  const fetchSite = ctx.request.headers.get('sec-fetch-site')
  const trusted =
    origin !== null &&
    (origin === ctx.url.origin || cms.config.auth.trustedOrigins.includes(origin))
  if (origin !== null && !trusted) throw new ForbiddenError('CSRF check failed: untrusted origin')
  if (origin === null && fetchSite === 'cross-site')
    throw new ForbiddenError('CSRF check failed: cross-site request')

  if (ctx.via === 'cookie' && ctx.token) {
    const expected = cms.auth.csrfFor(ctx.token)
    const given = ctx.request.headers.get(CSRF_HEADER)
    if (!expected || !given || !safeEqual(given, expected)) {
      throw new ForbiddenError(
        `CSRF check failed: send the ${CSRF_HEADER} header from GET /users/me`,
      )
    }
  }
}

const TYPE_BY_EXTENSION = Object.fromEntries(
  Object.entries(EXTENSIONS).map(([type, ext]) => [ext, type]),
)

/** Serves a stored file with headers that stop uploaded SVG from running scripts. */
async function serveFile(cms: EasyCMS, key: string, head: boolean): Promise<Response> {
  if (!/^[\p{L}\p{M}\p{N}-]+\.[a-z0-9]+$/u.test(key)) throw new HttpError('Not found', 404)
  const file = await cms.storage.get(key)
  if (!file) throw new HttpError('Not found', 404)
  const extension = key.slice(key.lastIndexOf('.') + 1)
  return new Response(
    head ? null : (file.body as unknown as ConstructorParameters<typeof Response>[0]),
    {
      status: 200,
      headers: {
        'content-type': TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream',
        'content-length': String(file.size),
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        'content-security-policy':
          "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
        'cross-origin-resource-policy': 'cross-origin',
      },
    },
  )
}

/** Reads `multipart/form-data` with a `file` part; other string parts become document data. */
async function readUpload(
  request: Request,
  maxFileSize: number,
): Promise<{ file: { data: Uint8Array; name: string }; data: Record<string, unknown> }> {
  const type = request.headers.get('content-type') ?? ''
  if (!type.toLowerCase().startsWith('multipart/form-data')) {
    throw new HttpError('Uploads must be multipart/form-data with a "file" field', 415)
  }
  const declared = Number(request.headers.get('content-length') ?? 0)
  // Leave room for the multipart envelope and the other fields.
  if (declared > maxFileSize + 64 * 1024)
    throw new PayloadTooLargeError(`File is larger than ${maxFileSize} bytes`)
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    throw new HttpError('Malformed multipart body', 400)
  }
  const file = form.get('file')
  if (!file || typeof file === 'string')
    throw new ValidationError(MEDIA, [{ field: 'file', message: 'is required' }])
  const data: Record<string, unknown> = {}
  for (const [key, value] of form) {
    if (key !== 'file' && typeof value === 'string') data[key] = value
  }
  return {
    file: { data: new Uint8Array(await file.arrayBuffer()), name: file.name || 'file' },
    data,
  }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get('content-type') ?? ''
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new HttpError('Content-Type must be application/json', 415)
  }
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY_BYTES) throw new HttpError('Request body too large', 413)
  const text = await request.text()
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new HttpError('Request body too large', 413)
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new HttpError('Request body is not valid JSON', 400)
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError('Request body must be a JSON object', 400)
  }
  return body as Record<string, unknown>
}

function isSecure(ctx: Context) {
  return ctx.url.protocol === 'https:' || process.env.NODE_ENV === 'production'
}

function cookie(
  ctx: Context,
  name: string,
  value: string,
  opts: { httpOnly: boolean; maxAge?: number },
) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax']
  if (opts.httpOnly) parts.push('HttpOnly')
  if (isSecure(ctx)) parts.push('Secure')
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`)
  return parts.join('; ')
}

function setSessionCookies(cms: EasyCMS, ctx: Context, session: Session) {
  const maxAge = cms.config.auth.tokenExpiration
  ctx.headers.append(
    'set-cookie',
    cookie(ctx, SESSION_COOKIE, session.token, { httpOnly: true, maxAge }),
  )
  ctx.headers.append(
    'set-cookie',
    cookie(ctx, CSRF_COOKIE, session.csrfToken, { httpOnly: false, maxAge }),
  )
}

function clearSessionCookies(ctx: Context) {
  ctx.headers.append('set-cookie', cookie(ctx, SESSION_COOKIE, '', { httpOnly: true, maxAge: 0 }))
  ctx.headers.append('set-cookie', cookie(ctx, CSRF_COOKIE, '', { httpOnly: false, maxAge: 0 }))
}

function errorResponse(
  cms: EasyCMS,
  error: unknown,
  headers: Headers,
  production: boolean,
): Response {
  if (error instanceof EasyCMSError) {
    const errors =
      error instanceof ValidationError
        ? error.errors.map((e) => ({ message: e.message, field: e.field }))
        : [{ message: error.message }]
    if (error instanceof UnauthorizedError) headers.set('www-authenticate', 'Bearer')
    return new Response(JSON.stringify({ errors }), { status: error.status, headers })
  }
  const message = error instanceof Error ? error.message : String(error)
  cms.logger.error(
    `REST request failed: ${error instanceof Error ? (error.stack ?? message) : message}`,
  )
  const body = { errors: [{ message: production ? 'Internal Server Error' : message }] }
  return new Response(JSON.stringify(body), { status: 500, headers })
}
