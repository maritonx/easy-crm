import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface AdminHandlerOptions {
  /** Where the admin UI is served. Default `/admin`. */
  readonly basePath?: string
  /** Where the REST API is served. Default `/api/cms`. */
  readonly apiPath?: string
  /** Default UI language before the user picks one. Default `en`. */
  readonly locale?: 'en' | 'th'
  /** Directory with the built app. Defaults to the one shipped in this package. */
  readonly appDir?: string
  /**
   * Redirect `/admin` to `/admin/`. Default true. Turn off for frameworks that strip trailing
   * slashes (Next.js); the app works at either URL because of its `<base href>`.
   */
  readonly trailingSlashRedirect?: boolean
}

export type AdminHandler = (request: Request) => Promise<Response>

/**
 * The built admin app shipped with this package. Computed from this file's path rather than
 * `new URL(..., import.meta.url)`, which bundlers rewrite into asset imports.
 */
export const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'app')

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

/** Security headers for every admin response (NFR-SEC-04). */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    // Tiptap and Vue transitions set inline style attributes.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "connect-src 'self'",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; '),
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
  'x-content-type-options': 'nosniff',
}

/** The SPA's HTML entry inside the app directory. */
export const SHELL_FILE = 'shell.html'

const escapeAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const trimSlashes = (path: string) => `/${path.replace(/^\/+|\/+$/g, '')}`

/** Injects `<base href>` and the settings the app reads at startup into the shell HTML. */
export function renderShell(
  source: string,
  options: Omit<AdminHandlerOptions, 'appDir'> = {},
): string {
  const basePath = trimSlashes(options.basePath ?? '/admin')
  const settings = JSON.stringify({
    adminPath: basePath,
    apiPath: trimSlashes(options.apiPath ?? '/api/cms'),
    locale: options.locale ?? 'en',
  })
  return source.replace(
    '<head>',
    `<head>\n    <base href="${escapeAttr(`${basePath}/`)}">\n    <meta name="easy-cms" content="${escapeAttr(settings)}">`,
  )
}

/** Serves the admin SPA: static assets, and index.html for every other path under `basePath`. */
export function createAdminHandler(options: AdminHandlerOptions = {}): AdminHandler {
  const basePath = trimSlashes(options.basePath ?? '/admin')
  const appDir = options.appDir ?? APP_DIR
  let shell: Promise<string> | undefined
  const html = () => {
    shell ??= readFile(join(appDir, SHELL_FILE), 'utf8').then((source) =>
      renderShell(source, options),
    )
    return shell
  }

  return async (request) => {
    const url = new URL(request.url)
    const headers = new Headers(SECURITY_HEADERS)
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      headers.set('allow', 'GET, HEAD')
      return new Response('Method not allowed', { status: 405, headers })
    }
    if (url.pathname === basePath && options.trailingSlashRedirect !== false) {
      headers.set('location', `${basePath}/${url.search}`)
      return new Response(null, { status: 308, headers })
    }
    if (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`))
      return new Response('Not found', { status: 404, headers })

    let relative: string
    try {
      relative = decodeURIComponent(url.pathname.slice(basePath.length + 1))
    } catch {
      return new Response('Bad request', { status: 400, headers })
    }
    const file = normalize(join(appDir, relative))

    // Static files: only inside the app directory, never the shell directly (it needs injection).
    if (
      relative !== '' &&
      relative !== SHELL_FILE &&
      file.startsWith(appDir + sep) &&
      extname(file) !== ''
    ) {
      const info = await stat(file).catch(() => undefined)
      if (info?.isFile()) {
        headers.set('content-type', TYPES[extname(file)] ?? 'application/octet-stream')
        // Vite puts content hashes in asset names, so they never change.
        headers.set(
          'cache-control',
          relative.startsWith('assets/')
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=3600',
        )
        const body = request.method === 'HEAD' ? null : await readFile(file)
        return new Response(body, { status: 200, headers })
      }
      if (relative.startsWith('assets/')) return new Response('Not found', { status: 404, headers })
    }

    headers.set('content-type', TYPES['.html'] as string)
    headers.set('cache-control', 'no-store')
    return new Response(request.method === 'HEAD' ? null : await html(), { status: 200, headers })
  }
}
