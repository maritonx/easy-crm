import { createHash } from 'node:crypto'
import type { CollectionConfig, Field, ResolvedConfig } from '@easy-cms/core'
import { ConfigError } from '@easy-cms/core'
import {
  type AnySQLiteColumn,
  index,
  integer,
  real,
  type SQLiteColumnBuilderBase,
  type SQLiteTableWithColumns,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

// biome-ignore lint/suspicious/noExplicitAny: tables are built at runtime from the config
export type AnyTable = SQLiteTableWithColumns<any>

/** A scalar field stored as a column of this table. */
export interface ColumnModel {
  /** Path of the value inside the row's data, e.g. `['seo', 'title']`. */
  readonly path: readonly string[]
  readonly field: Field
  readonly column: string
}

/** A child table holding array rows or hasMany values. */
export interface ChildModel {
  readonly kind: 'array' | 'values'
  readonly path: readonly string[]
  readonly field: Field
  readonly table: TableModel
}

export interface TableModel {
  readonly name: string
  readonly kind: 'root' | 'array' | 'values'
  readonly table: AnyTable
  readonly fields: readonly Field[]
  readonly columns: readonly ColumnModel[]
  readonly children: readonly ChildModel[]
  /** The column holding the value, for `values` tables. */
  readonly valueField?: Field
}

export interface CollectionModel {
  readonly config: CollectionConfig
  readonly root: TableModel
}

export interface SchemaModel {
  readonly collections: ReadonlyMap<string, CollectionModel>
  readonly globals: AnyTable
  /** Every table managed by snapshots, keyed by SQL name. */
  readonly tables: Readonly<Record<string, AnyTable>>
  /** Changes whenever the generated schema changes. Used to detect missing migrations. */
  readonly hash: string
}

/** Tracks applied migrations. Created separately and never part of a snapshot. */
export function migrationsTableName(prefix: string) {
  return `${prefix}migrations`
}

export const snake = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toLowerCase()

type ColumnKind = 'text' | 'real' | 'integer' | 'boolean' | 'json'

function columnKind(field: Field): ColumnKind {
  switch (field.type) {
    case 'number':
      return 'real'
    case 'boolean':
      return 'boolean'
    case 'json':
    case 'richText':
      return 'json'
    case 'upload':
    case 'relationship':
      return 'integer'
    default:
      return 'text'
  }
}

function makeColumn(name: string, kind: ColumnKind): SQLiteColumnBuilderBase {
  switch (kind) {
    case 'real':
      return real(name)
    case 'integer':
      return integer(name)
    case 'boolean':
      return integer(name, { mode: 'boolean' })
    case 'json':
      return text(name, { mode: 'json' })
    case 'text':
      return text(name)
  }
}

interface Builder {
  readonly prefix: string
  readonly tableNames: Set<string>
  readonly description: unknown[]
}

/** Builds Drizzle tables for every collection and global in the config. */
export function buildSchema(config: ResolvedConfig, prefix: string): SchemaModel {
  const builder: Builder = {
    prefix,
    tableNames: new Set([migrationsTableName(prefix)]),
    description: [],
  }
  const collections = new Map<string, CollectionModel>()
  const tables: Record<string, AnyTable> = {}

  for (const collection of config.collections) {
    const root = buildTable(
      builder,
      `${prefix}${snake(collection.slug)}`,
      'root',
      collection.fields,
      {
        drafts: collection.drafts === true,
      },
    )
    collections.set(collection.slug, { config: collection, root })
    collectTables(root, tables)
  }

  const globalsName = claimName(builder, `${prefix}globals`)
  const globals = sqliteTable(globalsName, {
    slug: text('slug').primaryKey(),
    data: text('data', { mode: 'json' }).notNull(),
    status: text('status'),
    updated_at: text('updated_at').notNull(),
  })
  tables[globalsName] = globals
  builder.description.push(['globals', globalsName])

  const hash = createHash('sha256')
    .update(JSON.stringify(builder.description))
    .digest('hex')
    .slice(0, 16)
  return { collections, globals, tables, hash }
}

function collectTables(model: TableModel, into: Record<string, AnyTable>) {
  into[model.name] = model.table
  for (const child of model.children) collectTables(child.table, into)
}

function claimName(builder: Builder, name: string): string {
  if (builder.tableNames.has(name)) {
    throw new ConfigError([
      {
        path: name,
        message: `two tables would be named "${name}"`,
        hint: 'rename one of the collections or fields',
      },
    ])
  }
  builder.tableNames.add(name)
  return name
}

function buildTable(
  builder: Builder,
  name: string,
  kind: TableModel['kind'],
  fields: readonly Field[],
  options: { drafts?: boolean; parentIdKind?: 'integer' | 'text'; valueField?: Field },
): TableModel {
  claimName(builder, name)
  const columns: Record<string, SQLiteColumnBuilderBase> = {}
  const described: unknown[] = []
  const columnModels: ColumnModel[] = []
  const children: ChildModel[] = []
  const indexes: { column: string; unique: boolean }[] = []

  const add = (column: string, builderColumn: SQLiteColumnBuilderBase, desc: unknown) => {
    if (Object.hasOwn(columns, column)) {
      throw new ConfigError([
        {
          path: `${name}.${column}`,
          message: `two fields would use the column "${column}"`,
          hint: 'rename one of them',
        },
      ])
    }
    columns[column] = builderColumn
    described.push([column, desc])
  }

  if (kind === 'root') {
    add('id', integer('id').primaryKey({ autoIncrement: true }), 'id:int')
    add('created_at', text('created_at').notNull(), 'text!')
    add('updated_at', text('updated_at').notNull(), 'text!')
    if (options.drafts) add('status', text('status').notNull().default('draft'), 'status')
    indexes.push({ column: 'created_at', unique: false })
  } else {
    const parentKind = options.parentIdKind ?? 'integer'
    add(
      'id',
      kind === 'array'
        ? text('id').primaryKey()
        : integer('id').primaryKey({ autoIncrement: true }),
      `id:${kind}`,
    )
    add(
      '_parent_id',
      parentKind === 'text' ? text('_parent_id').notNull() : integer('_parent_id').notNull(),
      parentKind,
    )
    add('_order', integer('_order').notNull(), 'int!')
    indexes.push({ column: '_parent_id', unique: false })
    if (kind === 'values' && options.valueField) {
      const valueKind = columnKind(options.valueField)
      add('value', makeColumn('value', valueKind), valueKind)
      indexes.push({ column: 'value', unique: false })
    }
  }

  const walk = (list: readonly Field[], path: string[], topLevel: boolean) => {
    for (const field of list) {
      const fieldPath = [...path, field.name]
      const base = fieldPath.map(snake).join('_')

      if (field.type === 'group') {
        walk(field.fields, fieldPath, false)
      } else if (field.type === 'array') {
        const child = buildTable(builder, `${name}__${base}`, 'array', field.fields, {
          parentIdKind: kind === 'array' ? 'text' : 'integer',
        })
        children.push({ kind: 'array', path: fieldPath, field, table: child })
        described.push([base, 'array', child.name])
      } else if ((field.type === 'select' || field.type === 'relationship') && field.hasMany) {
        const child = buildTable(builder, `${name}__${base}`, 'values', [], {
          parentIdKind: kind === 'array' ? 'text' : 'integer',
          valueField: field,
        })
        children.push({ kind: 'values', path: fieldPath, field, table: child })
        described.push([base, 'values', child.name])
      } else {
        const kindOfColumn = columnKind(field)
        add(base, makeColumn(base, kindOfColumn), kindOfColumn)
        columnModels.push({ path: fieldPath, field, column: base })
        if (topLevel && kind === 'root' && (field.unique || field.type === 'slug')) {
          indexes.push({ column: base, unique: true })
        } else if (
          field.index ||
          field.unique ||
          field.type === 'relationship' ||
          field.type === 'upload'
        ) {
          indexes.push({ column: base, unique: false })
        }
      }
    }
  }
  walk(fields, [], true)

  const table = sqliteTable(name, columns, (t: Record<string, AnySQLiteColumn>) =>
    indexes.map(({ column, unique }) => {
      const col = t[column] as AnySQLiteColumn
      return unique
        ? uniqueIndex(`${name}_${column}_unique`).on(col)
        : index(`${name}_${column}_idx`).on(col)
    }),
  ) as AnyTable

  builder.description.push([name, kind, described, indexes])
  const model: TableModel = { name, kind, table, fields, columns: columnModels, children }
  return options.valueField ? { ...model, valueField: options.valueField } : model
}
