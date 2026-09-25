import type { Access, AuthUser } from '../access.js'
import { evaluateAccess, FieldAccessChecker } from '../access-control.js'
import { INTERNAL_COLLECTIONS } from '../builtins.js'
import type { AdminLocale, CollectionConfig, GlobalConfig } from '../config.js'
import type { Field, Label } from '../fields.js'
import type { EasyCMS } from '../local-api.js'

/** A field as the admin UI sees it: plain JSON, no functions. */
export interface AdminField {
  name: string
  type: Field['type']
  label?: Label
  required?: boolean
  unique?: boolean
  defaultValue?: unknown
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  options?: { label: Label; value: string }[]
  hasMany?: boolean
  to?: string
  from?: string
  minRows?: number
  maxRows?: number
  fields?: AdminField[]
  /** The current user may not change this field. */
  readOnly?: boolean
}

export interface AdminCollection {
  slug: string
  labels?: { singular?: Label; plural?: Label }
  useAsTitle?: string
  drafts: boolean
  fields: AdminField[]
  permissions: { read: boolean; create: boolean; update: boolean; delete: boolean }
}

export interface AdminGlobal {
  slug: string
  label?: Label
  drafts: boolean
  fields: AdminField[]
  permissions: { read: boolean; update: boolean }
}

export interface AdminSchema {
  locale: AdminLocale
  collections: AdminCollection[]
  globals: AdminGlobal[]
}

/** A `where` result means "some documents", so the action is offered and the server decides per document. */
async function allowed(access: Access | undefined, user: AuthUser): Promise<boolean> {
  return (await evaluateAccess(access, { user })) !== false
}

async function serializeFields(
  fields: readonly Field[],
  update: FieldAccessChecker,
): Promise<AdminField[]> {
  const out: AdminField[] = []
  for (const field of fields) {
    if (field.hidden) continue
    const f: AdminField = { name: field.name, type: field.type }
    if (field.label !== undefined) f.label = field.label
    if (field.required) f.required = true
    if (field.unique) f.unique = true
    if (field.defaultValue !== undefined) f.defaultValue = field.defaultValue
    if (!(await update.allows(field))) f.readOnly = true
    switch (field.type) {
      case 'text':
      case 'textarea':
        if (field.minLength !== undefined) f.minLength = field.minLength
        if (field.maxLength !== undefined) f.maxLength = field.maxLength
        break
      case 'number':
        if (field.min !== undefined) f.min = field.min
        if (field.max !== undefined) f.max = field.max
        break
      case 'select':
        f.options = field.options.map((o) =>
          typeof o === 'string' ? { label: o, value: o } : { label: o.label, value: o.value },
        )
        if (field.hasMany) f.hasMany = true
        break
      case 'slug':
        if (field.from) f.from = field.from
        break
      case 'relationship':
        f.to = field.to
        if (field.hasMany) f.hasMany = true
        break
      case 'upload':
        f.to = 'media'
        break
      case 'array':
        if (field.minRows !== undefined) f.minRows = field.minRows
        if (field.maxRows !== undefined) f.maxRows = field.maxRows
        f.fields = await serializeFields(field.fields, update)
        break
      case 'group':
        f.fields = await serializeFields(field.fields, update)
        break
    }
    out.push(f)
  }
  return out
}

async function collection(config: CollectionConfig, user: AuthUser): Promise<AdminCollection> {
  const result: AdminCollection = {
    slug: config.slug,
    drafts: config.drafts === true,
    fields: await serializeFields(config.fields, new FieldAccessChecker('update', { user })),
    permissions: {
      read: await allowed(config.access?.read, user),
      create: await allowed(config.access?.create, user),
      update: await allowed(config.access?.update, user),
      delete: await allowed(config.access?.delete, user),
    },
  }
  if (config.labels) result.labels = config.labels
  if (config.useAsTitle) result.useAsTitle = config.useAsTitle
  return result
}

async function global(config: GlobalConfig, user: AuthUser): Promise<AdminGlobal> {
  const result: AdminGlobal = {
    slug: config.slug,
    drafts: config.drafts === true,
    fields: await serializeFields(config.fields, new FieldAccessChecker('update', { user })),
    permissions: {
      read: await allowed(config.access?.read, user),
      update: await allowed(config.access?.update, user),
    },
  }
  if (config.label !== undefined) result.label = config.label
  return result
}

/** Everything the admin UI needs to render forms and menus for this user. */
export async function adminSchema(cms: EasyCMS, user: AuthUser): Promise<AdminSchema> {
  const collections = cms.config.collections.filter((c) => !INTERNAL_COLLECTIONS.has(c.slug))
  return {
    locale: cms.config.admin.locale,
    collections: await Promise.all(collections.map((c) => collection(c, user))),
    globals: await Promise.all(cms.config.globals.map((g) => global(g, user))),
  }
}
