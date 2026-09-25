# CLI

## create-easy-cms

```bash
npx create-easy-cms [dir] [--db sqlite|postgres] [--yes] [--skip-install]
```

Adds Easy CMS to a Nuxt or Next.js project. See [Getting started](./getting-started).

## easy-cms

Installed as a dev dependency. Every command loads `.env` from the project root.

```bash
npx easy-cms <command> [--config <file>] [--cwd <dir>]
```

| Command | |
|---|---|
| `migrate` | Apply pending migrations |
| `migrate:create <name>` | Write a migration for config changes |
| `migrate:status` | List migrations and whether they are applied |
| `generate:types [--out <file>]` | Write TypeScript types (default `easy-cms-types.ts`) |
| `create-admin [--email] [--name] [--role]` | Create a user; asks for the password, or reads `EASY_CMS_ADMIN_PASSWORD` |

Every command has `--help` and exits non-zero on failure.
