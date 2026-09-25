# What is Easy CMS?

Easy CMS is a headless CMS you install into your Nuxt or Next.js app with npm. It runs inside
your app's server, so there is no separate CMS service to host:

- **You define content in code.** Collections, fields, access rules and hooks go in
  `easy-cms.config.ts`, which you review and version like any other code.
- **Editors get an admin UI** at `/admin`: lists, generated forms, rich text, a media library,
  drafts, Thai and English.
- **Your pages read content** with the typed [Local API](./local-api) on the server
  (`useEasyCMS()` in Nuxt, `getEasyCMS(config)` in Next.js), and any client can use the
  [REST API](./rest-api) at `/api/cms`.
- **Data lives in your database**: SQLite (a file, or Turso) or Postgres (a server, or PGlite
  for local development). Easy CMS only touches tables with its prefix (`ecms_`).

```
┌────────────────── your Nuxt / Next.js app ──────────────────┐
│  pages ──► Local API (typed)      browsers ──► /api/cms      │
│  editors ──► /admin                                          │
│                  @easy-cms/nuxt | @easy-cms/next             │
│                        @easy-cms/core                        │
│          SQLite / Postgres (ecms_ tables) · uploads          │
└──────────────────────────────────────────────────────────────┘
```

## When it fits

- You build sites with Nuxt or Next.js and want content editing without another service.
- You like your schema in TypeScript and in git.
- A single app server with a database is how you deploy.

## Current limits (v0.1)

- Uploads are stored on local disk; S3-compatible storage comes in v0.2.
- Drafts have no separate version: saving a published document as a draft unpublishes it.
- No GraphQL, no localization of content, no version history yet.
- Node.js ≥ 22.12; no edge runtimes.
