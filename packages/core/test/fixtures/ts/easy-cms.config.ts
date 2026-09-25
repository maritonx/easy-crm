import { defineConfig, isAdmin } from '../../../src/index.js'
import { fakeDb } from '../../helpers.js'

export default defineConfig({
  secret: 'fixture-secret-fixture-secret-fixture',
  db: fakeDb,
  admin: { locale: 'th' },
  collections: [
    {
      slug: 'posts',
      access: { update: isAdmin },
      fields: [{ name: 'title', type: 'text', required: true }],
    },
  ],
})
