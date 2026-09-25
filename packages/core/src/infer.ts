import type { ID } from './access.js'
import type { CollectionConfig, Config, GlobalConfig } from './config.js'
import type { Field, RichTextDocument, SelectOption } from './fields.js'

type Simplify<T> = { [K in keyof T]: T[K] } & {}

type OptionValue<O> = O extends string ? O : O extends { readonly value: infer V } ? V : never

type SelectValue<F> = F extends { readonly options: readonly (infer O extends SelectOption)[] }
  ? F extends { readonly hasMany: true }
    ? OptionValue<O>[]
    : OptionValue<O>
  : never

type CollectionBySlug<C extends Config, S> = Extract<
  NonNullable<C['collections']>[number],
  { readonly slug: S }
>

/** Relationships are ids at depth 0 and documents when populated. */
type RelationValue<C extends Config, S> = [CollectionBySlug<C, S>] extends [never]
  ? ID | Record<string, unknown>
  : ID | CollectionDocument<C, S & string>

export interface MediaDocument {
  id: ID
  filename: string
  mimeType: string
  filesize: number
  width?: number | null
  height?: number | null
  alt?: string | null
  url: string
  createdAt: string
  updatedAt: string
}

export type FieldValue<F extends Field, C extends Config = Config> = F extends {
  readonly type: 'text' | 'textarea' | 'email' | 'slug' | 'date'
}
  ? string
  : F extends { readonly type: 'number' }
    ? number
    : F extends { readonly type: 'boolean' }
      ? boolean
      : F extends { readonly type: 'json' }
        ? unknown
        : F extends { readonly type: 'select' }
          ? SelectValue<F>
          : F extends { readonly type: 'richText' }
            ? RichTextDocument
            : F extends { readonly type: 'upload' }
              ? ID | MediaDocument
              : F extends { readonly type: 'relationship'; readonly to: infer S }
                ? F extends { readonly hasMany: true }
                  ? RelationValue<C, S>[]
                  : RelationValue<C, S>
                : F extends {
                      readonly type: 'array'
                      readonly fields: infer Sub extends readonly Field[]
                    }
                  ? Simplify<FieldsValue<Sub, C> & { id: string }>[]
                  : F extends {
                        readonly type: 'group'
                        readonly fields: infer Sub extends readonly Field[]
                      }
                    ? FieldsValue<Sub, C>
                    : never

type RequiredFields<Fs extends readonly Field[]> = Extract<Fs[number], { readonly required: true }>
type OptionalFields<Fs extends readonly Field[]> = Exclude<Fs[number], { readonly required: true }>

/** The shape of the data described by a list of fields. */
export type FieldsValue<Fs extends readonly Field[], C extends Config = Config> = Simplify<
  { -readonly [F in RequiredFields<Fs> as F['name']]: FieldValue<F, C> } & {
    -readonly [F in OptionalFields<Fs> as F['name']]?: FieldValue<F, C> | null
  }
>

type SystemFields<T extends { readonly drafts?: boolean }> = {
  id: ID
  createdAt: string
  updatedAt: string
} & (T extends { readonly drafts: true } ? { status: 'draft' | 'published' } : unknown)

export type InferCollection<T extends CollectionConfig, C extends Config = Config> = Simplify<
  SystemFields<T> & FieldsValue<T['fields'], C>
>

export type InferGlobal<T extends GlobalConfig, C extends Config = Config> = Simplify<
  /** `null` until the global is saved for the first time. */
  { updatedAt: string | null } & (T extends { readonly drafts: true }
    ? { status: 'draft' | 'published' }
    : unknown) &
    FieldsValue<T['fields'], C>
>

export type CollectionSlug<C extends Config> = NonNullable<C['collections']>[number]['slug']
export type GlobalSlug<C extends Config> = NonNullable<C['globals']>[number]['slug']

/** Document type of a collection, e.g. `CollectionDocument<typeof config, 'posts'>`. */
export type CollectionDocument<C extends Config, S extends CollectionSlug<C>> = InferCollection<
  CollectionBySlug<C, S>,
  C
>

/** Data type of a global, e.g. `GlobalDocument<typeof config, 'site'>`. */
export type GlobalDocument<C extends Config, S extends GlobalSlug<C>> = InferGlobal<
  Extract<NonNullable<C['globals']>[number], { readonly slug: S }>,
  C
>

// ---------------------------------------------------------------------------
// Input types for create / update

type InputValue<F extends Field> = F extends { readonly type: 'relationship' }
  ? F extends { readonly hasMany: true }
    ? readonly ID[]
    : ID
  : F extends { readonly type: 'select'; readonly hasMany: true }
    ? Readonly<SelectValue<F>>
    : F extends { readonly type: 'upload' }
      ? ID
      : F extends { readonly type: 'date' }
        ? string | Date
        : F extends { readonly type: 'array'; readonly fields: infer Sub extends readonly Field[] }
          ? readonly Simplify<FieldsInput<Sub> & { id?: string }>[]
          : F extends {
                readonly type: 'group'
                readonly fields: infer Sub extends readonly Field[]
              }
            ? FieldsInput<Sub>
            : FieldValue<F>

/** Required fields must be given, unless Easy CMS can fill them (default value, slug from another field). */
type NeedsInput<F extends Field> = F extends { readonly required: true }
  ? F extends { readonly defaultValue: unknown }
    ? never
    : F extends { readonly type: 'slug'; readonly from: string }
      ? never
      : F
  : never

export type FieldsInput<Fs extends readonly Field[]> = Simplify<
  { -readonly [F in NeedsInput<Fs[number]> as F['name']]: InputValue<F> } & {
    -readonly [F in Exclude<Fs[number], NeedsInput<Fs[number]>> as F['name']]?: InputValue<F> | null
  }
>

type StatusInput<T> = T extends { readonly drafts: true }
  ? { status?: 'draft' | 'published' }
  : unknown

/** Data accepted by `create`, e.g. `CreateInput<typeof config, 'posts'>`. */
export type CreateInput<C extends Config, S extends CollectionSlug<C>> = Simplify<
  FieldsInput<CollectionBySlug<C, S>['fields']> & StatusInput<CollectionBySlug<C, S>>
>

/** Data accepted by `update`: any subset of `CreateInput`. */
export type UpdateInput<C extends Config, S extends CollectionSlug<C>> = Partial<CreateInput<C, S>>

/** Data accepted by `updateGlobal`. */
export type GlobalInput<C extends Config, S extends GlobalSlug<C>> = Partial<
  Simplify<
    FieldsInput<Extract<NonNullable<C['globals']>[number], { readonly slug: S }>['fields']> &
      StatusInput<Extract<NonNullable<C['globals']>[number], { readonly slug: S }>>
  >
>
