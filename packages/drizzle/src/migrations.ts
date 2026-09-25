import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { type Logger, SchemaError } from '@easy-cms/core'
import type { Dialect, Snapshot, SqlRunner, Statement } from './dialect.js'
import type { SchemaModel } from './schema.js'

const BREAKPOINT = '--> statement-breakpoint'
const TABLE_PARTS = [
  'columns',
  'indexes',
  'foreignKeys',
  'compositePrimaryKeys',
  'uniqueConstraints',
  'checkConstraints',
  'policies',
]

/**
 * Unions two snapshots: every table, column and index from either side.
 * Diffing prev → union → cur splits a change into "add only" and "drop only"
 * steps, so drizzle-kit never has to ask whether something was renamed.
 */
export function unionSnapshot(prev: Snapshot, cur: Snapshot): Snapshot {
  const merged = structuredClone(cur)
  for (const [name, table] of Object.entries(prev.tables ?? {}) as [string, Snapshot][]) {
    const target = merged.tables[name]
    if (!target) {
      merged.tables[name] = structuredClone(table)
      continue
    }
    for (const key of TABLE_PARTS) {
      if (!(key in table)) continue
      target[key] ??= {}
      for (const [entry, value] of Object.entries(table[key] ?? {})) {
        if (!(entry in target[key])) target[key][entry] = structuredClone(value)
      }
    }
  }
  return merged
}

const DESTRUCTIVE = /\b(DROP TABLE|DROP COLUMN)\b|__new_/i

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
  readonly dialect: Dialect
  readonly runner: SqlRunner
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

  private get runner() {
    return this.options.runner
  }

  private q(name: string) {
    return this.options.dialect.name === 'postgres' ? `"${name}"` : `\`${name}\``
  }

  private snapshotOf(schema: SchemaModel | null): Promise<Snapshot> {
    return this.options.dialect.snapshot(schema ? schema.tables : {})
  }

  /** SQL statements that turn `prev` into `cur`. Renames become drop + add unless interactive. */
  private async diff(prev: Snapshot, cur: Snapshot, interactive: boolean): Promise<string[]> {
    const { dialect } = this.options
    if (interactive) return dialect.migration(prev, cur)
    const union = unionSnapshot(prev, cur)
    return [...(await dialect.migration(prev, union)), ...(await dialect.migration(union, cur))]
  }

  async ensureTable() {
    await this.runner.query(this.options.dialect.migrationsTableSQL(this.options.table))
  }

  private record(name: string, hash: string, snapshot: Snapshot, upsert: boolean): Statement {
    const p = (n: number) => this.options.dialect.param(n)
    const table = this.q(this.options.table)
    const conflict = upsert
      ? ' ON CONFLICT(name) DO UPDATE SET hash = excluded.hash, snapshot = excluded.snapshot, applied_at = excluded.applied_at'
      : ''
    return {
      sql: `INSERT INTO ${table} (name, hash, snapshot, applied_at) VALUES (${p(1)}, ${p(2)}, ${p(3)}, ${p(4)})${conflict}`,
      params: [name, hash, JSON.stringify(snapshot), new Date().toISOString()],
    }
  }

  private async applied(): Promise<MigrationRow[]> {
    const rows = await this.runner.query(
      `SELECT name, hash, snapshot FROM ${this.q(this.options.table)} ORDER BY id`,
    )
    return rows.map((r) => ({
      name: String(r.name),
      hash: r.hash === null ? null : String(r.hash),
      snapshot: r.snapshot === null ? null : String(r.snapshot),
    }))
  }

  /** The schema the database is currently in, according to the migrations table. */
  private async currentSnapshot(rows: MigrationRow[]): Promise<Snapshot> {
    const last = [...rows].reverse().find((r) => r.snapshot !== null)
    return last?.snapshot ? JSON.parse(last.snapshot) : this.snapshotOf(null)
  }

  /** Development: bring the database in line with the config without migration files. */
  async push() {
    await this.ensureTable()
    const rows = await this.applied()
    const devRow = rows.find((r) => r.name === DEV_PUSH)
    if (devRow?.hash === this.options.schema.hash) return

    const prev = await this.currentSnapshot(devRow ? [devRow] : rows)
    const cur = await this.snapshotOf(this.options.schema)
    const statements = await this.diff(prev, cur, false)
    if (statements.some((s) => DESTRUCTIVE.test(s))) {
      this.options.logger.warn('Schema push drops tables or columns; data in them is lost.')
    }
    await this.runner.transaction([
      ...statements.map((sql) => ({ sql })),
      this.record(DEV_PUSH, this.options.schema.hash, cur, true),
    ])
    if (statements.length > 0)
      this.options.logger.info(`Schema pushed (${statements.length} statements).`)
  }

  /** Production: refuse to start when the database or migrations lag behind the config. */
  async verify() {
    await this.ensureTable()
    const files = await this.files()
    const appliedNames = new Set((await this.applied()).map((r) => r.name))

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
    const prev = last ? last.snapshot : await this.snapshotOf(null)
    const cur = await this.snapshotOf(this.options.schema)
    const statements = await this.diff(prev, cur, this.options.interactive)
    if (statements.length === 0 && last?.hash === this.options.schema.hash) return null

    const safeName =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') || 'migration'
    const fullName = `${timestamp()}_${safeName}`
    await mkdir(this.options.dir, { recursive: true })
    const file = join(this.options.dir, `${fullName}.sql`)
    const header = `-- Easy CMS migration ${fullName} (${this.options.dialect.name})\n-- Generated from the config; review before deploying.\n`
    await writeFile(file, `${header}${statements.join(`\n${BREAKPOINT}\n`)}\n`)
    await writeFile(
      join(this.options.dir, `${fullName}.json`),
      `${JSON.stringify({ dialect: this.options.dialect.name, hash: this.options.schema.hash, snapshot: cur }, null, 2)}\n`,
    )
    return { name: fullName, file, statements }
  }

  async migrate(): Promise<string[]> {
    await this.ensureTable()
    const rows = await this.applied()
    if (rows.some((r) => r.name === DEV_PUSH)) {
      throw new SchemaError(
        'This database was set up by development schema push, so migrations cannot be applied to it.\n    → run migrations against a fresh database, or reset the development database',
      )
    }
    const appliedNames = new Set(rows.map((r) => r.name))
    const pending = (await this.files()).filter((f) => !appliedNames.has(f.name))

    for (const migration of pending) {
      try {
        // One transaction per migration: a failure is rolled back and not recorded.
        await this.runner.transaction([
          ...migration.statements.map((sql) => ({ sql })),
          this.record(migration.name, migration.hash, migration.snapshot, false),
        ])
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
        if (meta.dialect && meta.dialect !== this.options.dialect.name) {
          throw new SchemaError(
            `Migration ${name} was created for ${meta.dialect}, but the database is ${this.options.dialect.name}.`,
          )
        }
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
