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

## Environment variables

`create-easy-cms` puts `EASY_CMS_SECRET` (and `DATABASE_URL`, if you use one) in `.env`. That file
is for development; whether production reads it depends on how the server starts:

| Server | Reads `.env` in production? | What to do |
|---|---|---|
| Next.js (`next start`) | Yes | Nothing, or set the variables on the host |
| Nuxt (`node .output/server/index.mjs`) | **No** | Set the variables on the host, or start with `node --env-file=.env .output/server/index.mjs` |
| Platforms (Vercel, Netlify, Fly, Docker…) | Use the platform's settings | Add the variables in its dashboard, CLI or compose file |

When `EASY_CMS_SECRET` is missing, the API answers `500` and the log says
`secret: is required`.

## Checklist

- `EASY_CMS_SECRET` set in the production environment (at least 32 random characters:
  `openssl rand -hex 32`); see [Environment variables](#environment-variables)
- `NODE_ENV=production`
- The `easy-cms/migrations` folder deployed, and `easy-cms migrate` run
- Start the server **from the project root**: relative database paths, migrations and uploads
  resolve from the working directory
- Uploads on local disk need a persistent volume; on serverless platforms use
  [S3 storage](./uploads#s3-cloudflare-r2-and-minio)
- Build on the same OS and architecture as the server when using SQLite (native driver)
- Behind a trusted proxy, enable `trustProxy` for per-IP login rate limiting
- Set `auth.trustedOrigins` if the admin or frontend call the API from another origin
