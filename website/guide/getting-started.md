# Getting started

You need a Nuxt 4 or Next.js 15+ project and Node.js ≥ 22.12.

## Add Easy CMS

In your project directory:

```bash
npx create-easy-cms
```

It detects Nuxt or Next.js, asks which database to use, installs the packages and:

- creates `easy-cms.config.ts` with a sample `posts` collection and a `site` global
- adds a random `EASY_CMS_SECRET` to `.env`
- ignores `cms.db`, `uploads/` and `.pglite/` in `.gitignore`
- **Nuxt:** adds `@easy-cms/nuxt` to `modules`
- **Next.js:** creates `app/api/cms/[[...path]]/route.ts` and `app/admin/[[...path]]/route.ts`
  and wraps `next.config.ts` in `withEasyCMS()`

Options: `--db sqlite|postgres`, `--yes` (accept defaults), `--skip-install`. Running it again is safe.

## Run it

```bash
npm run dev
```

Open `http://localhost:3000/admin`. With no users yet, the admin
asks you to create the first admin. You can also run `npx easy-cms create-admin`.

In development the database schema follows your config automatically. Edit
`easy-cms.config.ts`, save, and the admin shows the new fields.

## Read content

::: code-group

```ts [Nuxt: server/api/posts.get.ts]
export default defineEventHandler(async () => {
  const cms = await useEasyCMS()
  return cms.find('posts', { sort: '-createdAt', limit: 10 })
})
```

```tsx [Next.js: app/page.tsx]
import { getEasyCMS } from '@easy-cms/next'
import config from '@/easy-cms.config'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const cms = await getEasyCMS(config)
  const { docs } = await cms.find('posts', { sort: '-createdAt', limit: 10 })
  return <ul>{docs.map((post) => <li key={post.id}>{post.title}</li>)}</ul>
}
```

:::

`find` returns only published documents by default, and `post.title` is typed as `string`
because the config says the field is required text.

## Next steps

- Model your content: [Configuration](./configuration) and [Fields](./fields)
- Decide who can do what: [Access control](./access-control)
- Before your first deploy: [Migrations & deployment](./deployment)
