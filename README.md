# Easy CMS

Embedded, code-first headless CMS for **Nuxt** and **Next.js**. MIT licensed.

> ⚠️ Early development (milestone M2). See [docs/DESIGN.md](docs/DESIGN.md) and [docs/SRS.md](docs/SRS.md).

## Packages

| Package | Status |
|---|---|
| [`@easy-cms/core`](packages/core) | config, validation, type inference, Local API, auth, access control, REST handler |
| [`@easy-cms/db-sqlite`](packages/db-sqlite) | SQLite / libSQL adapter, migrations |
| [`easy-cms`](packages/cli) | CLI: `migrate`, `migrate:create`, `migrate:status` |

## Development

Requires Node ≥ 22.12 and pnpm 10.

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

Add a changeset for user-facing changes with `pnpm changeset`.
