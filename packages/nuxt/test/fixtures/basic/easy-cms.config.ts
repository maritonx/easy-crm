import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'

export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? 'fixture-secret-fixture-secret-fixture',
  db: sqlite({ url: process.env.EASY_CMS_DB_URL ?? 'file:./cms.db' }),
  collections: [
    {
      slug: 'posts',
      drafts: true,
      access: { read: ({ user }) => (user ? true : { status: { equals: 'published' } }) },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'title' },
      ],
    },
  ],
})
