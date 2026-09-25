# Easy CMS

Embedded, code-first headless CMS for **Nuxt** and **Next.js**. MIT licensed.

> v0.1 — first release candidate. Design: [docs/DESIGN.md](docs/DESIGN.md) · Requirements: [docs/SRS.md](docs/SRS.md) · Docs: [`website/`](website)

## Quick start

In a Nuxt 4 or Next.js 15+ project:

```bash
npx create-easy-cms
npm run dev          # then open http://localhost:3000/admin
```

Define content in `easy-cms.config.ts`; read it with `useEasyCMS()` (Nuxt) or
`getEasyCMS(config)` (Next.js), or over REST at `/api/cms`.

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

Docs: `pnpm --dir website dev`. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

Add a changeset for user-facing changes with `pnpm changeset`.
