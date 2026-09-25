# Databases

## SQLite

```bash
npm install @easy-cms/db-sqlite
```

```ts
import { sqlite } from '@easy-cms/db-sqlite'

db: sqlite({ url: 'file:./cms.db' }) // relative to the project root
db: sqlite({ url: 'libsql://my-db.turso.io', authToken: process.env.TURSO_TOKEN })
```

Uses libSQL. In-memory databases (`:memory:`) are not supported.

## Postgres

```bash
npm install @easy-cms/db-postgres
```

```ts
import { postgres } from '@easy-cms/db-postgres'

db: postgres({ url: process.env.DATABASE_URL }) // a server, via postgres.js
db: postgres({ pglite: '.pglite' }) // PGlite: Postgres in WebAssembly, needs @electric-sql/pglite
```

PGlite is handy locally and in tests: real Postgres with nothing to install. A common setup:

```ts
db: process.env.DATABASE_URL ? postgres({ url: process.env.DATABASE_URL }) : postgres({ pglite: '.pglite' }),
```

## Common options

| Option | Default | |
|---|---|---|
| `tablePrefix` | `ecms_` | Prefix of every table Easy CMS creates |
| `migrationDir` | `easy-cms/migrations` | Where migration files live |

## Sharing a database with your app

Easy CMS creates and changes only tables with its prefix, so it can use your app's database.
Your own tables are never touched, in development or by migrations.

## Differences to know

- Text sorting follows the database's collation: SQLite and PGlite sort case-sensitively, most
  Postgres servers don't.
- Migration files are made for one database; files created for SQLite are refused on Postgres.
