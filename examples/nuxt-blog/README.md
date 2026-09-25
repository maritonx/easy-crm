# Nuxt blog example

A Nuxt 4 site using Easy CMS as its back office.

```bash
cp .env.example .env        # then set EASY_CMS_SECRET (openssl rand -hex 32)
pnpm seed                   # creates cms.db with an admin and sample posts
pnpm dev
```

- Site: http://localhost:3000
- REST API: http://localhost:3000/api/cms/posts
- Server routes use the typed Local API: `const cms = await useEasyCMS()`

## Deploying

In production the schema is not changed automatically. Create a migration when the config changes,
commit it, and apply it where you deploy:

```bash
pnpm migrate:create add-something
pnpm build
pnpm migrate                # on the server, from the project root
pnpm preview                # node .output/server/index.mjs, from the project root
```
