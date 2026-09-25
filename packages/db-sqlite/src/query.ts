import type { Field } from '@easy-cms/core'
import { parseId, QueryError, type Where, type WhereOperators } from '@easy-cms/core'
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  not,
  notInArray,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { ChildModel, TableModel } from './schema.js'

const OPERATORS = new Set([
  'equals',
  'not_equals',
  'in',
  'not_in',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'exists',
])

const SYSTEM_COLUMNS: Record<string, string> = {
  id: 'id',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

type Target =
  | { kind: 'column'; column: AnySQLiteColumn; field: Field | undefined }
  | { kind: 'child'; child: ChildModel; rest: string[] }

const col = (model: TableModel, name: string) => model.table[name] as AnySQLiteColumn

function resolvePath(model: TableModel, segments: string[], drafts: boolean): Target {
  const [first] = segments
  if (first === undefined) throw new QueryError('empty field path')

  if (segments.length === 1) {
    const system = SYSTEM_COLUMNS[first]
    if (system && (model.kind === 'root' || first === 'id')) {
      return { kind: 'column', column: col(model, system), field: undefined }
    }
    if (first === 'status' && drafts && model.kind === 'root') {
      return { kind: 'column', column: col(model, 'status'), field: undefined }
    }
  }

  // Walk fields, descending into groups, until we reach a column or a child table.
  let fields = model.fields
  const path: string[] = []
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i] as string
    const field = fields.find((f) => f.name === segment)
    const shown = segments.slice(0, i + 1).join('.')
    if (!field) throw new QueryError(`Unknown field "${shown}"`)
    path.push(segment)

    if (field.type === 'group') {
      fields = field.fields
      continue
    }
    const child = model.children.find((c) => c.path.join('.') === path.join('.'))
    if (child) return { kind: 'child', child, rest: segments.slice(i + 1) }

    if (i < segments.length - 1) {
      throw new QueryError(`Cannot query inside "${shown}" (${field.type} field)`)
    }
    if (field.type === 'json' || field.type === 'richText') {
      throw new QueryError(`Cannot query "${shown}": ${field.type} fields are not queryable`)
    }
    const column = model.columns.find((c) => c.path.join('.') === path.join('.'))
    if (!column) throw new QueryError(`Unknown field "${shown}"`)
    return { kind: 'column', column: col(model, column.column), field }
  }
  throw new QueryError(`"${segments.join('.')}" is a group; query one of its fields`)
}

function coerce(field: Field | undefined, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (field?.type === 'relationship' || field?.type === 'upload') return parseId(value) ?? value
  if (field?.type === 'number' && typeof value === 'string' && value.trim() !== '')
    return Number(value)
  if (field?.type === 'boolean' && (value === 'true' || value === 'false')) return value === 'true'
  return value
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`)

function operatorSQL(
  column: AnySQLiteColumn,
  field: Field | undefined,
  op: string,
  raw: unknown,
  path: string,
): SQL {
  const list = (value: unknown) => {
    if (!Array.isArray(value)) throw new QueryError(`"${path}.${op}" must be an array`)
    return value.map((v) => coerce(field, v))
  }
  const value = coerce(field, raw)
  switch (op) {
    case 'equals':
      return value === null ? isNull(column) : eq(column, value)
    case 'not_equals':
      return value === null ? isNotNull(column) : (or(ne(column, value), isNull(column)) as SQL)
    case 'in': {
      const values = list(raw)
      return values.length === 0 ? sql`0 = 1` : inArray(column, values)
    }
    case 'not_in': {
      const values = list(raw)
      return values.length === 0
        ? sql`1 = 1`
        : (or(notInArray(column, values), isNull(column)) as SQL)
    }
    case 'gt':
      return gt(column, value)
    case 'gte':
      return gte(column, value)
    case 'lt':
      return lt(column, value)
    case 'lte':
      return lte(column, value)
    case 'like':
      if (typeof raw !== 'string') throw new QueryError(`"${path}.like" must be a string`)
      return sql`${column} LIKE ${`%${escapeLike(raw)}%`} ESCAPE '\\'`
    case 'exists':
      return raw === false ? isNull(column) : isNotNull(column)
    default:
      throw new QueryError(`Unknown operator "${op}" on "${path}"`)
  }
}

export class WhereBuilder {
  constructor(
    private readonly db: LibSQLDatabase,
    private readonly drafts: boolean,
  ) {}

  build(model: TableModel, where: Where | undefined): SQL | undefined {
    if (where === undefined) return undefined
    if (typeof where !== 'object' || where === null || Array.isArray(where)) {
      throw new QueryError('where must be an object')
    }
    const parts: SQL[] = []
    for (const [key, value] of Object.entries(where)) {
      if (value === undefined) continue
      if (key === 'and' || key === 'or') {
        if (!Array.isArray(value)) throw new QueryError(`"${key}" must be an array`)
        const inner = (value as Where[])
          .map((w) => this.build(model, w))
          .filter((s) => s !== undefined)
        if (inner.length > 0) parts.push((key === 'and' ? and(...inner) : or(...inner)) as SQL)
        continue
      }
      parts.push(this.field(model, key, value as WhereOperators))
    }
    return parts.length === 0 ? undefined : parts.length === 1 ? parts[0] : and(...parts)
  }

  private field(model: TableModel, path: string, operators: WhereOperators): SQL {
    if (typeof operators !== 'object' || operators === null || Array.isArray(operators)) {
      throw new QueryError(`"${path}" must be an object of operators, e.g. { equals: ... }`)
    }
    const entries = Object.entries(operators).filter(([, v]) => v !== undefined)
    if (entries.length === 0) throw new QueryError(`"${path}" has no operator`)
    const target = resolvePath(model, path.split('.'), this.drafts && model.kind === 'root')

    const parts = entries.map(([op, value]) => {
      if (!OPERATORS.has(op)) throw new QueryError(`Unknown operator "${op}" on "${path}"`)
      if (target.kind === 'column') return operatorSQL(target.column, target.field, op, value, path)
      return this.child(model, target.child, target.rest, op, value, path)
    })
    return (parts.length === 1 ? parts[0] : and(...parts)) as SQL
  }

  /** Conditions on array rows or hasMany values become (NOT) EXISTS subqueries. */
  private child(
    parent: TableModel,
    child: ChildModel,
    rest: string[],
    op: string,
    value: unknown,
    path: string,
  ): SQL {
    const table = child.table
    const link = eq(col(table, '_parent_id'), col(parent, 'id'))
    const subquery = (condition: SQL | undefined) =>
      exists(
        this.db
          .select({ one: sql`1` })
          .from(table.table)
          .where(condition ? and(link, condition) : link),
      )

    if (child.kind === 'values') {
      if (rest.length > 0) throw new QueryError(`Cannot query inside "${path}"`)
      const valueColumn = col(table, 'value')
      if (op === 'exists') return value === false ? not(subquery(undefined)) : subquery(undefined)
      if (op === 'not_equals')
        return not(subquery(operatorSQL(valueColumn, table.valueField, 'equals', value, path)))
      if (op === 'not_in')
        return not(subquery(operatorSQL(valueColumn, table.valueField, 'in', value, path)))
      return subquery(operatorSQL(valueColumn, table.valueField, op, value, path))
    }

    if (rest.length === 0) {
      if (op !== 'exists') throw new QueryError(`"${path}" is an array; query one of its fields`)
      return value === false ? not(subquery(undefined)) : subquery(undefined)
    }
    return subquery(this.build(table, { [rest.join('.')]: { [op]: value } }))
  }

  orderBy(model: TableModel, sort: readonly string[]): SQL[] {
    const order = sort.map((entry) => {
      const descending = entry.startsWith('-')
      const path = descending ? entry.slice(1) : entry
      const target = resolvePath(model, path.split('.'), this.drafts)
      if (target.kind !== 'column') throw new QueryError(`Cannot sort by "${path}"`)
      return descending ? desc(target.column) : asc(target.column)
    })
    order.push(desc(col(model, 'id')))
    return order
  }
}
