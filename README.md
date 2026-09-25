# Easy CMS

Embedded, code-first headless CMS for **Nuxt** and **Next.js**. MIT licensed.

> ⚠️ Early development (milestone M5). See [docs/DESIGN.md](docs/DESIGN.md) and [docs/SRS.md](docs/SRS.md).

## Packages

| Package | Status |
|---|---|
| [`@easy-cms/core`](packages/core) | config, Local API, auth, access control, hooks, drafts, uploads, REST handler |
| [`@easy-cms/db-sqlite`](packages/db-sqlite) | SQLite / libSQL adapter, migrations |
| [`@easy-cms/admin`](packages/admin) | Admin UI (Vue 3 SPA) served at `/admin` |
| [`@easy-cms/richtext`](packages/richtext) | `renderRichText()`: Tiptap JSON → safe HTML |
| [`@easy-cms/nuxt`](packages/nuxt) | Nuxt 4 module: REST API + typed `useEasyCMS()` |
| [`easy-cms`](packages/cli) | CLI: `migrate`, `migrate:create`, `migrate:status` |

## Examples

- [`examples/nuxt-blog`](examples/nuxt-blog) — Nuxt 4 blog using the Local API and REST API

## Development

Requires Node ≥ 22.12 and pnpm 10.

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

End-to-end tests (Playwright, uses your installed Chrome locally):

```bash
pnpm test:e2e
```

Add a changeset for user-facing changes with `pnpm changeset`.
