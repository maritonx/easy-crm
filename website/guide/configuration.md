# Configuration

Everything about your content lives in `easy-cms.config.ts` at the project root:

```ts
import { defineConfig, isAdmin } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'

export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  db: sqlite({ url: 'file:./cms.db' }),
  admin: { locale: 'th' },
  collections: [
    {
      slug: 'posts',
      drafts: true,
      useAsTitle: 'title',
      access: { read: () => true, update: isAdmin },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'body', type: 'richText' },
      ],
    },
  ],
  globals: [{ slug: 'site', fields: [{ name: 'siteName', type: 'text' }] }],
})
```

`defineConfig` returns the config unchanged, keeping its literal types so documents can be typed
from it. The config is validated at startup; every problem is reported at once with where it is
and how to fix it.

## Top-level options

| Option | Default | |
|---|---|---|
| `secret` | — | **Required**, at least 32 characters. Signs sessions. Read it from an env var. |
| `db` | — | **Required**. A database adapter: `sqlite()` or `postgres()`. See [Databases](./databases). |
| `serverURL` | — | Public origin such as `https://example.com`. Makes media URLs absolute. |
| `routes.api` | `/api/cms` | Where the REST API is served. |
| `admin.path` | `/admin` | Where the admin UI is served. |
| `admin.locale` | `en` | Default admin language: `en` or `th`. |
| `auth` | | See [Users & auth](./auth). |
| `upload` | | See [Uploads & media](./uploads). |
| `collections` | `[]` | See below. |
| `globals` | `[]` | See below. |
| `plugins` | `[]` | Functions `(config) => config`, run in order before validation. |

## Collections

A collection is a type of content with many documents: posts, products, pages.

| Option | |
|---|---|
| `slug` | URL and table name: lowercase letters, digits, `-`, `_`. |
| `fields` | The [fields](./fields). |
| `labels` | `{ singular, plural }`, each a string or `{ en, th }`. |
| `useAsTitle` | Top-level field shown as the document title in the admin. |
| `drafts` | Adds `status` (`draft` \| `published`). See [Drafts](./drafts). |
| `access` | `{ read, create, update, delete }`. See [Access control](./access-control). |
| `hooks` | See [Hooks](./hooks). |

Every document also has `id` (integer), `createdAt` and `updatedAt`.

Two collections are built in: [`users`](./auth) and [`media`](./uploads). Declare a collection
with the same slug to add fields, access rules or hooks to them.

Reserved slugs: `admin`, `globals`, `sessions`, `login-attempts`, `migrations`, `access`.

## Globals

A global has exactly one document: site settings, navigation, a footer.

```ts
globals: [
  {
    slug: 'site',
    label: { en: 'Site settings', th: 'ตั้งค่าเว็บไซต์' },
    access: { read: () => true },
    fields: [
      { name: 'siteName', type: 'text', defaultValue: 'My site' },
      { name: 'menu', type: 'array', fields: [{ name: 'label', type: 'text' }, { name: 'url', type: 'text' }] },
    ],
  },
],
```

Globals accept `fields`, `label`, `drafts`, `access` (`read`, `update`) and `hooks`
(`beforeChange`, `afterChange`, `afterRead`).

## Plugins

A plugin receives the config and returns a new one:

```ts
const seo = (): Plugin => (config) => ({
  ...config,
  collections: config.collections?.map((c) => ({
    ...c,
    fields: [...c.fields, { name: 'metaDescription', type: 'textarea', maxLength: 160 }],
  })),
})

export default defineConfig({ /* … */ plugins: [seo()] })
```
