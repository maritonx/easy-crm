# Next.js blog example

A Next.js 16 (App Router) site using Easy CMS with Postgres. Locally it runs on PGlite, Postgres in
WebAssembly, so there is nothing to install; set `DATABASE_URL` to use a Postgres server.

```bash
cp .env.example .env        # then set EASY_CMS_SECRET (openssl rand -hex 32)
pnpm seed                   # creates .pglite with an admin and sample posts
pnpm dev
```

- Site: http://localhost:3000 — Server Components read content with `getEasyCMS(config)`
- Admin: http://localhost:3000/admin (`app/admin/[[...path]]/route.ts`)
- REST API: http://localhost:3000/api/cms/posts (`app/api/cms/[[...path]]/route.ts`)

`next.config.ts` is wrapped in `withEasyCMS()` so the server build keeps the admin UI and database
drivers. In production create migrations with `pnpm migrate:create <name>`, apply them with
`pnpm migrate`, and start the server from the project root.
