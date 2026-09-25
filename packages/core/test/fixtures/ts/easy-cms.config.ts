import { defineConfig, isAdmin } from '../../../src/index.js'

export default defineConfig({
  secret: 'fixture-secret-fixture-secret-fixture',
  db: { name: 'test' },
  admin: { locale: 'th' },
  collections: [
    {
      slug: 'posts',
      access: { update: isAdmin },
      fields: [{ name: 'title', type: 'text', required: true }],
    },
  ],
})
