import type { SQL } from 'drizzle-orm'

// Drizzle's table, column and database types differ per dialect. The shared layer works with
// them structurally; each adapter supplies the dialect-specific pieces below.
// biome-ignore lint/suspicious/noExplicitAny: see above
export type AnyTable = any
// biome-ignore lint/suspicious/noExplicitAny: see above
export type AnyColumn = any
// biome-ignore lint/suspicious/noExplicitAny: see above
export type ColumnBuilder = any
// biome-ignore lint/suspicious/noExplicitAny: see above
export type IndexBuilder = any
/** A Drizzle database or transaction (libSQL, postgres.js, PGlite…). */
// biome-ignore lint/suspicious/noExplicitAny: see above
export type DrizzleDb = any

/** drizzle-kit's snapshot JSON for one dialect. */
// biome-ignore lint/suspicious/noExplicitAny: drizzle-kit does not export a stable snapshot type
export type Snapshot = Record<string, any>

export interface Statement {
  readonly sql: string
  readonly params?: readonly unknown[]
}

/** Raw SQL access for the migrations table and migration files. */
export interface SqlRunner {
  query(sql: string, params?: readonly unknown[]): Promise<Record<string, unknown>[]>
  /** Runs the statements in one transaction: all or nothing. */
  transaction(statements: readonly Statement[]): Promise<void>
}

/** What differs between SQL dialects. */
export interface Dialect {
  readonly name: 'sqlite' | 'postgres'

  table(
    name: string,
    columns: Record<string, ColumnBuilder>,
    indexes: (t: Record<string, AnyColumn>) => IndexBuilder[],
  ): AnyTable
  index(name: string): { on(column: AnyColumn): IndexBuilder }
  uniqueIndex(name: string): { on(column: AnyColumn): IndexBuilder }

  /** Auto-incrementing integer primary key. */
  serial(name: string): ColumnBuilder
  text(name: string): ColumnBuilder
  integer(name: string): ColumnBuilder
  /** Floating point. */
  number(name: string): ColumnBuilder
  boolean(name: string): ColumnBuilder
  json(name: string): ColumnBuilder

  /** Case-insensitive substring match; `pattern` is already escaped and wrapped in `%`. */
  like(column: AnyColumn, pattern: string): SQL
  /** Placeholder for the n-th parameter (1-based) in raw SQL. */
  param(n: number): string
  /** CREATE TABLE IF NOT EXISTS for the migrations table. */
  migrationsTableSQL(name: string): string

  /** drizzle-kit snapshot of the given tables. Loaded lazily (only dev and the CLI need it). */
  snapshot(tables: Readonly<Record<string, AnyTable>>): Promise<Snapshot>
  /** SQL statements turning one snapshot into another. May prompt about renames when interactive. */
  migration(prev: Snapshot, cur: Snapshot): Promise<string[]>
}
