import { settings } from './settings'

export interface ApiErrorItem {
  message: string
  field?: string
}

export class ApiError extends Error {
  readonly status: number
  readonly errors: ApiErrorItem[]

  constructor(status: number, errors: ApiErrorItem[]) {
    super(errors.map((e) => e.message).join('; ') || `Request failed (${status})`)
    this.status = status
    this.errors = errors
  }

  /** Validation messages keyed by field path. */
  get fieldErrors(): Record<string, string[]> {
    const map: Record<string, string[]> = {}
    for (const e of this.errors) {
      if (!e.field) continue
      map[e.field] = [...(map[e.field] ?? []), e.message]
    }
    return map
  }
}

function cookie(name: string): string | undefined {
  for (const part of document.cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

/** Called when the API says the session is gone, so the app can go to the login page. */
let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' }
  const multipart = body instanceof FormData
  // The browser sets the multipart boundary itself.
  if (body !== undefined && !multipart) headers['content-type'] = 'application/json'
  const csrf = cookie('ecms-csrf')
  if (csrf && method !== 'GET') headers['x-csrf-token'] = csrf

  const response = await fetch(`${settings.apiPath}${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    ...(body !== undefined ? { body: multipart ? body : JSON.stringify(body) } : {}),
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : undefined
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/users/')) onUnauthorized()
    throw new ApiError(response.status, (data?.errors as ApiErrorItem[]) ?? [])
  }
  return data as T
}

/** Builds a bracket query string: `{ where: { title: { like: 'x' } } }` → `where[title][like]=x`. */
export function toQuery(params: Record<string, unknown>): string {
  const parts: string[] = []
  const walk = (prefix: string, value: unknown) => {
    if (value === undefined || value === null || value === '') return
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>))
        walk(prefix ? `${prefix}[${k}]` : k, v)
    } else {
      parts.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`)
    }
  }
  walk('', params)
  return parts.length ? `?${parts.join('&')}` : ''
}

export interface Paginated<T> {
  docs: T[]
  totalDocs: number
  limit: number
  page: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

export type Doc = Record<string, unknown> & { id: number | string }

/** Uploads one file to the media library. */
export function uploadFile(file: File, alt?: string): Promise<Doc> {
  const form = new FormData()
  form.set('file', file)
  if (alt) form.set('alt', alt)
  return api<Doc>('POST', '/media?depth=0', form)
}
