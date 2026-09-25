# Easy CMS

Embedded, code-first headless CMS for **Nuxt** and **Next.js**. MIT licensed.

> ⚠️ Early development (milestone M6). See [docs/DESIGN.md](docs/DESIGN.md) and [docs/SRS.md](docs/SRS.md).

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
| [`easy-cms`](packages/cli) | CLI: `migrate`, `migrate:create`, `migrate:status` |

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

Add a changeset for user-facing changes with `pnpm changeset`.
