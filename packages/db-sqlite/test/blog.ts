import { defineConfig } from '@easy-cms/core'
import { db, SECRET } from './helpers.js'

/** A config exercising every field type. */
export const blog = defineConfig({
  secret: SECRET,
  db: db(),
  collections: [
    {
      slug: 'authors',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'email', type: 'email', unique: true },
        { name: 'favorite', type: 'relationship', to: 'posts' },
      ],
    },
    {
      slug: 'posts',
      drafts: true,
      useAsTitle: 'title',
      fields: [
        { name: 'title', type: 'text', required: true, maxLength: 100 },
        { name: 'slug', type: 'slug', from: 'title' },
        { name: 'views', type: 'number', defaultValue: 0, min: 0 },
        { name: 'featured', type: 'boolean', defaultValue: false },
        { name: 'publishedAt', type: 'date' },
        { name: 'kind', type: 'select', options: ['news', 'blog'], defaultValue: 'blog' },
        { name: 'tags', type: 'select', options: ['a', 'b', 'c'], hasMany: true },
        { name: 'body', type: 'richText' },
        { name: 'meta', type: 'json' },
        { name: 'author', type: 'relationship', to: 'authors' },
        { name: 'related', type: 'relationship', to: 'posts', hasMany: true },
        {
          name: 'links',
          type: 'array',
          fields: [
            { name: 'label', type: 'text', required: true },
            { name: 'url', type: 'text' },
            { name: 'tags', type: 'select', options: ['x', 'y'], hasMany: true },
            { name: 'notes', type: 'array', fields: [{ name: 'text', type: 'text' }] },
          ],
        },
        {
          name: 'seo',
          type: 'group',
          fields: [
            { name: 'title', type: 'text' },
            { name: 'noIndex', type: 'boolean' },
          ],
        },
      ],
    },
  ],
  globals: [
    {
      slug: 'site',
      fields: [
        { name: 'siteName', type: 'text', defaultValue: 'My site' },
        { name: 'featuredPost', type: 'relationship', to: 'posts' },
      ],
    },
  ],
})
