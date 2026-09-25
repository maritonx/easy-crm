# Contributing

Thanks for helping! Easy CMS is a pnpm + Turborepo monorepo.

```bash
pnpm install
pnpm build        # all packages, examples and docs
pnpm typecheck
pnpm test         # unit + integration (SQLite and PGlite)
pnpm lint         # Biome
pnpm test:e2e     # Playwright against the Nuxt and Next examples
```

Run the integration suites against a Postgres server with
`POSTGRES_URL=postgres://… pnpm --filter easy-cms-integration-tests test`.

## Layout

| Path | |
|---|---|
| `packages/core` | Config, Local API, auth, access, hooks, REST handler, type generation |
| `packages/drizzle` | Shared database layer; `db-sqlite` and `db-postgres` add dialects |
| `packages/admin` | Admin SPA (Vue) and its static handler |
| `packages/nuxt`, `packages/next` | Framework adapters |
| `packages/cli`, `packages/create-easy-cms` | Command line tools |
| `packages/richtext` | Rich text renderer |
| `packages/integration` | Test suites run on every database |
| `examples/*` | Example apps, also the e2e fixtures |
| `website` | Documentation (VitePress) |
| `docs` | Design document, requirements and ADRs |

## Pull requests

- Add tests for behavior changes; keep adapters thin (logic belongs in `core` or `drizzle`).
- Add a changeset for user-facing changes: `pnpm changeset`.
- Explain decisions that affect users in `docs/adr/`.
