# @easy-cms/core

Core of [Easy CMS](https://github.com/maritonx/easy-crm) — an embedded, code-first headless CMS for Nuxt and Next.js.

> ⚠️ Pre-release. Not ready for production.

```ts
// easy-cms.config.ts
import { defineConfig, isAdmin, type CollectionDocument } from '@easy-cms/core'

const config = defineConfig({
  secret: process.env.EASY_CMS_SECRET!,
  db: sqlite({ url: 'file:./cms.db' }),
  collections: [
    {
      slug: 'posts',
      drafts: true,
      access: { update: isAdmin },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'title' },
        { name: 'body', type: 'richText' },
      ],
    },
  ],
})

export default config
export type Post = CollectionDocument<typeof config, 'posts'>
```
