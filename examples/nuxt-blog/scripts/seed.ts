// Seeds an admin and a few posts: `pnpm seed`
import { createEasyCMS } from '@easy-cms/core'
import config from '../easy-cms.config.ts'

const cms = await createEasyCMS(config)
if ((await cms.count('users')) > 0) {
  console.log('Already seeded.')
} else {
  const admin = await cms.create('users', {
    email: 'admin@example.com',
    password: 'change-me-please',
    role: 'admin',
    name: 'Admin',
  })
  const category = await cms.create('categories', { name: 'Guides' })
  const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

  await cms.create('posts', {
    title: 'Hello Easy CMS',
    excerpt: 'An embedded, code-first CMS running inside this Nuxt app.',
    body: {
      type: 'doc',
      content: [paragraph('Content lives in SQLite and is served by the Local API.')],
    },
    category: category.id,
    tags: ['nuxt', 'cms'],
    author: admin.id,
    status: 'published',
    publishedAt: new Date(),
  })
  await cms.create('posts', {
    title: 'สวัสดีชาวโลก',
    excerpt: 'Slugs keep Thai characters readable.',
    body: { type: 'doc', content: [paragraph('บทความนี้มี slug เป็นภาษาไทย')] },
    tags: ['thai'],
    author: admin.id,
    status: 'published',
    publishedAt: new Date(Date.now() - 86_400_000),
  })
  await cms.create('posts', { title: 'Work in progress', author: admin.id })
  await cms.updateGlobal('site', { tagline: 'Built with Nuxt and Easy CMS' })
  console.log('Seeded. Log in as admin@example.com / change-me-please')
}
await cms.destroy()
