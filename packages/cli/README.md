# easy-cms

Command line tool for [Easy CMS](https://github.com/easy-cms/easy-cms). Install it as a dev
dependency; every command loads `.env` from the project root.

```bash
npx easy-cms migrate:create <name>   # write a migration for config changes
npx easy-cms migrate                 # apply pending migrations
npx easy-cms migrate:status
npx easy-cms generate:types [--out file.ts]
npx easy-cms create-admin [--email you@example.com] [--name] [--role]
```

Options: `--config <file>`, `--cwd <dir>`, `--help`.
