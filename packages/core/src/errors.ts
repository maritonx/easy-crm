export interface ConfigIssue {
  /** Where the problem is, e.g. `collections.posts.fields.slug.from`. */
  readonly path: string
  readonly message: string
  /** How to fix it. */
  readonly hint?: string
}

export class ConfigError extends Error {
  readonly issues: readonly ConfigIssue[]

  constructor(issues: readonly ConfigIssue[]) {
    super(ConfigError.format(issues))
    this.name = 'ConfigError'
    this.issues = issues
  }

  static format(issues: readonly ConfigIssue[]): string {
    const lines = issues.map((issue) => {
      const hint = issue.hint ? `\n    → ${issue.hint}` : ''
      return `  • ${issue.path}: ${issue.message}${hint}`
    })
    const noun = issues.length === 1 ? 'problem' : 'problems'
    return `Invalid Easy CMS config (${issues.length} ${noun}):\n${lines.join('\n')}`
  }
}

/** Base class for errors that map to an HTTP status in the REST API. */
export class EasyCMSError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'EasyCMSError'
    this.status = status
  }
}

export interface FieldError {
  /** Dotted path, e.g. `links.0.url`. */
  readonly field: string
  readonly message: string
}

export class ValidationError extends EasyCMSError {
  readonly errors: readonly FieldError[]

  constructor(collection: string, errors: readonly FieldError[]) {
    const list = errors.map((e) => `${e.field}: ${e.message}`).join('; ')
    super(`Invalid data for "${collection}": ${list}`, 400)
    this.name = 'ValidationError'
    this.errors = errors
  }
}

export class NotFoundError extends EasyCMSError {
  constructor(collection: string, id: unknown) {
    super(`No document with id ${JSON.stringify(id)} in "${collection}"`, 404)
    this.name = 'NotFoundError'
  }
}

/** A bad `where`, `sort` or unknown collection/global. */
export class QueryError extends EasyCMSError {
  constructor(message: string) {
    super(message, 400)
    this.name = 'QueryError'
  }
}

/** The database schema does not match the config (pending or missing migrations). */
export class SchemaError extends EasyCMSError {
  constructor(message: string) {
    super(message, 500)
    this.name = 'SchemaError'
  }
}

/** Not logged in, or the session is invalid. */
export class UnauthorizedError extends EasyCMSError {
  constructor(message = 'You must be logged in') {
    super(message, 401)
    this.name = 'UnauthorizedError'
  }
}

/** Logged in, but not allowed to do this. */
export class ForbiddenError extends EasyCMSError {
  constructor(message = 'You are not allowed to do this') {
    super(message, 403)
    this.name = 'ForbiddenError'
  }
}

export class TooManyRequestsError extends EasyCMSError {
  constructor(message: string) {
    super(message, 429)
    this.name = 'TooManyRequestsError'
  }
}

export class PayloadTooLargeError extends EasyCMSError {
  constructor(message: string) {
    super(message, 413)
    this.name = 'PayloadTooLargeError'
  }
}
