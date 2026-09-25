# Easy CMS

Embedded, code-first headless CMS for **Nuxt** and **Next.js**. MIT licensed.

> ⚠️ Early development (milestone M0). See [docs/DESIGN.md](docs/DESIGN.md) and [docs/SRS.md](docs/SRS.md).

## Packages

| Package | Status |
|---|---|
| [`@easy-cms/core`](packages/core) | config, validation, type inference |

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
