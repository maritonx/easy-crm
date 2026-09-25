import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DatabaseAdapter } from '@easy-cms/core'
import {
  type Connection,
  connectDatabase,
  type Dialect,
  type DrizzleAdapterOptions,
  type Statement,
} from '@easy-cms/drizzle'
import { createClient, type InArgs } from '@libsql/client'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export { DEFAULT_MIGRATION_DIR, DEFAULT_TABLE_PREFIX } from '@easy-cms/drizzle'

export interface SQLiteAdapterOptions extends DrizzleAdapterOptions {
  /** `file:./cms.db` (relative to the project root) or a `libsql://` URL. */
  readonly url: string
  /** Auth token for Turso / remote libSQL. */
  readonly authToken?: string
}

const kit = () => import('drizzle-kit/api')

export const sqliteDialect: Dialect = {
  name: 'sqlite',
  table: (name, columns, indexes) => sqliteTable(name, columns, indexes),
  index: (name) => index(name),
  uniqueIndex: (name) => uniqueIndex(name),
  serial: (name) => integer(name).primaryKey({ autoIncrement: true }),
  text: (name) => text(name),
  integer: (name) => integer(name),
  number: (name) => real(name),
  boolean: (name) => integer(name, { mode: 'boolean' }),
  json: (name) => text(name, { mode: 'json' }),
  // LIKE is case-insensitive for ASCII in SQLite.
  like: (column, pattern) => sql`${column} LIKE ${pattern} ESCAPE '\\'`,
  param: () => '?',
  migrationsTableSQL: (name) =>
    `CREATE TABLE IF NOT EXISTS \`${name}\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`name\` text NOT NULL UNIQUE,
      \`hash\` text,
      \`snapshot\` text,
      \`applied_at\` text NOT NULL
    )`,
  snapshot: async (tables) => (await kit()).generateSQLiteDrizzleJson({ ...tables }),
  migration: async (prev, cur) =>
    (await kit()).generateSQLiteMigration(prev as never, cur as never),
}

/** SQLite / libSQL database adapter. */
export function sqlite(options: SQLiteAdapterOptions): DatabaseAdapter {
  let traceInclude: string[] | undefined
  return {
    name: 'sqlite',
    init: async (args) => {
      const client = createClient({
        url: resolveUrl(options.url, args.cwd),
        ...(options.authToken ? { authToken: options.authToken } : {}),
      })
      if (options.url.startsWith('file:')) await client.execute('PRAGMA journal_mode = WAL')
      const toStatement = (s: Statement) => ({ sql: s.sql, args: [...(s.params ?? [])] as InArgs })
      const connection: Connection = {
        db: drizzle(client),
        runner: {
          async query(text, params = []) {
            const result = await client.execute({ sql: text, args: [...params] as InArgs })
            return result.rows as unknown as Record<string, unknown>[]
          },
          async transaction(statements) {
            // A libSQL batch runs in one transaction.
            await client.batch(statements.map(toStatement), 'write')
          },
        },
        close: async () => client.close(),
      }
      return connectDatabase(sqliteDialect, connection, args, options)
    },
    bundle: {
      get traceInclude() {
        traceInclude ??= nativeBinaries()
        return traceInclude
      },
    },
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

/**
 * libsql loads its prebuilt binary with a computed `require()`, which output
 * tracing cannot follow. Returns the binaries installed for this machine.
 */
export function nativeBinaries(): string[] {
  try {
    const client = fileURLToPath(import.meta.resolve('@libsql/client'))
    const libsqlMain = createRequire(client).resolve('libsql')
    const libsqlPkg = JSON.parse(
      readFileSync(join(dirname(libsqlMain), 'package.json'), 'utf8'),
    ) as {
      optionalDependencies?: Record<string, string>
    }
    const requireFromLibsql = createRequire(libsqlMain)
    const found: string[] = []
    for (const name of Object.keys(libsqlPkg.optionalDependencies ?? {})) {
      try {
        found.push(requireFromLibsql.resolve(name))
      } catch {
        // not installed for this platform
      }
    }
    return found
  } catch {
    return []
  }
}
