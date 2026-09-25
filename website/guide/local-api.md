# Local API

The Local API is how your server code reads and writes content, without HTTP:

```ts
const cms = await useEasyCMS() // Nuxt server routes
const cms = await getEasyCMS(config) // Next.js
```

Outside a framework (scripts, tests):

```ts
import { createEasyCMS } from '@easy-cms/core'
import config from './easy-cms.config'

const cms = await createEasyCMS(config)
// …
await cms.destroy()
```

## Methods

```ts
await cms.find('posts', { where, sort: '-createdAt', limit: 10, page: 1, depth: 1, draft: false })
await cms.findById('posts', 12, { depth: 0 })
await cms.count('posts', { where })
await cms.create('posts', { title: 'Hello' })
await cms.update('posts', 12, { title: 'Hello again' })
await cms.delete('posts', 12)
await cms.findGlobal('site')
await cms.updateGlobal('site', { siteName: 'Easy' })
await cms.upload({ data, name: 'photo.jpg' }, { alt: '' })
```

`find` returns `{ docs, totalDocs, limit, page, totalPages, hasNextPage, hasPrevPage }`.
`limit: 0` returns every match. `findById` returns `null` when missing; `update` and `delete`
throw `NotFoundError`.

## Options

| Option | Default | |
|---|---|---|
| `where` | — | Filter, below |
| `sort` | `-createdAt` | Field path or list; `-` for descending |
| `limit`, `page` | `10`, `1` | Pagination |
| `depth` | `1` | Levels of relationships to populate (max 3) |
| `draft` | `false` | Include drafts |
| `overrideAccess` | `true` | `false` applies [access rules](./access-control) for `user` |
| `user` | `null` | The user to check access for |

## where

```ts
{
  status: { equals: 'published' },
  views: { gte: 100 },
  title: { like: 'nuxt' }, // case-insensitive contains
  tags: { in: ['vue', 'nuxt'] }, // hasMany: any of
  'seo.title': { exists: true }, // group fields
  'links.url': { like: 'github' }, // fields inside array rows
  or: [{ featured: { equals: true } }, { views: { gt: 1000 } }],
}
```

Operators: `equals`, `not_equals`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`, `like`, `exists`,
plus `and` / `or`. `not_equals` and `not_in` include empty values. Querying inside a related
document (`author.name`) is not supported.

## Types

Results and inputs are typed from your config: `cms.find('posts')` gives `docs` with `title:
string`, `cms.create` requires required fields, and unknown collection names are errors. See
[TypeScript](./typescript).

## Errors

Errors carry an HTTP-like `status`: `ValidationError` (400, with `errors: [{ field, message }]`),
`UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404),
`PayloadTooLargeError` (413), `TooManyRequestsError` (429), `QueryError` (400).
