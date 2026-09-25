import type { Where } from '../access.js'
import { QueryError } from '../errors.js'

const MAX_DEPTH = 10
const MAX_INDEX = 100
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

type Node = { [key: string]: Node | string }

/** Splits `where[or][0][title][equals]` into `['where', 'or', '0', 'title', 'equals']`. */
function tokens(key: string): string[] {
  const match = /^([^[\]]+)((?:\[[^[\]]*\])*)$/.exec(key)
  if (!match) throw new QueryError(`Malformed query parameter "${key}"`)
  const rest = [...(match[2] ?? '').matchAll(/\[([^[\]]*)\]/g)].map((m) => m[1] as string)
  return [match[1] as string, ...rest]
}

/** Objects keyed 0..n become arrays. */
function arrays(node: Node | string): unknown {
  if (typeof node === 'string') return node
  const keys = Object.keys(node)
  const out: Record<string, unknown> = {}
  for (const key of keys) out[key] = arrays(node[key] as Node | string)
  if (keys.length > 0 && keys.every((k, i) => k === String(i))) return keys.map((k) => out[k])
  return out
}

/** Parses bracket-style query parameters (`where[title][equals]=x`) into nested objects. */
export function parseNested(params: URLSearchParams): Record<string, unknown> {
  const root: Node = {}
  for (const [key, value] of params) {
    const path = tokens(key)
    if (path.length > MAX_DEPTH)
      throw new QueryError(`Query parameter "${key}" is nested too deeply`)
    let node = root
    path.forEach((token, i) => {
      if (FORBIDDEN_KEYS.has(token)) throw new QueryError(`Query parameter "${key}" is not allowed`)
      if (/^\d+$/.test(token) && Number(token) > MAX_INDEX)
        throw new QueryError(`Index too large in "${key}"`)
      if (i === path.length - 1) {
        node[token] = value
      } else {
        const next = node[token]
        if (typeof next === 'string') throw new QueryError(`Conflicting query parameter "${key}"`)
        node[token] = next ?? {}
        node = node[token] as Node
      }
    })
  }
  return arrays(root) as Record<string, unknown>
}

/** Converts query-string values to the types operators expect. */
function normalizeWhere(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeWhere)
  if (typeof value !== 'object' || value === null) return value
  const out: Record<string, unknown> = {}
  for (const [key, inner] of Object.entries(value)) {
    if (key === 'exists' && typeof inner === 'string') out[key] = inner !== 'false'
    else if ((key === 'in' || key === 'not_in') && typeof inner === 'string')
      out[key] = inner === '' ? [] : inner.split(',')
    else if ((key === 'equals' || key === 'not_equals') && inner === 'null') out[key] = null
    else out[key] = normalizeWhere(inner)
  }
  return out
}

export interface ListQuery {
  where?: Where
  sort?: string[]
  limit: number
  page: number
  depth?: number
}

export const MAX_REST_LIMIT = 100

function integer(name: string, raw: unknown, min: number, max: number): number | undefined {
  if (raw === undefined) return undefined
  const n = Number(raw)
  if (typeof raw !== 'string' || !Number.isInteger(n) || n < min || n > max) {
    throw new QueryError(`${name} must be an integer from ${min} to ${max}`)
  }
  return n
}

/** Reads `where`, `sort`, `limit`, `page` and `depth` from a URL. */
export function parseListQuery(url: URL): ListQuery {
  const params = parseNested(url.searchParams)
  let where: unknown = params.where
  if (typeof where === 'string') {
    try {
      where = JSON.parse(where)
    } catch {
      throw new QueryError('where must be JSON or bracket parameters')
    }
  }
  if (
    where !== undefined &&
    (typeof where !== 'object' || where === null || Array.isArray(where))
  ) {
    throw new QueryError('where must be an object')
  }
  const sort = typeof params.sort === 'string' ? params.sort.split(',').filter(Boolean) : undefined
  const query: ListQuery = {
    limit: integer('limit', params.limit, 1, MAX_REST_LIMIT) ?? 10,
    page: integer('page', params.page, 1, Number.MAX_SAFE_INTEGER) ?? 1,
  }
  if (where !== undefined) query.where = normalizeWhere(where) as Where
  if (sort) query.sort = sort
  const depth = integer('depth', params.depth, 0, 3)
  if (depth !== undefined) query.depth = depth
  return query
}

export function parseDepth(url: URL): { depth?: number } {
  const depth = integer('depth', url.searchParams.get('depth') ?? undefined, 0, 3)
  return depth === undefined ? {} : { depth }
}
