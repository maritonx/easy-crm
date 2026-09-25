import type { CollectionConfig, Config, GlobalConfig } from './config.js'
import type { ConfigIssue } from './errors.js'
import { FIELD_TYPES, type Field, type SelectOption } from './fields.js'

export const MIN_SECRET_LENGTH = 32

/** Collections that Easy CMS provides. They can be relationship targets. */
export const BUILTIN_COLLECTIONS = ['users', 'media'] as const

/** Slugs that would clash with Easy CMS's own tables or routes. */
const RESERVED_SLUGS = new Set([
  'admin',
  'globals',
  'sessions',
  'login-attempts',
  'migrations',
  'access',
])

const SYSTEM_FIELD_NAMES = new Set(['id', 'createdAt', 'updatedAt'])

const SLUG_PATTERN = /^[a-z][a-z0-9_-]*$/
const FIELD_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Checks a config and returns every problem found. An empty array means it is valid. */
export function validateConfig(config: Config): ConfigIssue[] {
  const issues: ConfigIssue[] = []
  const add = (path: string, message: string, hint?: string) =>
    issues.push(hint ? { path, message, hint } : { path, message })

  if (typeof config !== 'object' || config === null) {
    add('config', 'must be an object', 'export default defineConfig({ ... })')
    return issues
  }

  validateSecret(config.secret, add)

  if (!config.db || typeof config.db.name !== 'string' || typeof config.db.init !== 'function') {
    add('db', 'is required', "pass a database adapter, e.g. db: sqlite({ url: 'file:./cms.db' })")
  }

  validateAdmin(config, add)
  validateUpload(config, add)
  validateAuth(config, add)

  const collections = asArray(config.collections, 'collections', add)
  const globals = asArray(config.globals, 'globals', add)

  const collectionSlugs = new Set<string>([...BUILTIN_COLLECTIONS])
  const seenCollections = new Set<string>()
  collections.forEach((collection, i) => {
    const slug = checkSlug(collection, `collections[${i}]`, seenCollections, add)
    if (slug) collectionSlugs.add(slug)
  })

  const seenGlobals = new Set<string>()
  globals.forEach((global, i) => {
    checkSlug(global, `globals[${i}]`, seenGlobals, add)
  })

  collections.forEach((collection, i) => {
    const path = `collections.${collection.slug ?? `[${i}]`}`
    validateContainer(collection, path, collectionSlugs, add)
    validateUseAsTitle(collection, path, add)
  })

  globals.forEach((global, i) => {
    validateContainer(global, `globals.${global.slug ?? `[${i}]`}`, collectionSlugs, add)
  })

  const plugins: unknown = config.plugins
  if (
    plugins !== undefined &&
    (!Array.isArray(plugins) || plugins.some((p) => typeof p !== 'function'))
  ) {
    add('plugins', 'must be an array of functions', 'a plugin is (config) => config')
  }

  return issues
}

type Add = (path: string, message: string, hint?: string) => void

function validateSecret(secret: unknown, add: Add) {
  const hint = `set EASY_CMS_SECRET to a random string of at least ${MIN_SECRET_LENGTH} characters, e.g. \`openssl rand -hex 32\``
  if (typeof secret !== 'string' || secret.length === 0) {
    add('secret', 'is required', hint)
  } else if (secret.length < MIN_SECRET_LENGTH) {
    add('secret', `must be at least ${MIN_SECRET_LENGTH} characters (got ${secret.length})`, hint)
  }
}

function validateAdmin(config: Config, add: Add) {
  const admin = config.admin
  if (admin === undefined) return
  if (admin.path !== undefined && (typeof admin.path !== 'string' || !admin.path.startsWith('/'))) {
    add('admin.path', 'must start with "/"', "e.g. path: '/admin'")
  }
  if (admin.locale !== undefined && admin.locale !== 'en' && admin.locale !== 'th') {
    add('admin.locale', `must be "en" or "th" (got ${JSON.stringify(admin.locale)})`)
  }
}

function validateAuth(config: Config, add: Add) {
  const auth = config.auth
  if (auth === undefined) return
  if (auth.roles !== undefined) {
    const roles: unknown = auth.roles
    if (!Array.isArray(roles) || roles.some((r) => typeof r !== 'string' || r === '')) {
      add('auth.roles', 'must be an array of non-empty strings')
    } else if (!roles.includes('admin')) {
      add('auth.roles', 'must include "admin"', "e.g. roles: ['admin', 'editor']")
    }
  }
  for (const key of ['tokenExpiration', 'maxLoginAttempts', 'lockWindow'] as const) {
    const value = auth[key]
    if (value !== undefined && !(Number.isInteger(value) && value > 0)) {
      add(`auth.${key}`, 'must be a positive integer')
    }
  }
  if (auth.trustedOrigins !== undefined) {
    for (const [i, origin] of auth.trustedOrigins.entries()) {
      if (typeof origin !== 'string' || !/^https?:\/\/[^/]+$/.test(origin)) {
        add(
          `auth.trustedOrigins[${i}]`,
          `must be an origin like "https://example.com" (got ${JSON.stringify(origin)})`,
        )
      }
    }
  }
}

function validateUpload(config: Config, add: Add) {
  const upload = config.upload
  if (upload === undefined) return
  if (
    upload.maxFileSize !== undefined &&
    !(Number.isInteger(upload.maxFileSize) && upload.maxFileSize > 0)
  ) {
    add('upload.maxFileSize', 'must be a positive integer (bytes)')
  }
  if (upload.dir !== undefined && (typeof upload.dir !== 'string' || upload.dir.length === 0)) {
    add('upload.dir', 'must be a non-empty string')
  }
}

function asArray<T>(value: readonly T[] | undefined, path: string, add: Add): readonly T[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    add(path, 'must be an array')
    return []
  }
  return value
}

function checkSlug(
  container: CollectionConfig | GlobalConfig,
  path: string,
  seen: Set<string>,
  add: Add,
): string | undefined {
  const slug: unknown = container.slug
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) {
    add(
      `${path}.slug`,
      `must be lowercase letters, digits, "-" or "_", starting with a letter (got ${JSON.stringify(slug)})`,
    )
    return undefined
  }
  if (RESERVED_SLUGS.has(slug)) {
    add(`${path}.slug`, `"${slug}" is reserved by Easy CMS`, 'choose another slug')
    return undefined
  }
  if (seen.has(slug)) {
    add(`${path}.slug`, `duplicate slug "${slug}"`)
    return undefined
  }
  seen.add(slug)
  return slug
}

function validateContainer(
  container: CollectionConfig | GlobalConfig,
  path: string,
  collectionSlugs: ReadonlySet<string>,
  add: Add,
) {
  if (!Array.isArray(container.fields)) {
    add(`${path}.fields`, 'must be an array')
    return
  }
  const reserved = new Set(SYSTEM_FIELD_NAMES)
  if (container.drafts) reserved.add('status')
  validateFields(container.fields, `${path}.fields`, reserved, collectionSlugs, add)
}

function validateFields(
  fields: readonly Field[],
  path: string,
  reserved: ReadonlySet<string>,
  collectionSlugs: ReadonlySet<string>,
  add: Add,
) {
  const names = new Set<string>()
  const byName = new Map<string, Field>()

  fields.forEach((field, i) => {
    const name: unknown = field?.name
    if (typeof name !== 'string' || !FIELD_NAME_PATTERN.test(name)) {
      add(`${path}[${i}].name`, `must be a valid identifier (got ${JSON.stringify(name)})`)
      return
    }
    if (reserved.has(name)) {
      add(`${path}.${name}`, `"${name}" is reserved`, 'Easy CMS adds this field automatically')
    }
    if (names.has(name)) add(`${path}.${name}`, `duplicate field name "${name}"`)
    names.add(name)
    byName.set(name, field)
  })

  for (const field of fields) {
    if (typeof field?.name !== 'string') continue
    const fieldPath = `${path}.${field.name}`
    const type: unknown = field.type
    if (!(FIELD_TYPES as readonly unknown[]).includes(type)) {
      add(
        `${fieldPath}.type`,
        `unknown field type ${JSON.stringify(type)}`,
        `use one of: ${FIELD_TYPES.join(', ')}`,
      )
      continue
    }
    validateField(field, fieldPath, byName, collectionSlugs, add)
  }
}

function validateField(
  field: Field,
  path: string,
  siblings: ReadonlyMap<string, Field>,
  collectionSlugs: ReadonlySet<string>,
  add: Add,
) {
  switch (field.type) {
    case 'text':
    case 'textarea':
      checkRange(field.minLength, field.maxLength, 'minLength', 'maxLength', path, add)
      break
    case 'number':
      checkRange(field.min, field.max, 'min', 'max', path, add)
      break
    case 'select':
      validateSelect(field.options, field.defaultValue, field.hasMany, path, add)
      break
    case 'slug':
      if (field.from !== undefined) {
        const source = siblings.get(field.from)
        if (!source) {
          add(`${path}.from`, `no sibling field named "${field.from}"`)
        } else if (source.type !== 'text') {
          add(`${path}.from`, `"${field.from}" must be a text field (got ${source.type})`)
        }
      }
      break
    case 'relationship':
      if (typeof field.to !== 'string' || !collectionSlugs.has(field.to)) {
        add(
          `${path}.to`,
          `unknown collection ${JSON.stringify(field.to)}`,
          `use one of: ${[...collectionSlugs].join(', ')}`,
        )
      }
      break
    case 'array':
    case 'group':
      if (!Array.isArray(field.fields) || field.fields.length === 0) {
        add(`${path}.fields`, 'must contain at least one field')
        break
      }
      if (field.type === 'array')
        checkRange(field.minRows, field.maxRows, 'minRows', 'maxRows', path, add)
      validateFields(field.fields, `${path}.fields`, new Set(['id']), collectionSlugs, add)
      break
  }
}

function checkRange(
  min: number | undefined,
  max: number | undefined,
  minName: string,
  maxName: string,
  path: string,
  add: Add,
) {
  if (min !== undefined && max !== undefined && min > max) {
    add(path, `${minName} (${min}) is greater than ${maxName} (${max})`)
  }
}

function validateSelect(
  options: readonly SelectOption[] | undefined,
  defaultValue: string | readonly string[] | undefined,
  hasMany: boolean | undefined,
  path: string,
  add: Add,
) {
  if (!Array.isArray(options) || options.length === 0) {
    add(`${path}.options`, 'must contain at least one option')
    return
  }
  const values = options.map((o) => (typeof o === 'string' ? o : o.value))
  const duplicates = values.filter((v, i) => values.indexOf(v) !== i)
  if (duplicates.length > 0) {
    add(`${path}.options`, `duplicate option values: ${[...new Set(duplicates)].join(', ')}`)
  }
  if (defaultValue === undefined) return
  const defaults = typeof defaultValue === 'string' ? [defaultValue] : defaultValue
  if (typeof defaultValue !== 'string' && !hasMany) {
    add(`${path}.defaultValue`, 'must be a single value unless hasMany is true')
  }
  for (const value of defaults) {
    if (!values.includes(value)) {
      add(`${path}.defaultValue`, `"${value}" is not one of the options`)
    }
  }
}

function validateUseAsTitle(collection: CollectionConfig, path: string, add: Add) {
  if (collection.useAsTitle === undefined || !Array.isArray(collection.fields)) return
  const field = collection.fields.find((f) => f.name === collection.useAsTitle)
  if (!field) {
    add(`${path}.useAsTitle`, `no top-level field named "${collection.useAsTitle}"`)
  } else if (!['text', 'textarea', 'email', 'slug', 'number', 'date'].includes(field.type)) {
    add(
      `${path}.useAsTitle`,
      `"${field.name}" is a ${field.type} field and cannot be shown as a title`,
    )
  }
}
