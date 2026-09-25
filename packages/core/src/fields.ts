import type { FieldAccess } from './access.js'

/** A label shown in the admin UI. Either one string or one string per admin locale. */
export type Label = string | { readonly [locale: string]: string }

export interface FieldValidateContext {
  /** The whole document being validated, including sibling fields. */
  readonly data: Readonly<Record<string, unknown>>
  readonly operation: 'create' | 'update'
}

/** Return `true` when valid, or an error message to show on the field. */
export type FieldValidate<TValue> = (
  value: TValue | null | undefined,
  ctx: FieldValidateContext,
) => true | string | Promise<true | string>

interface BaseField<TType extends string, TValue> {
  readonly type: TType
  readonly name: string
  readonly label?: Label
  readonly required?: boolean
  readonly unique?: boolean
  readonly index?: boolean
  readonly defaultValue?: TValue
  readonly validate?: FieldValidate<TValue>
  readonly access?: FieldAccess
  /** Stored but never returned by the API nor accepted as input (e.g. a password hash). */
  readonly hidden?: boolean
}

export interface TextField extends BaseField<'text', string> {
  readonly minLength?: number
  readonly maxLength?: number
}

export interface TextareaField extends BaseField<'textarea', string> {
  readonly minLength?: number
  readonly maxLength?: number
}

export interface NumberField extends BaseField<'number', number> {
  readonly min?: number
  readonly max?: number
}

export interface BooleanField extends BaseField<'boolean', boolean> {}

/** Stored and returned as an ISO 8601 string. */
export interface DateField extends BaseField<'date', string> {}

export interface EmailField extends BaseField<'email', string> {}

export interface JsonField extends BaseField<'json', unknown> {}

export type SelectOption = string | { readonly label: Label; readonly value: string }

export interface SelectField extends BaseField<'select', string | readonly string[]> {
  readonly options: readonly SelectOption[]
  readonly hasMany?: boolean
}

export interface SlugField extends BaseField<'slug', string> {
  /** Name of a sibling `text` field to generate the slug from. */
  readonly from?: string
}

/** Tiptap / ProseMirror JSON document. */
export interface RichTextDocument {
  readonly type: 'doc'
  readonly content?: readonly unknown[]
}

export interface RichTextField extends BaseField<'richText', RichTextDocument> {}

/** References a document in the built-in `media` collection. */
export interface UploadField extends BaseField<'upload', never> {}

export interface RelationshipField extends BaseField<'relationship', never> {
  /** Slug of the target collection. */
  readonly to: string
  readonly hasMany?: boolean
}

export interface ArrayField extends BaseField<'array', never> {
  readonly fields: readonly Field[]
  readonly minRows?: number
  readonly maxRows?: number
}

export interface GroupField extends BaseField<'group', never> {
  readonly fields: readonly Field[]
}

export type Field =
  | TextField
  | TextareaField
  | NumberField
  | BooleanField
  | DateField
  | EmailField
  | JsonField
  | SelectField
  | SlugField
  | RichTextField
  | UploadField
  | RelationshipField
  | ArrayField
  | GroupField

export type FieldType = Field['type']

export const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'boolean',
  'date',
  'email',
  'json',
  'select',
  'slug',
  'richText',
  'upload',
  'relationship',
  'array',
  'group',
] as const satisfies readonly FieldType[]
