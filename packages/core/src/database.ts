import type { ID, Where } from './access.js'
import type { ResolvedConfig } from './config.js'
import type { Logger } from './logger.js'

/** A document as stored: relationships and uploads are ids, never populated. */
export type RawDocument = Record<string, unknown> & { id: ID }

export interface PaginatedDocs<T> {
  docs: T[]
  totalDocs: number
  limit: number
  page: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

/**
 * How the adapter treats the database schema on startup.
 * - `push`: apply schema changes directly (development).
 * - `verify`: fail if migrations are pending or the config changed without a migration (production).
 * - `skip`: do nothing (used by the migration CLI).
 */
export type SchemaMode = 'push' | 'verify' | 'skip'

export interface DatabaseInitArgs {
  readonly config: ResolvedConfig
  /** Project root; relative paths (database file, migrations) resolve from here. */
  readonly cwd: string
  readonly schema: SchemaMode
  readonly logger: Logger
  /** Whether the process can prompt the user (the CLI in a terminal). */
  readonly interactive?: boolean
}

export interface FindArgs {
  readonly collection: string
  readonly where?: Where | undefined
  /** Field paths; prefix with `-` for descending. */
  readonly sort: readonly string[]
  /** `0` returns every matching document. */
  readonly limit: number
  readonly page: number
}

export interface MigrationInfo {
  readonly name: string
  readonly applied: boolean
}

export interface CreateMigrationResult {
  readonly name: string
  readonly file: string
  readonly statements: readonly string[]
}

/** A connected database bound to one config. Returned by `DatabaseAdapter.init`. */
export interface Database {
  find(args: FindArgs): Promise<PaginatedDocs<RawDocument>>
  findById(args: { collection: string; id: ID }): Promise<RawDocument | null>
  /** Documents of one collection by id, in any order. Used to populate relationships. */
  findByIds(args: { collection: string; ids: readonly ID[] }): Promise<RawDocument[]>
  count(args: { collection: string; where?: Where | undefined }): Promise<number>
  /** `data` holds every field, `createdAt` and `updatedAt`. Runs in one transaction. */
  create(args: { collection: string; data: Record<string, unknown> }): Promise<RawDocument>
  /** `data` holds the whole document after merging. Runs in one transaction. */
  update(args: { collection: string; id: ID; data: Record<string, unknown> }): Promise<RawDocument>
  delete(args: { collection: string; id: ID }): Promise<void>
  findGlobal(args: { slug: string }): Promise<Record<string, unknown> | null>
  updateGlobal(args: {
    slug: string
    data: Record<string, unknown>
  }): Promise<Record<string, unknown>>

  /** Writes a migration file for the difference between the config and the latest migration. `null` when nothing changed. */
  createMigration(args: { name: string }): Promise<CreateMigrationResult | null>
  /** Applies pending migrations in order. Returns the names applied. */
  migrate(): Promise<string[]>
  migrationStatus(): Promise<MigrationInfo[]>

  destroy(): Promise<void>
}

/** What `sqlite()` / `postgres()` return and what `config.db` holds. */
export interface DatabaseAdapter {
  readonly name: string
  init(args: DatabaseInitArgs): Promise<Database>
}
