# Migrations & deployment

## Development: automatic

While developing (`NODE_ENV` is not `production`), Easy CMS brings the database in line with
your config at startup: new fields become columns, removed fields are dropped.

::: warning Renames lose data in development
Renaming a field in development drops the old column and adds a new one. Use a migration (below)
when the data matters.
:::

## Production: migrations

In production nothing changes automatically. The server refuses to start when migrations are
pending or the config changed without one, and tells you what to run.

```bash
npx easy-cms migrate:create init     # after your first model, and after every change
git add easy-cms/migrations          # review the SQL, then commit
npx easy-cms migrate                 # where you deploy, before starting the new version
```

`migrate:create` compares your config with the last migration. Run in a terminal, it asks whether
a changed field was renamed, so data is kept. Each migration runs in one transaction; a failing
one is rolled back and not recorded.

A database set up by development push can't take migrations; run them against a fresh database.

## Checklist

- `EASY_CMS_SECRET` set (at least 32 random characters: `openssl rand -hex 32`)
- `NODE_ENV=production`
- The `easy-cms/migrations` folder deployed, and `easy-cms migrate` run
- Start the server **from the project root**: relative database paths, migrations and uploads
  resolve from the working directory
- Uploads on local disk need a persistent volume (serverless platforms don't have one yet)
- Build on the same OS and architecture as the server when using SQLite (native driver)
- Behind a trusted proxy, enable `trustProxy` for per-IP login rate limiting
- Set `auth.trustedOrigins` if the admin or frontend call the API from another origin
