import { isAbsolute, resolve } from 'node:path'
import type { DatabaseAdapter } from '@easy-cms/core'
import {
  type Connection,
  connectDatabase,
  type Dialect,
  type DrizzleAdapterOptions,
  type SqlRunner,
} from '@easy-cms/drizzle'
import type { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { drizzle as drizzlePostgresJs } from 'drizzle-orm/postgres-js'
import postgresJs from 'postgres'

export { DEFAULT_MIGRATION_DIR, DEFAULT_TABLE_PREFIX } from '@easy-cms/drizzle'

export interface PostgresAdapterOptions extends DrizzleAdapterOptions {
  /** Connection string, e.g. `postgres://user:pass@host:5432/db`. Uses postgres.js. */
  readonly url?: string
  /** Maximum connections in the pool. Default 10. */
  readonly max?: number
  /**
   * Use PGlite (Postgres in WebAssembly) instead of a server: a data directory
   * (relative to the project root), `memory://`, or a PGlite instance you manage.
   * Handy for local development and tests. Requires `@electric-sql/pglite`.
   */
  readonly pglite?: string | PGlite
}

const kit = () => import('drizzle-kit/api')

export const postgresDialect: Dialect = {
  name: 'postgres',
  table: (name, columns, indexes) => pgTable(name, columns, indexes),
  index: (name) => index(name),
  uniqueIndex: (name) => uniqueIndex(name),
  serial: (name) => serial(name).primaryKey(),
  text: (name) => text(name),
  integer: (name) => integer(name),
  number: (name) => doublePrecision(name),
  boolean: (name) => boolean(name),
  json: (name) => jsonb(name),
  like: (column, pattern) => sql`${column} ILIKE ${pattern} ESCAPE '\\'`,
  param: (n) => `$${n}`,
  migrationsTableSQL: (name) =>
    `CREATE TABLE IF NOT EXISTS "${name}" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" text NOT NULL UNIQUE,
      "hash" text,
      "snapshot" text,
      "applied_at" text NOT NULL
    )`,
  snapshot: async (tables) => (await kit()).generateDrizzleJson({ ...tables }),
  migration: async (prev, cur) => (await kit()).generateMigration(prev as never, cur as never),
}

/** PostgreSQL database adapter (postgres.js, or PGlite for local use). */
export function postgres(options: PostgresAdapterOptions): DatabaseAdapter {
  if (!options.url && !options.pglite) {
    throw new Error('@easy-cms/db-postgres: pass `url` (a connection string) or `pglite`')
  }
  return {
    name: 'postgres',
    init: async (args) => {
      const connection = options.pglite
        ? await pgliteConnection(options.pglite, args.cwd)
        : postgresJsConnection(options.url as string, options.max ?? 10)
      return connectDatabase(postgresDialect, connection, args, options)
    },
  }
}

function postgresJsConnection(url: string, max: number): Connection {
  // Keep Easy CMS quiet: Postgres NOTICEs (e.g. "relation already exists, skipping") are expected.
  const client = postgresJs(url, { max, onnotice: () => {} })
  const runner: SqlRunner = {
    async query(text, params = []) {
      return [...(await client.unsafe(text, [...params] as never[]))] as Record<string, unknown>[]
    },
    async transaction(statements) {
      await client.begin(async (tx) => {
        for (const s of statements) await tx.unsafe(s.sql, [...(s.params ?? [])] as never[])
      })
    },
  }
  return { db: drizzlePostgresJs(client), runner, close: () => client.end({ timeout: 5 }) }
}

async function pgliteConnection(source: string | PGlite, cwd: string): Promise<Connection> {
  const owned = typeof source === 'string'
  let pg: PGlite
  if (typeof source === 'string') {
    const { PGlite } = await import('@electric-sql/pglite')
    const dataDir = source.includes('://') || isAbsolute(source) ? source : resolve(cwd, source)
    pg = new PGlite(dataDir)
  } else {
    pg = source
  }
  await pg.waitReady
  const { drizzle } = await import('drizzle-orm/pglite')
  const runner: SqlRunner = {
    async query(text, params = []) {
      return (await pg.query(text, [...params])).rows as Record<string, unknown>[]
    },
    async transaction(statements) {
      await pg.transaction(async (tx) => {
        for (const s of statements) await tx.query(s.sql, [...(s.params ?? [])])
      })
    },
  }
  // An instance passed in belongs to the caller; only close what we opened.
  return {
    db: drizzle({ client: pg }),
    runner,
    close: async () => (owned ? pg.close() : undefined),
  }
}
