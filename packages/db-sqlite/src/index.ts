import { isAbsolute, resolve } from 'node:path'
import type {
  Database,
  DatabaseAdapter,
  DatabaseInitArgs,
  FindArgs,
  ID,
  PaginatedDocs,
  RawDocument,
  Where,
} from '@easy-cms/core'
import { QueryError } from '@easy-cms/core'
import { type Client, createClient } from '@libsql/client'
import { count, eq, inArray } from 'drizzle-orm'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import {
  deleteDocument,
  hydrate,
  insertDocument,
  replaceDocument,
  toDocument,
} from './documents.js'
import { Migrator } from './migrations.js'
import { WhereBuilder } from './query.js'
import {
  buildSchema,
  type CollectionModel,
  migrationsTableName,
  type SchemaModel,
} from './schema.js'

export interface SQLiteAdapterOptions {
  /** `file:./cms.db` (relative to the project root) or a `libsql://` URL. */
  readonly url: string
  /** Auth token for Turso / remote libSQL. */
  readonly authToken?: string
  /** Prefix for every table Easy CMS creates. Default `ecms_`. */
  readonly tablePrefix?: string
  /** Where migration files live, relative to the project root. Default `easy-cms/migrations`. */
  readonly migrationDir?: string
}

export const DEFAULT_TABLE_PREFIX = 'ecms_'
export const DEFAULT_MIGRATION_DIR = 'easy-cms/migrations'

/** SQLite / libSQL database adapter. */
export function sqlite(options: SQLiteAdapterOptions): DatabaseAdapter {
  return {
    name: 'sqlite',
    init: (args) => SQLiteDatabase.connect(options, args),
  }
}

function resolveUrl(url: string, cwd: string): string {
  if (url === ':memory:' || url === 'file::memory:') {
    throw new Error(
      '@easy-cms/db-sqlite: in-memory databases are not supported; use a file URL such as file:./cms.db',
    )
  }
  if (!url.startsWith('file:')) return url
  const path = url.slice('file:'.length)
  return isAbsolute(path) ? url : `file:${resolve(cwd, path)}`
}

class SQLiteDatabase implements Database {
  private readonly builders = new Map<string, WhereBuilder>()

  private constructor(
    private readonly client: Client,
    private readonly db: LibSQLDatabase,
    private readonly schema: SchemaModel,
    private readonly migrator: Migrator,
  ) {
    for (const [slug, model] of schema.collections) {
      this.builders.set(slug, new WhereBuilder(db, model.config.drafts === true))
    }
  }

  static async connect(
    options: SQLiteAdapterOptions,
    args: DatabaseInitArgs,
  ): Promise<SQLiteDatabase> {
    const prefix = options.tablePrefix ?? DEFAULT_TABLE_PREFIX
    const schema = buildSchema(args.config, prefix)
    const client = createClient({
      url: resolveUrl(options.url, args.cwd),
      ...(options.authToken ? { authToken: options.authToken } : {}),
    })
    const migrator = new Migrator({
      client,
      schema,
      table: migrationsTableName(prefix),
      dir: resolve(args.cwd, options.migrationDir ?? DEFAULT_MIGRATION_DIR),
      logger: args.logger,
      interactive: args.interactive ?? false,
    })
    try {
      if (options.url.startsWith('file:')) await client.execute('PRAGMA journal_mode = WAL')
      if (args.schema === 'push') await migrator.push()
      else if (args.schema === 'verify') await migrator.verify()
    } catch (error) {
      client.close()
      throw error
    }
    return new SQLiteDatabase(client, drizzle(client), schema, migrator)
  }

  private model(slug: string): CollectionModel {
    const model = this.schema.collections.get(slug)
    if (!model) throw new QueryError(`Unknown collection "${slug}"`)
    return model
  }

  private where(slug: string, where: Where | undefined) {
    return (this.builders.get(slug) as WhereBuilder).build(this.model(slug).root, where)
  }

  private async load(
    model: CollectionModel,
    rows: Record<string, unknown>[],
  ): Promise<RawDocument[]> {
    const docs = await hydrate(this.db, model.root, rows)
    return rows.map((row, i) => toDocument(row, docs[i] ?? {}, model.config.drafts === true))
  }

  async find(args: FindArgs): Promise<PaginatedDocs<RawDocument>> {
    const model = this.model(args.collection)
    const condition = this.where(args.collection, args.where)
    const orderBy = (this.builders.get(args.collection) as WhereBuilder).orderBy(
      model.root,
      args.sort,
    )

    let query = this.db
      .select()
      .from(model.root.table)
      .where(condition)
      .orderBy(...orderBy)
      .$dynamic()
    if (args.limit > 0) query = query.limit(args.limit).offset((args.page - 1) * args.limit)
    const rows = (await query) as Record<string, unknown>[]

    const totalDocs =
      args.limit > 0 && (args.page > 1 || rows.length === args.limit)
        ? await this.count({ collection: args.collection, where: args.where })
        : (args.page - 1) * args.limit + rows.length
    const totalPages = args.limit > 0 ? Math.max(1, Math.ceil(totalDocs / args.limit)) : 1

    return {
      docs: await this.load(model, rows),
      totalDocs,
      limit: args.limit,
      page: args.page,
      totalPages,
      hasNextPage: args.page < totalPages,
      hasPrevPage: args.page > 1,
    }
  }

  async findById(args: { collection: string; id: ID }): Promise<RawDocument | null> {
    const [doc] = await this.findByIds({ collection: args.collection, ids: [args.id] })
    return doc ?? null
  }

  async findByIds(args: { collection: string; ids: readonly ID[] }): Promise<RawDocument[]> {
    if (args.ids.length === 0) return []
    const model = this.model(args.collection)
    const idColumn = model.root.table.id as AnySQLiteColumn
    const rows = (await this.db
      .select()
      .from(model.root.table)
      .where(inArray(idColumn, [...args.ids]))) as Record<string, unknown>[]
    return this.load(model, rows)
  }

  async count(args: { collection: string; where?: Where | undefined }): Promise<number> {
    const model = this.model(args.collection)
    const [row] = await this.db
      .select({ total: count() })
      .from(model.root.table)
      .where(this.where(args.collection, args.where))
    return row?.total ?? 0
  }

  async create(args: { collection: string; data: Record<string, unknown> }): Promise<RawDocument> {
    const model = this.model(args.collection)
    const id = await this.db.transaction((tx) =>
      insertDocument(tx, model.root, args.data, model.config.drafts === true),
    )
    return (await this.findById({ collection: args.collection, id })) as RawDocument
  }

  async update(args: {
    collection: string
    id: ID
    data: Record<string, unknown>
  }): Promise<RawDocument> {
    const model = this.model(args.collection)
    await this.db.transaction((tx) =>
      replaceDocument(tx, model.root, args.id, args.data, model.config.drafts === true),
    )
    return (await this.findById({ collection: args.collection, id: args.id })) as RawDocument
  }

  async delete(args: { collection: string; id: ID }): Promise<void> {
    const model = this.model(args.collection)
    await this.db.transaction((tx) => deleteDocument(tx, model.root, args.id))
  }

  async findGlobal(args: { slug: string }): Promise<Record<string, unknown> | null> {
    const table = this.schema.globals
    const [row] = await this.db
      .select()
      .from(table)
      .where(eq(table.slug as AnySQLiteColumn, args.slug))
    if (!row) return null
    return {
      ...(row.data as Record<string, unknown>),
      ...(row.status ? { status: row.status } : {}),
      updatedAt: row.updated_at,
    }
  }

  async updateGlobal(args: {
    slug: string
    data: Record<string, unknown>
  }): Promise<Record<string, unknown>> {
    const { status, updatedAt, ...data } = args.data
    const table = this.schema.globals
    const values = {
      slug: args.slug,
      data,
      status: (status as string | undefined) ?? null,
      updated_at: updatedAt,
    }
    await this.db
      .insert(table)
      .values(values)
      .onConflictDoUpdate({ target: table.slug as AnySQLiteColumn, set: values })
    return (await this.findGlobal({ slug: args.slug })) as Record<string, unknown>
  }

  createMigration(args: { name: string }) {
    return this.migrator.create(args.name)
  }

  migrate() {
    return this.migrator.migrate()
  }

  migrationStatus() {
    return this.migrator.status()
  }

  async destroy(): Promise<void> {
    this.client.close()
  }
}

export { buildSchema } from './schema.js'
