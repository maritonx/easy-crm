import type { ID, Where } from './access.js'
import type { CollectionConfig, Config, GlobalConfig, ResolvedConfig } from './config.js'
import type { Database, PaginatedDocs, RawDocument, SchemaMode } from './database.js'
import {
  applyDefaults,
  fillMissing,
  generateSlugs,
  mergeForUpdate,
  parseId,
  type Reference,
  validateFields,
} from './document.js'
import { type FieldError, NotFoundError, QueryError, ValidationError } from './errors.js'
import type { Field } from './fields.js'
import type {
  CollectionDocument,
  CollectionSlug,
  CreateInput,
  GlobalDocument,
  GlobalInput,
  GlobalSlug,
  UpdateInput,
} from './infer.js'
import { consoleLogger, type Logger } from './logger.js'
import { DEFAULT_DEPTH, MAX_DEPTH, populate } from './populate.js'
import { resolveConfig } from './resolve-config.js'

type Data = Record<string, unknown>

// When the config type is not a literal (e.g. loaded at runtime), fall back to loose types.
type Slug<C extends Config> = string extends CollectionSlug<C> ? string : CollectionSlug<C>
type GSlug<C extends Config> = string extends GlobalSlug<C> ? string : GlobalSlug<C>
type Doc<C extends Config, S> =
  string extends CollectionSlug<C> ? RawDocument : CollectionDocument<C, S & CollectionSlug<C>>
type Create<C extends Config, S> =
  string extends CollectionSlug<C> ? Data : CreateInput<C, S & CollectionSlug<C>>
type Update<C extends Config, S> =
  string extends CollectionSlug<C> ? Data : UpdateInput<C, S & CollectionSlug<C>>
type GDoc<C extends Config, S> =
  string extends GlobalSlug<C> ? Data : GlobalDocument<C, S & GlobalSlug<C>>
type GInput<C extends Config, S> =
  string extends GlobalSlug<C> ? Data : GlobalInput<C, S & GlobalSlug<C>>

export interface FindOptions {
  readonly where?: Where
  /** Field path, `-` prefix for descending. Default `-createdAt`. */
  readonly sort?: string | readonly string[]
  /** Default 10. `0` returns every document. */
  readonly limit?: number
  /** 1-based. Default 1. */
  readonly page?: number
  /** How many levels of relationships to populate. Default 1, maximum 3. */
  readonly depth?: number
}

export interface DepthOptions {
  readonly depth?: number
}

export interface CreateEasyCMSOptions {
  /** Project root. Default `process.cwd()`. */
  readonly cwd?: string
  /** Default `verify` when `NODE_ENV=production`, otherwise `push`. */
  readonly schema?: SchemaMode
  readonly logger?: Logger
  readonly interactive?: boolean
}

/** Connects to the database and returns the Local API. */
export async function createEasyCMS<const C extends Config>(
  config: C,
  options: CreateEasyCMSOptions = {},
): Promise<EasyCMS<C>> {
  const resolved = await resolveConfig(config)
  const logger = options.logger ?? consoleLogger
  const db = await resolved.db.init({
    config: resolved,
    cwd: options.cwd ?? process.cwd(),
    schema: options.schema ?? (process.env.NODE_ENV === 'production' ? 'verify' : 'push'),
    logger,
    interactive: options.interactive ?? false,
  })
  return new EasyCMS<C>(resolved, db)
}

export class EasyCMS<C extends Config = Config> {
  readonly config: ResolvedConfig
  readonly db: Database

  constructor(config: ResolvedConfig, db: Database) {
    this.config = config
    this.db = db
  }

  async find<S extends Slug<C>>(
    collection: S,
    options: FindOptions = {},
  ): Promise<PaginatedDocs<Doc<C, S>>> {
    const config = this.collection(collection)
    const limit = options.limit ?? 10
    const page = options.page ?? 1
    if (!Number.isInteger(limit) || limit < 0)
      throw new QueryError('limit must be a non-negative integer')
    if (!Number.isInteger(page) || page < 1) throw new QueryError('page must be a positive integer')

    const sort = options.sort === undefined ? ['-createdAt'] : [options.sort].flat()
    const result = await this.db.find({ collection, where: options.where, sort, limit, page })
    const docs = await this.populate(config.fields, result.docs, options.depth)
    return { ...result, docs: docs as Doc<C, S>[] }
  }

  async findById<S extends Slug<C>>(
    collection: S,
    id: ID,
    options: DepthOptions = {},
  ): Promise<Doc<C, S> | null> {
    const config = this.collection(collection)
    const parsed = parseId(id)
    if (parsed === undefined) return null
    const doc = await this.db.findById({ collection, id: parsed })
    if (!doc) return null
    const [populated] = await this.populate(config.fields, [doc], options.depth)
    return (populated ?? null) as Doc<C, S> | null
  }

  async count<S extends Slug<C>>(collection: S, options: { where?: Where } = {}): Promise<number> {
    this.collection(collection)
    return this.db.count({ collection, where: options.where })
  }

  async create<S extends Slug<C>>(
    collection: S,
    data: Create<C, S>,
    options: DepthOptions = {},
  ): Promise<Doc<C, S>> {
    const config = this.collection(collection)
    const input = asObject(data, collection)

    let prepared = generateSlugs(config.fields, applyDefaults(config.fields, input))
    prepared = await this.prepare(config, prepared, 'create', undefined)

    const now = new Date().toISOString()
    const doc = await this.db.create({
      collection,
      data: { ...prepared, createdAt: now, updatedAt: now },
    })
    const [populated] = await this.populate(config.fields, [doc], options.depth)
    return populated as Doc<C, S>
  }

  async update<S extends Slug<C>>(
    collection: S,
    id: ID,
    data: Update<C, S>,
    options: DepthOptions = {},
  ): Promise<Doc<C, S>> {
    const config = this.collection(collection)
    const input = asObject(data, collection)
    const parsed = parseId(id)
    const existing =
      parsed === undefined ? null : await this.db.findById({ collection, id: parsed })
    if (!existing || parsed === undefined) throw new NotFoundError(collection, id)

    const merged = generateSlugs(config.fields, mergeForUpdate(config.fields, existing, input))
    if (config.drafts)
      merged.status = Object.hasOwn(input, 'status') ? input.status : existing.status
    const prepared = await this.prepare(config, merged, 'update', parsed)

    const doc = await this.db.update({
      collection,
      id: parsed,
      data: { ...prepared, createdAt: existing.createdAt, updatedAt: new Date().toISOString() },
    })
    const [populated] = await this.populate(config.fields, [doc], options.depth)
    return populated as Doc<C, S>
  }

  async delete<S extends Slug<C>>(collection: S, id: ID): Promise<Doc<C, S>> {
    this.collection(collection)
    const parsed = parseId(id)
    const existing =
      parsed === undefined ? null : await this.db.findById({ collection, id: parsed })
    if (!existing || parsed === undefined) throw new NotFoundError(collection, id)
    await this.db.delete({ collection, id: parsed })
    return existing as Doc<C, S>
  }

  async findGlobal<S extends GSlug<C>>(slug: S, options: DepthOptions = {}): Promise<GDoc<C, S>> {
    const config = this.global(slug)
    const stored = await this.db.findGlobal({ slug })
    const data = fillMissing(config.fields, applyDefaults(config.fields, stored ?? {}))
    if (!stored) {
      data.updatedAt = null
      if (config.drafts) data.status = 'draft'
    }
    const [populated] = await this.populate(config.fields, [{ ...data, id: 0 }], options.depth)
    const { id: _id, ...doc } = populated as RawDocument
    return doc as GDoc<C, S>
  }

  async updateGlobal<S extends GSlug<C>>(
    slug: S,
    data: GInput<C, S>,
    options: DepthOptions = {},
  ): Promise<GDoc<C, S>> {
    const config = this.global(slug)
    const input = asObject(data, slug)
    const existing = (await this.db.findGlobal({ slug })) ?? {}

    const merged = generateSlugs(
      config.fields,
      applyDefaults(config.fields, mergeForUpdate(config.fields, existing, input)),
    )
    if (config.drafts) merged.status = input.status ?? existing.status ?? 'draft'
    const prepared = await this.prepare(config, merged, 'update', undefined)

    await this.db.updateGlobal({ slug, data: { ...prepared, updatedAt: new Date().toISOString() } })
    return this.findGlobal(slug, options)
  }

  /** Closes the database connection. */
  async destroy(): Promise<void> {
    await this.db.destroy()
  }

  // -------------------------------------------------------------------------

  private collection(slug: string): CollectionConfig {
    const config = this.config.collections.find((c) => c.slug === slug)
    if (!config) throw new QueryError(`Unknown collection "${slug}"`)
    return config
  }

  private global(slug: string): GlobalConfig {
    const config = this.config.globals.find((g) => g.slug === slug)
    if (!config) throw new QueryError(`Unknown global "${slug}"`)
    return config
  }

  private populate(fields: readonly Field[], docs: RawDocument[], depth = DEFAULT_DEPTH) {
    const clamped = Math.max(0, Math.min(MAX_DEPTH, Math.trunc(depth)))
    return populate(this.db, this.config.collections, fields, docs, clamped)
  }

  /** Validates, checks uniqueness and references. Returns clean data or throws `ValidationError`. */
  private async prepare(
    config: CollectionConfig | GlobalConfig,
    data: Data,
    operation: 'create' | 'update',
    selfId: ID | undefined,
  ): Promise<Data> {
    const result = await validateFields(config.fields, data, { operation, root: data })
    const errors: FieldError[] = [...result.errors]
    const clean: Data = { ...result.data }

    if (config.drafts) {
      const status = data.status ?? 'draft'
      if (status !== 'draft' && status !== 'published') {
        errors.push({ field: 'status', message: 'must be "draft" or "published"' })
      }
      clean.status = status
    }

    const isCollection = this.config.collections.includes(config as CollectionConfig)
    if (isCollection && errors.length === 0) {
      await this.makeSlugsUnique(config as CollectionConfig, clean, selfId)
      errors.push(...(await this.checkUnique(config as CollectionConfig, clean, selfId)))
    }
    errors.push(...(await this.checkReferences(result.references)))

    if (errors.length > 0) throw new ValidationError(config.slug, errors)
    return clean
  }

  private async makeSlugsUnique(config: CollectionConfig, data: Data, selfId: ID | undefined) {
    for (const field of config.fields) {
      const base = data[field.name]
      if (field.type !== 'slug' || typeof base !== 'string' || base === '') continue
      let candidate = base
      for (let n = 2; await this.isTaken(config.slug, field.name, candidate, selfId); n++) {
        candidate = `${base}-${n}`
      }
      data[field.name] = candidate
    }
  }

  private async checkUnique(
    config: CollectionConfig,
    data: Data,
    selfId: ID | undefined,
  ): Promise<FieldError[]> {
    const errors: FieldError[] = []
    for (const field of config.fields) {
      const value = data[field.name]
      if (!field.unique || field.type === 'slug' || value === null || value === undefined) continue
      if (await this.isTaken(config.slug, field.name, value, selfId)) {
        errors.push({ field: field.name, message: 'must be unique' })
      }
    }
    return errors
  }

  private async isTaken(collection: string, field: string, value: unknown, selfId: ID | undefined) {
    const where: Where =
      selfId === undefined
        ? { [field]: { equals: value } }
        : { and: [{ [field]: { equals: value } }, { id: { not_equals: selfId } }] }
    return (await this.db.count({ collection, where })) > 0
  }

  private async checkReferences(references: readonly Reference[]): Promise<FieldError[]> {
    const byCollection = new Map<string, Reference[]>()
    for (const ref of references) {
      // Built-in collections (users, media) are checked once they exist (M2/M5).
      if (!this.config.collections.some((c) => c.slug === ref.collection)) continue
      byCollection.set(ref.collection, [...(byCollection.get(ref.collection) ?? []), ref])
    }
    const errors: FieldError[] = []
    for (const [collection, refs] of byCollection) {
      const found = await this.db.findByIds({
        collection,
        ids: [...new Set(refs.map((r) => r.id))],
      })
      const ids = new Set(found.map((d) => d.id))
      for (const ref of refs) {
        if (!ids.has(ref.id))
          errors.push({ field: ref.field, message: `${collection} ${ref.id} does not exist` })
      }
    }
    return errors
  }
}

function asObject(data: unknown, name: string): Data {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new ValidationError(name, [{ field: '', message: 'data must be an object' }])
  }
  return data as Data
}
