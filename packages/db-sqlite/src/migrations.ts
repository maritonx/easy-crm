import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { type Logger, SchemaError } from '@easy-cms/core'
import type { Client, InStatement } from '@libsql/client'
import type { SchemaModel } from './schema.js'

/** drizzle-kit's SQLite snapshot. Loaded lazily: drizzle-kit is only needed in development and the CLI. */
// biome-ignore lint/suspicious/noExplicitAny: drizzle-kit does not export a stable snapshot type
type Snapshot = Record<string, any>

const BREAKPOINT = '--> statement-breakpoint'

const kit = () => import('drizzle-kit/api')

async function snapshotOf(schema: SchemaModel | null): Promise<Snapshot> {
  const api = await kit()
  return api.generateSQLiteDrizzleJson(schema ? { ...schema.tables } : {})
}

/**
 * Unions two snapshots: every table, column and index from either side.
 * Diffing prev → union → cur splits a change into "add only" and "drop only"
 * steps, so drizzle-kit never has to ask whether something was renamed.
 */
function unionSnapshot(prev: Snapshot, cur: Snapshot): Snapshot {
  const merged = structuredClone(cur)
  for (const [name, table] of Object.entries(prev.tables ?? {}) as [string, Snapshot][]) {
    const target = merged.tables[name]
    if (!target) {
      merged.tables[name] = structuredClone(table)
      continue
    }
    for (const key of [
      'columns',
      'indexes',
      'foreignKeys',
      'compositePrimaryKeys',
      'uniqueConstraints',
      'checkConstraints',
    ]) {
      target[key] ??= {}
      for (const [entry, value] of Object.entries(table[key] ?? {})) {
        if (!(entry in target[key])) target[key][entry] = structuredClone(value)
      }
    }
  }
  return merged
}

/** SQL statements that turn `prev` into `cur`. Renames become drop + add unless `interactive`. */
async function diff(prev: Snapshot, cur: Snapshot, interactive: boolean): Promise<string[]> {
  const api = await kit()
  if (interactive) return api.generateSQLiteMigration(prev as never, cur as never)
  const union = unionSnapshot(prev, cur)
  const adds = await api.generateSQLiteMigration(prev as never, union as never)
  const drops = await api.generateSQLiteMigration(union as never, cur as never)
  return [...adds, ...drops]
}

const DESTRUCTIVE = /\b(DROP TABLE|DROP COLUMN)\b|`__new_/i

interface MigrationRow {
  name: string
  snapshot: string | null
  hash: string | null
}

interface MigrationFile {
  name: string
  statements: string[]
  hash: string
  snapshot: Snapshot
}

export interface MigratorOptions {
  readonly client: Client
  readonly schema: SchemaModel
  readonly table: string
  readonly dir: string
  readonly logger: Logger
  readonly interactive: boolean
}

/** Name of the record that stores the schema applied by development push. */
const DEV_PUSH = 'dev'

export class Migrator {
  constructor(private readonly options: MigratorOptions) {}

  private get client() {
    return this.options.client
  }

  async ensureTable() {
    await this.client.execute(
      `CREATE TABLE IF NOT EXISTS \`${this.options.table}\` (
        \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        \`name\` text NOT NULL UNIQUE,
        \`hash\` text,
        \`snapshot\` text,
        \`applied_at\` text NOT NULL
      )`,
    )
  }

  private async applied(): Promise<MigrationRow[]> {
    const result = await this.client.execute(
      `SELECT name, hash, snapshot FROM \`${this.options.table}\` ORDER BY id`,
    )
    return result.rows.map((r) => ({
      name: String(r.name),
      hash: r.hash === null ? null : String(r.hash),
      snapshot: r.snapshot === null ? null : String(r.snapshot),
    }))
  }

  /** The schema the database is currently in, according to the migrations table. */
  private async currentSnapshot(rows: MigrationRow[]): Promise<Snapshot> {
    const last = [...rows].reverse().find((r) => r.snapshot !== null)
    return last?.snapshot ? JSON.parse(last.snapshot) : snapshotOf(null)
  }

  /** Development: bring the database in line with the config without migration files. */
  async push() {
    await this.ensureTable()
    const rows = await this.applied()
    const devRow = rows.find((r) => r.name === DEV_PUSH)
    if (devRow?.hash === this.options.schema.hash) return

    const prev = await this.currentSnapshot(devRow ? [devRow] : rows)
    const cur = await snapshotOf(this.options.schema)
    const statements = await diff(prev, cur, false)

    if (statements.some((s) => DESTRUCTIVE.test(s))) {
      this.options.logger.warn('Schema push drops tables or columns; data in them is lost.')
    }
    const record: InStatement = {
      sql: `INSERT INTO \`${this.options.table}\` (name, hash, snapshot, applied_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET hash = excluded.hash, snapshot = excluded.snapshot, applied_at = excluded.applied_at`,
      args: [DEV_PUSH, this.options.schema.hash, JSON.stringify(cur), new Date().toISOString()],
    }
    await this.client.batch([...statements, record], 'write')
    if (statements.length > 0)
      this.options.logger.info(`Schema pushed (${statements.length} statements).`)
  }

  /** Production: refuse to start when the database or migrations lag behind the config. */
  async verify() {
    await this.ensureTable()
    const files = await this.files()
    const rows = await this.applied()
    const appliedNames = new Set(rows.map((r) => r.name))

    const last = files.at(-1)
    if (!last) {
      throw new SchemaError(
        `No migrations found in ${this.options.dir}.\n    → run \`easy-cms migrate:create init\` and deploy the generated files`,
      )
    }
    const pending = files.filter((f) => !appliedNames.has(f.name))
    if (pending.length > 0) {
      throw new SchemaError(
        `${pending.length} pending migration(s): ${pending.map((f) => f.name).join(', ')}.\n    → run \`easy-cms migrate\``,
      )
    }
    if (last.hash !== this.options.schema.hash) {
      throw new SchemaError(
        'The config changed since the last migration.\n    → run `easy-cms migrate:create <name>` and deploy it',
      )
    }
  }

  async create(name: string): Promise<{ name: string; file: string; statements: string[] } | null> {
    const files = await this.files()
    const last = files.at(-1)
    const prev = last ? last.snapshot : await snapshotOf(null)
    const cur = await snapshotOf(this.options.schema)
    const statements = await diff(prev, cur, this.options.interactive)
    if (statements.length === 0 && last?.hash === this.options.schema.hash) return null

    const safeName =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') || 'migration'
    const fullName = `${timestamp()}_${safeName}`
    await mkdir(this.options.dir, { recursive: true })
    const file = join(this.options.dir, `${fullName}.sql`)
    const header = `-- Easy CMS migration ${fullName}\n-- Generated from the config; review before deploying.\n`
    await writeFile(file, `${header}${statements.join(`\n${BREAKPOINT}\n`)}\n`)
    await writeFile(
      join(this.options.dir, `${fullName}.json`),
      `${JSON.stringify({ hash: this.options.schema.hash, snapshot: cur }, null, 2)}\n`,
    )
    return { name: fullName, file, statements }
  }

  async migrate(): Promise<string[]> {
    await this.ensureTable()
    const rows = await this.applied()
    if (rows.some((r) => r.name === DEV_PUSH)) {
      throw new SchemaError(
        'This database was set up by development schema push, so migrations cannot be applied to it.\n    → run migrations against a fresh database, or delete the database file in development',
      )
    }
    const appliedNames = new Set(rows.map((r) => r.name))
    const pending = (await this.files()).filter((f) => !appliedNames.has(f.name))

    for (const migration of pending) {
      const record: InStatement = {
        sql: `INSERT INTO \`${this.options.table}\` (name, hash, snapshot, applied_at) VALUES (?, ?, ?, ?)`,
        args: [
          migration.name,
          migration.hash,
          JSON.stringify(migration.snapshot),
          new Date().toISOString(),
        ],
      }
      try {
        // One batch = one transaction: a failing migration is rolled back and not recorded.
        await this.client.batch([...migration.statements, record], 'write')
      } catch (error) {
        throw new SchemaError(
          `Migration ${migration.name} failed and was rolled back: ${(error as Error).message}`,
        )
      }
      this.options.logger.info(`Applied ${migration.name}`)
    }
    return pending.map((m) => m.name)
  }

  async status(): Promise<{ name: string; applied: boolean }[]> {
    await this.ensureTable()
    const appliedNames = new Set((await this.applied()).map((r) => r.name))
    return (await this.files()).map((f) => ({ name: f.name, applied: appliedNames.has(f.name) }))
  }

  private async files(): Promise<MigrationFile[]> {
    let entries: string[]
    try {
      entries = await readdir(this.options.dir)
    } catch {
      return []
    }
    const names = entries
      .filter((e) => e.endsWith('.sql'))
      .map((e) => e.slice(0, -4))
      .sort()
    return Promise.all(
      names.map(async (name) => {
        const sqlText = await readFile(join(this.options.dir, `${name}.sql`), 'utf8')
        const meta = JSON.parse(await readFile(join(this.options.dir, `${name}.json`), 'utf8'))
        const statements = sqlText
          .split(BREAKPOINT)
          .map((s) =>
            s
              .split('\n')
              .filter((line) => !line.startsWith('--'))
              .join('\n')
              .trim(),
          )
          .filter((s) => s.length > 0)
        return { name, statements, hash: meta.hash, snapshot: meta.snapshot }
      }),
    )
  }
}

function timestamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
}
