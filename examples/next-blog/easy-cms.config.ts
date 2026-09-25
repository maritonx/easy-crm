import { defineConfig } from '@easy-cms/core'
import { postgres } from '@easy-cms/db-postgres'

export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  // A Postgres server when DATABASE_URL is set; otherwise PGlite (Postgres in WebAssembly) in .pglite.
  db: process.env.DATABASE_URL?.startsWith('postgres')
    ? postgres({ url: process.env.DATABASE_URL })
    : postgres({ pglite: process.env.PGLITE_DIR ?? '.pglite' }),
  admin: { locale: 'th' },
  collections: [
    {
      slug: 'categories',
      useAsTitle: 'name',
      access: { read: () => true },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'name' },
      ],
    },
    {
      slug: 'posts',
      drafts: true,
      useAsTitle: 'title',
      access: {
        // Visitors see published posts; logged-in editors see drafts too.
        read: ({ user }) => (user ? true : { status: { equals: 'published' } }),
      },
      fields: [
        { name: 'title', type: 'text', required: true, maxLength: 200 },
        { name: 'slug', type: 'slug', from: 'title' },
        { name: 'excerpt', type: 'textarea', maxLength: 300 },
        { name: 'cover', type: 'upload' },
        { name: 'body', type: 'richText' },
        { name: 'category', type: 'relationship', to: 'categories' },
        { name: 'tags', type: 'select', options: ['nuxt', 'vue', 'cms', 'thai'], hasMany: true },
        { name: 'author', type: 'relationship', to: 'users' },
        { name: 'publishedAt', type: 'date' },
      ],
    },
  ],
  globals: [
    {
      slug: 'site',
      access: { read: () => true },
      fields: [
        { name: 'siteName', type: 'text', defaultValue: 'Easy CMS Blog' },
        { name: 'tagline', type: 'text' },
      ],
    },
  ],
})
