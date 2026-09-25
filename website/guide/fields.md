# Fields

Every field has a `name` and a `type`. Common options:

| Option | |
|---|---|
| `label` | String or `{ en, th }`. Defaults to the humanized name. |
| `required` | Must have a value (skipped while saving a [draft](./drafts)). |
| `defaultValue` | Used when creating a document without this field. |
| `unique` | No two documents may share the value (top-level fields). |
| `index` | Create a database index. |
| `validate` | `(value, { data, operation }) => true \| 'error message'`, may be async. |
| `access` | `{ read, update }` field-level [access](./access-control#field-access). |
| `hidden` | Stored, but never returned by the API nor accepted as input. |

## Types

| Type | Value | Options |
|---|---|---|
| `text` | `string` | `minLength`, `maxLength` |
| `textarea` | `string` | `minLength`, `maxLength` |
| `email` | `string`, stored lowercase | |
| `number` | `number` | `min`, `max` |
| `boolean` | `boolean` | |
| `date` | ISO 8601 `string` (accepts `Date`) | |
| `select` | one of the options, or an array with `hasMany` | `options`, `hasMany` |
| `slug` | URL-safe `string`, unique in the collection | `from` |
| `json` | any JSON value | |
| `richText` | Tiptap JSON document | see [Rich text](./rich-text) |
| `upload` | id of a `media` document | see [Uploads](./uploads) |
| `relationship` | id(s) of documents in another collection | `to`, `hasMany` |
| `array` | list of rows, each with an `id` and sub-fields | `fields`, `minRows`, `maxRows` |
| `group` | nested object | `fields` |

### select

```ts
{ name: 'kind', type: 'select', options: ['news', { label: { en: 'Blog', th: 'บล็อก' }, value: 'blog' }] }
{ name: 'tags', type: 'select', options: ['vue', 'react'], hasMany: true }
```

### slug

```ts
{ name: 'slug', type: 'slug', from: 'title' }
```

Filled from `title` when empty. Letters of any script are kept (`สวัสดี ชาวโลก` →
`สวัสดี-ชาวโลก`); duplicates get `-2`, `-3`. Changing the title later does not change the slug.

### relationship

```ts
{ name: 'author', type: 'relationship', to: 'users' }
{ name: 'related', type: 'relationship', to: 'posts', hasMany: true }
```

Ids are checked to exist when saving. Reads populate related documents to `depth` levels
(default 1, max 3); at depth 0 you get ids. Deleted or unreadable documents become `null`, or
are dropped from `hasMany` lists.

### array and group

```ts
{
  name: 'links',
  type: 'array',
  maxRows: 5,
  fields: [
    { name: 'label', type: 'text', required: true },
    { name: 'url', type: 'text' },
  ],
}
{ name: 'seo', type: 'group', fields: [{ name: 'title', type: 'text' }] }
```

Updating an array replaces all its rows; keep a row's `id` to keep its identity.

## How fields are stored

Each collection is a table; fields are columns (group fields are flattened: `seo.title` →
`seo_title`). Arrays and `hasMany` values live in child tables. Two fields that would map to the
same column are reported as a config error.
