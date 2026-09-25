import { randomBytes } from 'node:crypto'
import type { AuthUser, ID, Where } from './access.js'
import {
  andWhere,
  evaluateAccess,
  FieldAccessChecker,
  filterInput,
  stripFields,
} from './access-control.js'
import { Auth } from './auth/auth.js'
import { hashPassword, MIN_PASSWORD_LENGTH } from './auth/password.js'
import { MEDIA, USERS } from './builtins.js'
import type { CollectionConfig, Config, GlobalConfig, ImageSize, ResolvedConfig } from './config.js'
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
import {
  type FieldError,
  ForbiddenError,
  NotFoundError,
  PayloadTooLargeError,
  QueryError,
  UnauthorizedError,
  ValidationError,
} from './errors.js'
import type {
  CollectionDocument,
  CollectionSlug,
  CreateInput,
  GlobalDocument,
  GlobalInput,
  GlobalSlug,
  MediaDocument,
  UpdateInput,
} from './infer.js'
import { consoleLogger, type Logger } from './logger.js'
import { imageDimensions, mimeAllowed, sniffMimeType, storageKey } from './media.js'
import { DEFAULT_DEPTH, type Loader, MAX_DEPTH, populate } from './populate.js'
import { resolveConfig } from './resolve-config.js'
import { localStorage, type StorageAdapter } from './storage.js'

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

export interface AccessOptions {
  /**
   * The Local API trusts its caller and skips access rules by default.
   * Pass `false` (with `user`) to apply them, as the REST API does.
   */
  readonly overrideAccess?: boolean
  /** The user to check access for. `null` = not logged in. */
  readonly user?: AuthUser | null
}

export interface DepthOptions extends AccessOptions {
  /** How many levels of relationships to populate. Default 1, maximum 3. */
  readonly depth?: number
}

export interface ReadOptions extends DepthOptions {
  /**
   * Include drafts. By default only published documents of collections with
   * `drafts: true` are returned, including when populating relationships (FR-DRF-04).
   */
  readonly draft?: boolean
}

export interface FindOptions extends ReadOptions {
  readonly where?: Where
  /** Field path, `-` prefix for descending. Default `-createdAt`. */
  readonly sort?: string | readonly string[]
  /** Default 10. `0` returns every document. */
  readonly limit?: number
  /** 1-based. Default 1. */
  readonly page?: number
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
  const cwd = options.cwd ?? process.cwd()
  const storage = resolved.upload.storage ?? localStorage({ dir: resolved.upload.dir })
  await storage.init?.({ cwd })
  const db = await resolved.db.init({
    config: resolved,
    cwd,
    schema: options.schema ?? (process.env.NODE_ENV === 'production' ? 'verify' : 'push'),
    logger,
    interactive: options.interactive ?? false,
  })
  return new EasyCMS<C>(resolved, db, logger, storage)
}

/** Access has been checked (or skipped) for one call. */
interface Guard {
  readonly enforce: boolean
  readonly user: AuthUser | null
}

export class EasyCMS<C extends Config = Config> {
  readonly config: ResolvedConfig
  readonly db: Database
  readonly logger: Logger
  /** Login, logout and session checks. */
  readonly auth: Auth
  /** Where uploaded files are stored. */
  readonly storage: StorageAdapter

  constructor(
    config: ResolvedConfig,
    db: Database,
    logger: Logger = consoleLogger,
    storage: StorageAdapter = localStorage({ dir: config.upload.dir }),
  ) {
    this.config = config
    this.db = db
    this.logger = logger
    this.storage = storage
    this.auth = new Auth(this as unknown as EasyCMS)
  }

  async find<S extends Slug<C>>(
    collection: S,
    options: FindOptions = {},
  ): Promise<PaginatedDocs<Doc<C, S>>> {
    const config = this.collection(collection)
    const guard = guardOf(options)
    const limit = options.limit ?? 10
    const page = options.page ?? 1
    if (!Number.isInteger(limit) || limit < 0)
      throw new QueryError('limit must be a non-negative integer')
    if (!Number.isInteger(page) || page < 1) throw new QueryError('page must be a positive integer')

    const where = draftWhere(
      config,
      options.draft,
      await this.readWhere(config, guard, options.where),
    )
    const sort = options.sort === undefined ? ['-createdAt'] : [options.sort].flat()
    const result = await this.db.find({ collection, where, sort, limit, page })
    const docs = await this.output(config, result.docs, guard, options)
    return { ...result, docs: docs as Doc<C, S>[] }
  }

  async findById<S extends Slug<C>>(
    collection: S,
    id: ID,
    options: ReadOptions = {},
  ): Promise<Doc<C, S> | null> {
    const config = this.collection(collection)
    const guard = guardOf(options)
    const parsed = parseId(id)
    if (parsed === undefined) return null
    const where = draftWhere(config, options.draft, await this.readWhere(config, guard, undefined))
    const doc = where
      ? (
          await this.db.find({
            collection,
            where: andWhere(where, { id: { equals: parsed } }),
            sort: [],
            limit: 1,
            page: 1,
          })
        ).docs[0]
      : await this.db.findById({ collection, id: parsed })
    if (!doc) return null
    const [out] = await this.output(config, [doc], guard, options)
    return (out ?? null) as Doc<C, S> | null
  }

  async count<S extends Slug<C>>(
    collection: S,
    options: { where?: Where; draft?: boolean } & AccessOptions = {},
  ): Promise<number> {
    const config = this.collection(collection)
    const where = draftWhere(
      config,
      options.draft,
      await this.readWhere(config, guardOf(options), options.where),
    )
    return this.db.count({ collection, where })
  }

  async create<S extends Slug<C>>(
    collection: S,
    data: Create<C, S>,
    options: DepthOptions = {},
  ): Promise<Doc<C, S>> {
    const config = this.collection(collection)
    if (config.slug === MEDIA) {
      throw new ValidationError(MEDIA, [
        { field: 'file', message: 'upload files with cms.upload() or POST multipart' },
      ])
    }
    return (await this.createDocument(config, asObject(data, collection), options)) as Doc<C, S>
  }

  /**
   * Stores a file and creates its `media` document (FR-UPL). The type is detected from
   * the contents; images get width/height, and resized copies when `sharp` is installed.
   */
  async upload(
    file: { data: Uint8Array; name: string },
    data: Record<string, unknown> = {},
    options: DepthOptions = {},
  ): Promise<MediaDocument> {
    const config = this.collection(MEDIA)
    const guard = guardOf(options)
    if (guard.enforce) {
      const allowed = await evaluateAccess(config.access?.create, { user: guard.user, data })
      if (allowed !== true) throw deny(guard.user)
    }
    const { maxFileSize, mimeTypes, imageSizes } = this.config.upload
    if (file.data.byteLength > maxFileSize) {
      throw new PayloadTooLargeError(`File is larger than ${maxFileSize} bytes`)
    }
    if (file.data.byteLength === 0)
      throw new ValidationError(MEDIA, [{ field: 'file', message: 'is empty' }])
    const mimeType = sniffMimeType(file.data)
    if (!mimeType || !mimeAllowed(mimeType, mimeTypes)) {
      throw new ValidationError(MEDIA, [
        {
          field: 'file',
          message: `file type ${mimeType ?? 'unknown'} is not allowed (allowed: ${mimeTypes.join(', ')})`,
        },
      ])
    }

    const random = randomBytes(4).toString('hex')
    const filename = storageKey(file.name, mimeType, random)
    const stored: string[] = []
    try {
      await this.storage.put(filename, file.data, { contentType: mimeType })
      stored.push(filename)
      const dimensions = imageDimensions(file.data, mimeType)
      const sizes = await this.resizeImage(file.data, mimeType, filename, imageSizes, stored)
      const doc = await this.createDocument(
        config,
        {
          ...data,
          filename,
          originalName: file.name.slice(0, 255),
          mimeType,
          filesize: file.data.byteLength,
          width: dimensions?.width ?? null,
          height: dimensions?.height ?? null,
          sizes,
        },
        // System fields are set here, not by the caller: skip field-level update access for them.
        { ...options, overrideAccess: true },
        guard,
      )
      return doc as unknown as MediaDocument
    } catch (error) {
      // Don't leave orphaned files behind when the document could not be created.
      for (const key of stored) await this.storage.delete(key).catch(() => {})
      throw error
    }
  }

  /** Public URL of a stored file. */
  mediaURL(key: string): string {
    const custom = this.storage.url?.(key)
    if (custom) return custom
    return `${this.config.serverURL?.replace(/\/+$/, '') ?? ''}${this.config.routes.api}/media/file/${encodeURIComponent(key)}`
  }

  async update<S extends Slug<C>>(
    collection: S,
    id: ID,
    data: Update<C, S>,
    options: DepthOptions = {},
  ): Promise<Doc<C, S>> {
    const config = this.collection(collection)
    const guard = guardOf(options)
    const raw = asObject(data, collection)
    const parsed = parseId(id)
    const existing =
      parsed === undefined ? null : await this.db.findById({ collection, id: parsed })
    if (!existing || parsed === undefined) throw new NotFoundError(collection, id)
    await this.checkDocumentAccess(config, 'update', guard, parsed, raw)

    const { input, password } = splitPassword(config, raw)
    const filtered = await filterInput(
      config.fields,
      input,
      this.fieldChecker('update', guard, parsed, input),
    )
    let merged = mergeForUpdate(config.fields, existing, filtered)
    if (config.drafts)
      merged.status = Object.hasOwn(filtered, 'status') ? filtered.status : existing.status
    const base = this.hookArgs(config, guard)
    merged = await this.transform(
      config.hooks?.beforeValidate,
      'data',
      { ...base, operation: 'update', originalDoc: existing },
      merged,
    )
    let prepared = await this.prepare(
      config,
      generateSlugs(config.fields, merged),
      'update',
      parsed,
    )
    prepared = await this.transform(
      config.hooks?.beforeChange,
      'data',
      { ...base, operation: 'update', originalDoc: existing },
      prepared,
    )
    if (config.slug === USERS) await this.guardLastAdmin(parsed, existing, prepared)
    if (password !== undefined) prepared.passwordHash = await hashPassword(password)

    const doc = await this.db.update({
      collection,
      id: parsed,
      data: { ...prepared, createdAt: existing.createdAt, updatedAt: new Date().toISOString() },
    })
    // A new password signs the user out everywhere.
    if (password !== undefined) await this.auth.revokeSessions(parsed)
    await this.notify(config.hooks?.afterChange, 'afterChange', config.slug, {
      ...base,
      doc,
      previousDoc: existing,
      operation: 'update',
    })
    const [out] = await this.output(config, [doc], guard, { ...options, draft: true })
    return out as Doc<C, S>
  }

  async delete<S extends Slug<C>>(
    collection: S,
    id: ID,
    options: AccessOptions = {},
  ): Promise<Doc<C, S>> {
    const config = this.collection(collection)
    const guard = guardOf(options)
    const parsed = parseId(id)
    const existing =
      parsed === undefined ? null : await this.db.findById({ collection, id: parsed })
    if (!existing || parsed === undefined) throw new NotFoundError(collection, id)
    await this.checkDocumentAccess(config, 'delete', guard, parsed, undefined)
    if (config.slug === USERS)
      await this.guardLastAdmin(parsed, existing, { ...existing, active: false })
    const base = this.hookArgs(config, guard)
    for (const hook of config.hooks?.beforeDelete ?? []) await hook({ ...base, id: parsed })
    if (config.slug === USERS) await this.auth.revokeSessions(parsed)
    await this.db.delete({ collection, id: parsed })
    await this.notify(config.hooks?.afterDelete, 'afterDelete', config.slug, {
      ...base,
      id: parsed,
      doc: existing,
    })
    const [out] = await this.output(config, [existing], guard, { depth: 0, draft: true })
    return out as Doc<C, S>
  }

  async findGlobal<S extends GSlug<C>>(slug: S, options: ReadOptions = {}): Promise<GDoc<C, S>> {
    const config = this.global(slug)
    const guard = guardOf(options)
    await this.checkGlobalAccess(config, 'read', guard)
    const stored = await this.db.findGlobal({ slug })
    const data = fillMissing(config.fields, applyDefaults(config.fields, stored ?? {}))
    if (!stored) {
      data.updatedAt = null
      if (config.drafts) data.status = 'draft'
    }
    const [out] = await this.output(config, [{ ...data, id: 0 }], guard, options)
    const { id: _id, ...doc } = out as RawDocument
    return doc as GDoc<C, S>
  }

  async updateGlobal<S extends GSlug<C>>(
    slug: S,
    data: GInput<C, S>,
    options: DepthOptions = {},
  ): Promise<GDoc<C, S>> {
    const config = this.global(slug)
    const guard = guardOf(options)
    await this.checkGlobalAccess(config, 'update', guard)
    const raw = asObject(data, slug)
    const input = await filterInput(
      config.fields,
      raw,
      this.fieldChecker('update', guard, undefined, raw),
    )
    const existing = (await this.db.findGlobal({ slug })) ?? {}

    const merged = generateSlugs(
      config.fields,
      applyDefaults(config.fields, mergeForUpdate(config.fields, existing, input)),
    )
    if (config.drafts) merged.status = input.status ?? existing.status ?? 'draft'
    const base = this.hookArgs(config, guard)
    let prepared = await this.prepare(config, merged, 'update', undefined)
    prepared = await this.transform(
      config.hooks?.beforeChange,
      'data',
      { ...base, operation: 'update', originalDoc: existing },
      prepared,
    )

    const doc = await this.db.updateGlobal({
      slug,
      data: { ...prepared, updatedAt: new Date().toISOString() },
    })
    await this.notify(config.hooks?.afterChange, 'afterChange', slug, {
      ...base,
      doc,
      previousDoc: existing,
      operation: 'update',
    })
    return this.findGlobal(slug, { ...options, draft: true })
  }

  /**
   * What `user` may do with one document. Resolves `where`-style access
   * against the document, so the admin UI can hide actions precisely.
   */
  async documentPermissions(
    collection: Slug<C>,
    id: ID,
    user: AuthUser | null,
  ): Promise<{ update: boolean; delete: boolean }> {
    const config = this.collection(collection)
    const parsed = parseId(id)
    if (parsed === undefined) return { update: false, delete: false }
    const guard: Guard = { enforce: true, user }
    const check = (operation: 'update' | 'delete') =>
      this.checkDocumentAccess(config, operation, guard, parsed, undefined).then(
        () => true,
        (error: unknown) => {
          if (error instanceof ForbiddenError || error instanceof UnauthorizedError) return false
          throw error
        },
      )
    return { update: await check('update'), delete: await check('delete') }
  }

  /** Closes the database connection. */
  async destroy(): Promise<void> {
    await this.db.destroy()
  }

  // -------------------------------------------------------------------------

  /** @internal */
  collection(slug: string): CollectionConfig {
    const config = this.config.collections.find((c) => c.slug === slug)
    if (!config) throw new QueryError(`Unknown collection "${slug}"`)
    return config
  }

  private global(slug: string): GlobalConfig {
    const config = this.config.globals.find((g) => g.slug === slug)
    if (!config) throw new QueryError(`Unknown global "${slug}"`)
    return config
  }

  /** The query constraint read access adds, or `undefined` when there is none. Throws when denied. */
  private async readWhere(config: CollectionConfig, guard: Guard, where: Where | undefined) {
    if (!guard.enforce) return where
    const access = await evaluateAccess(config.access?.read, { user: guard.user })
    if (access === false) throw deny(guard.user)
    return andWhere(where, access)
  }

  private async checkDocumentAccess(
    config: CollectionConfig,
    operation: 'update' | 'delete',
    guard: Guard,
    id: ID,
    data: Data | undefined,
  ) {
    if (!guard.enforce) return
    const access = await evaluateAccess(config.access?.[operation], {
      user: guard.user,
      id,
      ...(data ? { data } : {}),
    })
    if (access === true) return
    if (access !== false) {
      const matches = await this.db.count({
        collection: config.slug,
        where: andWhere(access, { id: { equals: id } }),
      })
      if (matches > 0) return
    }
    throw deny(guard.user)
  }

  private async checkGlobalAccess(
    config: GlobalConfig,
    operation: 'read' | 'update',
    guard: Guard,
  ) {
    if (!guard.enforce) return
    const access = await evaluateAccess(config.access?.[operation], { user: guard.user })
    if (typeof access === 'object')
      throw new QueryError(`${operation} access of global "${config.slug}" must return a boolean`)
    if (!access) throw deny(guard.user)
  }

  private fieldChecker(
    kind: 'read' | 'update',
    guard: Guard,
    id: ID | undefined,
    data: Data | undefined,
  ) {
    if (!guard.enforce) return undefined
    return new FieldAccessChecker(kind, {
      user: guard.user,
      ...(id !== undefined ? { id } : {}),
      ...(data ? { data } : {}),
    })
  }

  /** Runs afterRead hooks, populates relationships and removes what the caller may not see. */
  private async output(
    config: CollectionConfig | GlobalConfig,
    docs: RawDocument[],
    guard: Guard,
    options: ReadOptions,
  ): Promise<RawDocument[]> {
    const read = this.fieldChecker('read', guard, undefined, undefined)
    const finish = async (target: CollectionConfig | GlobalConfig, doc: RawDocument) => {
      const hooked = await this.transform(
        target.hooks?.afterRead,
        'doc',
        this.hookArgs(target, guard),
        doc as Data,
      )
      return (await stripFields(target.fields, hooked, read)) as RawDocument
    }
    const load: Loader = async (target, ids) => {
      const where = await this.readWhere(target, guard, { id: { in: [...ids] } }).catch((error) => {
        if (error instanceof ForbiddenError || error instanceof UnauthorizedError) return null
        throw error
      })
      if (where === null) return []
      const found = await this.db.find({
        collection: target.slug,
        where: draftWhere(target, options.draft, where),
        sort: [],
        limit: 0,
        page: 1,
      })
      return Promise.all(found.docs.map((d) => finish(target, d)))
    }
    const depth = Math.max(0, Math.min(MAX_DEPTH, Math.trunc(options.depth ?? DEFAULT_DEPTH)))
    // Populate first (populated documents are finished by the loader), then finish the top level.
    const populated = await populate(load, this.config.collections, config.fields, docs, depth)
    return Promise.all(populated.map((d) => finish(config, d)))
  }

  /** Creates a document: access, input filtering, hooks, validation, then afterChange. */
  private async createDocument(
    config: CollectionConfig,
    raw: Data,
    options: DepthOptions,
    hookGuard?: Guard,
  ): Promise<RawDocument> {
    const guard = guardOf(options)
    const collection = config.slug
    if (guard.enforce) {
      const allowed = await evaluateAccess(config.access?.create, { user: guard.user, data: raw })
      if (typeof allowed === 'object')
        throw new QueryError(`create access of "${collection}" must return a boolean`)
      if (!allowed) throw deny(guard.user)
    }

    const { input, password } = splitPassword(config, raw)
    if (config.slug === USERS && password === undefined) {
      throw new ValidationError(collection, [{ field: 'password', message: 'is required' }])
    }
    const filtered = await filterInput(
      config.fields,
      input,
      this.fieldChecker('update', guard, undefined, input),
    )
    const base = this.hookArgs(config, hookGuard ?? guard)
    let data = applyDefaults(config.fields, filtered)
    data = await this.transform(
      config.hooks?.beforeValidate,
      'data',
      { ...base, operation: 'create' },
      data,
    )
    let prepared = await this.prepare(
      config,
      generateSlugs(config.fields, data),
      'create',
      undefined,
    )
    prepared = await this.transform(
      config.hooks?.beforeChange,
      'data',
      { ...base, operation: 'create' },
      prepared,
    )
    if (password !== undefined) prepared.passwordHash = await hashPassword(password)

    const now = new Date().toISOString()
    const doc = await this.db.create({
      collection,
      data: { ...prepared, createdAt: now, updatedAt: now },
    })
    await this.notify(config.hooks?.afterChange, 'afterChange', collection, {
      ...base,
      doc,
      operation: 'create',
    })
    const [out] = await this.output(config, [doc], hookGuard ?? guard, { ...options, draft: true })
    return out as RawDocument
  }

  private hookArgs(config: CollectionConfig | GlobalConfig, guard: Guard) {
    return { user: guard.user, cms: this as unknown as EasyCMS, slug: config.slug }
  }

  /**
   * Runs hooks that may replace a value, passed as `data` (before hooks) or `doc` (afterRead).
   * Returning `undefined` keeps the value; a throw cancels the operation.
   */
  private async transform(
    hooks: readonly ((args: never) => unknown)[] | undefined,
    key: 'data' | 'doc',
    args: Record<string, unknown>,
    value: Data,
  ): Promise<Data> {
    let current = value
    for (const hook of hooks ?? []) {
      const result = await (hook as (a: Record<string, unknown>) => unknown)({
        ...args,
        [key]: current,
      })
      if (result !== undefined && result !== null && typeof result === 'object')
        current = result as Data
    }
    return current
  }

  /** Runs hooks after the change is saved: failures are logged, never undo the save (NFR-REL-03). */
  private async notify(
    hooks: readonly ((args: never) => unknown)[] | undefined,
    name: string,
    slug: string,
    args: Record<string, unknown>,
  ) {
    for (const hook of hooks ?? []) {
      try {
        await (hook as (a: Record<string, unknown>) => unknown)(args)
      } catch (error) {
        this.logger.error(
          `${name} hook of "${slug}" failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }

  /** Writes resized copies with sharp, when installed and configured. */
  private async resizeImage(
    data: Uint8Array,
    mimeType: string,
    filename: string,
    sizes: readonly ImageSize[],
    stored: string[],
  ): Promise<
    Record<string, { filename: string; width: number; height: number; filesize: number }>
  > {
    if (
      sizes.length === 0 ||
      !['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(mimeType)
    )
      return {}
    const sharp = await loadSharp()
    if (!sharp) {
      this.logger.warn(
        'upload.imageSizes is set but sharp is not installed; skipping resized copies',
      )
      return {}
    }
    const result: Record<
      string,
      { filename: string; width: number; height: number; filesize: number }
    > = {}
    for (const size of sizes) {
      const { data: out, info } = await sharp(data)
        .rotate()
        .resize({
          width: size.width,
          ...(size.height ? { height: size.height } : {}),
          fit: size.fit ?? 'cover',
          withoutEnlargement: true,
        })
        .toBuffer({ resolveWithObject: true })
      const key = filename.replace(/\.([^.]+)$/, `-${size.name}.$1`)
      await this.storage.put(key, new Uint8Array(out), { contentType: mimeType })
      stored.push(key)
      result[size.name] = {
        filename: key,
        width: info.width,
        height: info.height,
        filesize: out.byteLength,
      }
    }
    return result
  }

  /** Validates, checks uniqueness and references. Returns clean data or throws `ValidationError`. */
  private async prepare(
    config: CollectionConfig | GlobalConfig,
    data: Data,
    operation: 'create' | 'update',
    selfId: ID | undefined,
  ): Promise<Data> {
    const isDraft = config.drafts === true && (data.status ?? 'draft') === 'draft'
    const result = await validateFields(config.fields, data, {
      operation,
      root: data,
      skipRequired: isDraft,
    })
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

  /** Refuses changes that would leave no active admin (and lock everyone out). */
  private async guardLastAdmin(id: ID, before: Data, after: Data) {
    const wasAdmin = before.role === 'admin' && before.active !== false
    const staysAdmin = after.role === 'admin' && after.active !== false
    if (!wasAdmin || staysAdmin) return
    const others = await this.db.count({
      collection: USERS,
      where: {
        and: [
          { role: { equals: 'admin' } },
          { active: { not_equals: false } },
          { id: { not_equals: id } },
        ],
      },
    })
    if (others === 0) {
      throw new ValidationError(USERS, [
        { field: 'role', message: 'cannot remove the last active admin' },
      ])
    }
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
      // `media` is checked once it exists (M5).
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
        if (!ids.has(ref.id)) {
          errors.push({ field: ref.field, message: `${collection} ${ref.id} does not exist` })
        }
      }
    }
    return errors
  }
}

/** Restricts reads to published documents unless drafts were asked for. */
function draftWhere(
  config: CollectionConfig | GlobalConfig,
  draft: boolean | undefined,
  where: Where | undefined,
) {
  if (!config.drafts || draft) return where
  return andWhere(where, { status: { equals: 'published' } })
}

type SharpFactory = (input: Uint8Array) => {
  rotate(): ReturnType<SharpFactory>
  resize(options: Record<string, unknown>): ReturnType<SharpFactory>
  toBuffer(options: {
    resolveWithObject: true
  }): Promise<{ data: Uint8Array; info: { width: number; height: number } }>
}

let sharpModule: Promise<SharpFactory | undefined> | undefined
/** sharp is an optional peer dependency. */
function loadSharp(): Promise<SharpFactory | undefined> {
  sharpModule ??= import('sharp' as string).then(
    (mod: { default: SharpFactory }) => mod.default,
    () => undefined,
  )
  return sharpModule
}

function guardOf(options: AccessOptions): Guard {
  return { enforce: options.overrideAccess === false, user: options.user ?? null }
}

function deny(user: AuthUser | null) {
  return user ? new ForbiddenError() : new UnauthorizedError()
}

/** Pulls `password` out of users input and checks it. */
function splitPassword(config: CollectionConfig, raw: Data): { input: Data; password?: string } {
  if (config.slug !== USERS || !Object.hasOwn(raw, 'password')) return { input: raw }
  const { password, ...input } = raw
  if (password === undefined || password === null || password === '') return { input }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(USERS, [
      { field: 'password', message: `must be at least ${MIN_PASSWORD_LENGTH} characters` },
    ])
  }
  return { input, password }
}

function asObject(data: unknown, name: string): Data {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new ValidationError(name, [{ field: '', message: 'data must be an object' }])
  }
  return data as Data
}
