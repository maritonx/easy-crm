# Easy CMS

[![npm](https://img.shields.io/npm/v/@easy-cms/core?label=npm)](https://www.npmjs.com/package/@easy-cms/core)
[![CI](https://github.com/maritonx/easy-crm/actions/workflows/ci.yml/badge.svg)](https://github.com/maritonx/easy-crm/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Embedded, code-first headless CMS for **Nuxt** and **Next.js**: your content model lives in
TypeScript next to your app, and the CMS (admin UI, REST API, typed Local API) runs inside it.
No separate server to host.

**[Documentation](https://maritonx.github.io/easy-crm/)** ·
[Getting started](https://maritonx.github.io/easy-crm/guide/getting-started) ·
[Examples](#examples)

> Pre-1.0: the API may still change between minor versions.

## Quick start

In a Nuxt 4 or Next.js 15+ project:

```bash
npm create easy-cms@latest
npm run dev          # then open http://localhost:3000/admin
```

`create-easy-cms` adds the packages, an `easy-cms.config.ts` with a sample collection, a
secret in `.env`, and the framework wiring. Define content in the config:

```ts
// easy-cms.config.ts
import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'

export default defineConfig({
  secret: process.env.EASY_CMS_SECRET!,
  db: sqlite({ url: 'file:./cms.db' }),
  collections: [
    {
      slug: 'posts',
      drafts: true,
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'body', type: 'richText' },
      ],
    },
  ],
})
```

Then read it with `useEasyCMS()` (Nuxt) or `getEasyCMS(config)` (Next.js), fully typed, or over
REST at `/api/cms`.

## Features

- **Admin UI** at `/admin`: lists, forms, rich text (Tiptap), media library, drafts, TH/EN
- **Typed Local API** inferred from your config, plus a **REST API** and `generate:types` for
  frontends in other repositories
- **Auth and access control**: built-in users and roles, function-based access rules per
  collection and document
- **Uploads** with image sizes (optional `sharp`), **drafts**, **globals** and **hooks**
- **SQLite** (libSQL) or **Postgres** (postgres.js or PGlite) through Drizzle, sharing your app's
  database with `ecms_`-prefixed tables
- **Migrations**: automatic schema push in development, reviewed migration files in production

Design notes: [docs/DESIGN.md](docs/DESIGN.md) · Requirements: [docs/SRS.md](docs/SRS.md)

## Packages

| Package | Status |
|---|---|
| [`@easy-cms/core`](packages/core) | config, Local API, auth, access control, hooks, drafts, uploads, REST handler |
| [`@easy-cms/db-sqlite`](packages/db-sqlite) | SQLite / libSQL adapter |
| [`@easy-cms/db-postgres`](packages/db-postgres) | PostgreSQL adapter (postgres.js or PGlite) |
| [`@easy-cms/drizzle`](packages/drizzle) | Shared Drizzle layer for the adapters |
| [`@easy-cms/admin`](packages/admin) | Admin UI (Vue 3 SPA) served at `/admin` |
| [`@easy-cms/richtext`](packages/richtext) | `renderRichText()`: Tiptap JSON → safe HTML |
| [`@easy-cms/nuxt`](packages/nuxt) | Nuxt 4 module: REST API, admin, typed `useEasyCMS()` |
| [`@easy-cms/next`](packages/next) | Next.js adapter: route handlers, typed `getEasyCMS()` |
| [`easy-cms`](packages/cli) | CLI: migrations, `generate:types`, `create-admin` |
| [`create-easy-cms`](packages/create-easy-cms) | Adds Easy CMS to a Nuxt or Next.js project |

## Examples

- [`examples/nuxt-blog`](examples/nuxt-blog) — Nuxt 4 blog on SQLite
- [`examples/next-blog`](examples/next-blog) — Next.js 16 blog on Postgres (PGlite locally)

## Development

Requires Node ≥ 22.12 and pnpm 10.

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

Integration tests run the same suites on SQLite and PGlite (and a Postgres server when `POSTGRES_URL` is set).
End-to-end tests run the admin suite against both examples (Playwright, uses your installed Chrome locally):

```bash
pnpm test:e2e
```

Docs site: `pnpm --dir website dev`, deployed to GitHub Pages on push to `main`. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

Add a changeset for user-facing changes with `pnpm changeset`.
