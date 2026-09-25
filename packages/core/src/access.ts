/** A document id. SQLite uses integers, Postgres may use either. */
export type ID = string | number

export type Role = 'admin' | 'editor' | (string & {})

/** The logged-in admin user, as seen by access functions and hooks. */
export interface AuthUser {
  readonly id: ID
  readonly email: string
  readonly role: Role
  readonly [field: string]: unknown
}

export interface WhereOperators {
  readonly equals?: unknown
  readonly not_equals?: unknown
  readonly in?: readonly unknown[]
  readonly not_in?: readonly unknown[]
  readonly gt?: number | string
  readonly gte?: number | string
  readonly lt?: number | string
  readonly lte?: number | string
  readonly like?: string
  readonly exists?: boolean
}

export type Where = {
  readonly and?: readonly Where[]
  readonly or?: readonly Where[]
} & {
  readonly [field: string]: WhereOperators | readonly Where[] | undefined
}

export interface AccessArgs {
  /** `null` when the request is not logged in. */
  readonly user: AuthUser | null
  readonly id?: ID
  readonly data?: Readonly<Record<string, unknown>>
}

/**
 * Decides whether an operation is allowed.
 * Return a `Where` to allow it only for the documents that match.
 */
export type Access = (args: AccessArgs) => boolean | Where | Promise<boolean | Where>

export interface CollectionAccess {
  readonly read?: Access
  readonly create?: Access
  readonly update?: Access
  readonly delete?: Access
}

export interface GlobalAccess {
  readonly read?: Access
  readonly update?: Access
}

export type FieldAccessFn = (args: AccessArgs) => boolean | Promise<boolean>

export interface FieldAccess {
  readonly read?: FieldAccessFn
  readonly update?: FieldAccessFn
}

export const anyone: Access = () => true

export const isLoggedIn: Access = ({ user }) => user !== null

export const isAdmin: Access = ({ user }) => user?.role === 'admin'
