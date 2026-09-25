export type DatabaseChoice = 'sqlite' | 'postgres'

export function configTemplate(db: DatabaseChoice): string {
  const database =
    db === 'sqlite'
      ? `import { sqlite } from '@easy-cms/db-sqlite'`
      : `import { postgres } from '@easy-cms/db-postgres'`
  const adapter =
    db === 'sqlite'
      ? `  db: sqlite({ url: process.env.DATABASE_URL ?? 'file:./cms.db' }),`
      : `  // A Postgres server when DATABASE_URL is set; otherwise PGlite (Postgres in WebAssembly) in .pglite.
  db: process.env.DATABASE_URL
    ? postgres({ url: process.env.DATABASE_URL })
    : postgres({ pglite: '.pglite' }),`
  return `import { defineConfig } from '@easy-cms/core'
${database}

export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
${adapter}
  admin: { locale: 'en' },
  collections: [
    {
      slug: 'posts',
      drafts: true,
      useAsTitle: 'title',
      // Visitors see published posts; logged-in editors see drafts too.
      access: { read: ({ user }) => (user ? true : { status: { equals: 'published' } }) },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'title' },
        { name: 'cover', type: 'upload' },
        { name: 'body', type: 'richText' },
      ],
    },
  ],
  globals: [
    {
      slug: 'site',
      access: { read: () => true },
      fields: [{ name: 'siteName', type: 'text', defaultValue: 'My site' }],
    },
  ],
})
`
}

export function nextApiRoute(configImport: string): string {
  return `import { createRouteHandlers } from '@easy-cms/next'
import config from '${configImport}'

// The Easy CMS REST API (routes.api in easy-cms.config.ts).
export const { GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS } = createRouteHandlers(config)
`
}

export function nextAdminRoute(configImport: string): string {
  return `import { createAdminRouteHandlers } from '@easy-cms/next'
import config from '${configImport}'

// The Easy CMS admin UI (admin.path in easy-cms.config.ts).
export const { GET, HEAD } = createAdminRouteHandlers(config)
`
}
