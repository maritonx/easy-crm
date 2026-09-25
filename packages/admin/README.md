# @easy-cms/admin

The prebuilt admin UI of [Easy CMS](https://github.com/easy-cms/easy-cms): a Vue 3 single-page app
that talks to the Easy CMS REST API. Framework adapters (`@easy-cms/nuxt`, `@easy-cms/next`) serve it
for you; you normally don't install this package directly.

- Login, first-admin setup, dashboard
- Lists with search, sorting, pagination and bulk delete
- Forms generated from your config for every field type, including rich text (Tiptap), relationships and arrays
- Drafts (Save draft / Publish), unsaved-changes warning, per-document permissions
- Thai and English

## Serving it yourself

```ts
import { createAdminHandler } from '@easy-cms/admin'

const admin = createAdminHandler({ basePath: '/admin', apiPath: '/api/cms', locale: 'th' })
// (request: Request) => Promise<Response>: static assets + the HTML shell with security headers
```

For static hosting, serve `dist/app` at the admin path and answer every other admin route with
`renderShell(readFileSync('dist/app/shell.html', 'utf8'), options)` plus `SECURITY_HEADERS`.

## Developing

```bash
pnpm --dir examples/nuxt-blog dev   # an Easy CMS API on :3000
pnpm --dir packages/admin dev       # Vite on :5173, proxies /api/cms to :3000
```
