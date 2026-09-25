import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type Config,
  createEasyCMS,
  type DatabaseAdapter,
  type SchemaMode,
  silentLogger,
} from '@easy-cms/core'
import { postgres } from '@easy-cms/db-postgres'
import { sqlite } from '@easy-cms/db-sqlite'
import { PGlite } from '@electric-sql/pglite'
import { createClient } from '@libsql/client'
import postgresJs from 'postgres'
import { afterAll, afterEach } from 'vitest'

export type Dialect = 'sqlite' | 'pglite' | 'postgres'
export const DIALECT = (process.env.EASY_CMS_TEST_DIALECT ?? 'sqlite') as Dialect
export const SECRET = 'x'.repeat(32)

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A fresh temporary project directory, removed after each test. */
export function tempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'easy-cms-it-'))
  dirs.push(dir)
  return dir
}

// Postgres: one database per test file, each project gets its own table prefix.
let pglite: PGlite | undefined
let server: postgresJs.Sql | undefined
const prefixes = new Map<string, string>()

function prefixFor(cwd: string): string {
  if (DIALECT === 'sqlite') return 'ecms_' // every project has its own file
  let prefix = prefixes.get(cwd)
  if (!prefix) {
    prefix = `t${process.pid}_${prefixes.size}_`
    prefixes.set(cwd, prefix)
  }
  return prefix
}

afterAll(async () => {
  await pglite?.close()
  if (server) {
    // Leave the shared server clean for the next file.
    for (const prefix of prefixes.values()) {
      const tables =
        await server`select tablename from pg_tables where schemaname = 'public' and tablename like ${`${prefix}%`}`
      for (const { tablename } of tables)
        await server.unsafe(`drop table if exists "${tablename}" cascade`)
    }
    await server.end({ timeout: 5 })
  }
})

/** The database adapter under test. Each project directory gets isolated tables. */
export function db(): DatabaseAdapter {
  return {
    name: `test-${DIALECT}`,
    init(args) {
      const tablePrefix = prefixFor(args.cwd)
      if (DIALECT === 'sqlite') return sqlite({ url: 'file:./cms.db', tablePrefix }).init(args)
      if (DIALECT === 'pglite') {
        pglite ??= new PGlite()
        return postgres({ pglite, tablePrefix }).init(args)
      }
      return postgres({ url: process.env.POSTGRES_URL as string, max: 3, tablePrefix }).init(args)
    },
  }
}

/** A table name as created for a project, e.g. `table(cwd, 'posts__tags')`. */
export function table(cwd: string, name: string): string {
  return `${prefixFor(cwd)}${name}`
}

/** Runs raw SQL against the project's database, to check what is actually stored. */
export async function rawQuery(cwd: string, sql: string): Promise<Record<string, unknown>[]> {
  if (DIALECT === 'sqlite') {
    const client = createClient({ url: `file:${join(cwd, 'cms.db')}` })
    try {
      return (await client.execute(sql)).rows as unknown as Record<string, unknown>[]
    } finally {
      client.close()
    }
  }
  if (DIALECT === 'pglite')
    return (await (pglite as PGlite).query(sql)).rows as Record<string, unknown>[]
  server ??= postgresJs(process.env.POSTGRES_URL as string, { max: 2, onnotice: () => {} })
  return [...(await server.unsafe(sql))] as Record<string, unknown>[]
}

export async function open<const C extends Config>(
  config: C,
  cwd: string = tempProject(),
  schema: SchemaMode = 'push',
) {
  const cms = await createEasyCMS(config, { cwd, schema, logger: silentLogger })
  return Object.assign(cms, { cwd })
}
