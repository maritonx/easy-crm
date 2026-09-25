import type { AuthUser, CollectionAccess, GlobalAccess, ID } from './access.js'
import type { DatabaseAdapter } from './database.js'
import type { Field, Label } from './fields.js'

type Data = Record<string, unknown>
type MaybePromise<T> = T | Promise<T>

export type Operation = 'create' | 'update'

interface HookBase {
  readonly user: AuthUser | null
}

export type BeforeValidateHook = (
  args: HookBase & { data: Data; operation: Operation; originalDoc?: Data },
) => MaybePromise<Data | undefined>

export type BeforeChangeHook = (
  args: HookBase & { data: Data; operation: Operation; originalDoc?: Data },
) => MaybePromise<Data | undefined>

export type AfterChangeHook = (
  args: HookBase & { doc: Data; operation: Operation; previousDoc?: Data },
) => MaybePromise<void>

export type BeforeDeleteHook = (args: HookBase & { id: ID }) => MaybePromise<void>

export type AfterDeleteHook = (args: HookBase & { id: ID; doc: Data }) => MaybePromise<void>

export type AfterReadHook = (args: HookBase & { doc: Data }) => MaybePromise<Data | undefined>

export interface CollectionHooks {
  readonly beforeValidate?: readonly BeforeValidateHook[]
  readonly beforeChange?: readonly BeforeChangeHook[]
  readonly afterChange?: readonly AfterChangeHook[]
  readonly beforeDelete?: readonly BeforeDeleteHook[]
  readonly afterDelete?: readonly AfterDeleteHook[]
  readonly afterRead?: readonly AfterReadHook[]
}

export interface GlobalHooks {
  readonly beforeChange?: readonly BeforeChangeHook[]
  readonly afterChange?: readonly AfterChangeHook[]
  readonly afterRead?: readonly AfterReadHook[]
}

export interface CollectionConfig {
  /** URL and table name. Lowercase letters, digits, `-` and `_`. */
  readonly slug: string
  readonly labels?: { readonly singular?: Label; readonly plural?: Label }
  readonly fields: readonly Field[]
  /** Top-level field shown as the document title in the admin UI. */
  readonly useAsTitle?: string
  /** Adds a `status` field (`draft` | `published`). */
  readonly drafts?: boolean
  readonly access?: CollectionAccess
  readonly hooks?: CollectionHooks
}

export interface GlobalConfig {
  readonly slug: string
  readonly label?: Label
  readonly fields: readonly Field[]
  readonly drafts?: boolean
  readonly access?: GlobalAccess
  readonly hooks?: GlobalHooks
}

export type AdminLocale = 'en' | 'th'

export interface AdminConfig {
  /** Where the admin UI is served. Default `/admin`. */
  readonly path?: string
  /** Default admin UI language. Default `en`. */
  readonly locale?: AdminLocale
}

export interface UploadConfig {
  /** Directory for uploaded files, relative to the project root. Default `uploads`. */
  readonly dir?: string
  /** Maximum file size in bytes. Default 10 MB. */
  readonly maxFileSize?: number
  /** Allowed MIME types. `image/*` style wildcards are allowed. */
  readonly mimeTypes?: readonly string[]
}

export interface AuthConfig {
  /** Roles a user can have. Must include `admin`. Default `['admin', 'editor']`. */
  readonly roles?: readonly string[]
  /** Session lifetime in seconds. Default 7 days. */
  readonly tokenExpiration?: number
  /** Failed logins allowed per email (and IP) within `lockWindow`. Default 5. */
  readonly maxLoginAttempts?: number
  /** Window for `maxLoginAttempts`, in seconds. Default 15 minutes. */
  readonly lockWindow?: number
  /**
   * Origins allowed to send cookie-authenticated requests, besides the API's own origin.
   * Needed when the admin or frontend is served from another origin, or behind a proxy that rewrites the host.
   */
  readonly trustedOrigins?: readonly string[]
}

/** Receives the config and returns a modified copy. Runs before validation. */
export type Plugin = (config: Config) => MaybePromise<Config>

export interface Config {
  /** Signs sessions. At least 32 characters; read it from `process.env.EASY_CMS_SECRET`. */
  readonly secret: string
  readonly db: DatabaseAdapter
  readonly admin?: AdminConfig
  readonly upload?: UploadConfig
  readonly auth?: AuthConfig
  /**
   * Collections. A collection with slug `users` adds fields, access or hooks
   * to the built-in users collection.
   */
  readonly collections?: readonly CollectionConfig[]
  readonly globals?: readonly GlobalConfig[]
  readonly plugins?: readonly Plugin[]
}

/** The config after plugins ran, validation passed and defaults were applied. */
export interface ResolvedConfig
  extends Omit<Config, 'admin' | 'upload' | 'auth' | 'collections' | 'globals' | 'plugins'> {
  readonly admin: Required<AdminConfig>
  readonly upload: Required<UploadConfig>
  readonly auth: Required<AuthConfig>
  readonly collections: readonly CollectionConfig[]
  readonly globals: readonly GlobalConfig[]
}

/**
 * Declares the Easy CMS config. Returns it unchanged, keeping literal types
 * so document types can be inferred from it.
 */
export function defineConfig<const TConfig extends Config>(config: TConfig): TConfig {
  return config
}
