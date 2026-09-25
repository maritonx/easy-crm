import { describe, expect, it } from 'vitest'
import { type CollectionConfig, type Field, validateConfig } from '../src/index.js'
import { baseConfig } from './helpers.js'

const paths = (collections: CollectionConfig[]) =>
  validateConfig(baseConfig({ collections })).map((i) => i.path)

const withFields = (fields: Field[], extra: Partial<CollectionConfig> = {}) =>
  paths([{ slug: 'posts', fields, ...extra }])

describe('validateConfig', () => {
  it('accepts a minimal config', () => {
    expect(validateConfig(baseConfig())).toEqual([])
  })

  it('accepts a full config', () => {
    const issues = validateConfig(
      baseConfig({
        admin: { path: '/cms', locale: 'th' },
        upload: { dir: 'files', maxFileSize: 1024 },
        collections: [
          {
            slug: 'posts',
            drafts: true,
            useAsTitle: 'title',
            fields: [
              { name: 'title', type: 'text', required: true, maxLength: 200 },
              { name: 'slug', type: 'slug', from: 'title' },
              {
                name: 'tags',
                type: 'select',
                options: ['a', { label: 'B', value: 'b' }],
                hasMany: true,
                defaultValue: ['a'],
              },
              { name: 'author', type: 'relationship', to: 'users' },
              { name: 'related', type: 'relationship', to: 'posts', hasMany: true },
              { name: 'cover', type: 'upload' },
              { name: 'links', type: 'array', fields: [{ name: 'url', type: 'text' }] },
              { name: 'seo', type: 'group', fields: [{ name: 'title', type: 'text' }] },
            ],
          },
        ],
        globals: [{ slug: 'site', fields: [{ name: 'siteName', type: 'text' }] }],
      }),
    )
    expect(issues).toEqual([])
  })

  describe('secret (FR-CFG-04)', () => {
    it('is required', () => {
      const issues = validateConfig(baseConfig({ secret: '' }))
      expect(issues).toMatchObject([{ path: 'secret', message: 'is required' }])
      expect(issues[0]?.hint).toContain('EASY_CMS_SECRET')
    })

    it('must be at least 32 characters', () => {
      const issues = validateConfig(baseConfig({ secret: 'x'.repeat(31) }))
      expect(issues).toMatchObject([{ path: 'secret', message: expect.stringContaining('got 31') }])
    })
  })

  it('requires a db adapter', () => {
    // @ts-expect-error testing a JS user who forgot db
    expect(validateConfig({ secret: 'x'.repeat(32) }).map((i) => i.path)).toEqual(['db'])
  })

  it('checks admin options', () => {
    // @ts-expect-error invalid locale
    const issues = validateConfig(baseConfig({ admin: { path: 'admin', locale: 'fr' } }))
    expect(issues.map((i) => i.path)).toEqual(['admin.path', 'admin.locale'])
  })

  it('checks auth options', () => {
    const issues = validateConfig(
      baseConfig({
        auth: {
          roles: ['editor'],
          tokenExpiration: 0,
          maxLoginAttempts: 1.5,
          trustedOrigins: ['https://ok.test', 'https://bad.test/path'],
        },
      }),
    )
    expect(issues.map((i) => i.path)).toEqual([
      'auth.roles',
      'auth.tokenExpiration',
      'auth.maxLoginAttempts',
      'auth.trustedOrigins[1]',
    ])
  })

  it('reserves slugs used internally', () => {
    expect(paths([{ slug: 'login-attempts', fields: [] }])).toEqual(['collections[0].slug'])
  })

  describe('slugs', () => {
    it('rejects bad, reserved and duplicate slugs', () => {
      expect(
        paths([
          { slug: 'Posts', fields: [] },
          { slug: 'globals', fields: [] },
          { slug: 'pages', fields: [] },
          { slug: 'pages', fields: [] },
        ]),
      ).toEqual(['collections[0].slug', 'collections[1].slug', 'collections[3].slug'])
    })

    it('allows a global and a collection to share a slug', () => {
      const issues = validateConfig(
        baseConfig({
          collections: [{ slug: 'menu', fields: [] }],
          globals: [{ slug: 'menu', fields: [] }],
        }),
      )
      expect(issues).toEqual([])
    })
  })

  describe('fields', () => {
    it('rejects invalid, duplicate and reserved names', () => {
      expect(
        withFields([
          { name: 'my field', type: 'text' },
          { name: 'title', type: 'text' },
          { name: 'title', type: 'text' },
          { name: 'id', type: 'text' },
        ]),
      ).toEqual([
        'collections.posts.fields[0].name',
        'collections.posts.fields.title',
        'collections.posts.fields.id',
      ])
    })

    it('reserves status only when drafts are on', () => {
      const status: Field[] = [{ name: 'status', type: 'text' }]
      expect(withFields(status)).toEqual([])
      expect(withFields(status, { drafts: true })).toEqual(['collections.posts.fields.status'])
    })

    it('rejects unknown field types', () => {
      const field = { name: 'x', type: 'color' } as unknown as Field
      const issues = validateConfig(
        baseConfig({ collections: [{ slug: 'posts', fields: [field] }] }),
      )
      expect(issues).toMatchObject([
        { path: 'collections.posts.fields.x.type', hint: expect.stringContaining('richText') },
      ])
    })

    it('checks min/max ranges', () => {
      expect(
        withFields([
          { name: 'a', type: 'text', minLength: 5, maxLength: 1 },
          { name: 'b', type: 'number', min: 10, max: 0 },
          {
            name: 'c',
            type: 'array',
            minRows: 3,
            maxRows: 1,
            fields: [{ name: 'x', type: 'text' }],
          },
        ]),
      ).toEqual([
        'collections.posts.fields.a',
        'collections.posts.fields.b',
        'collections.posts.fields.c',
      ])
    })

    it('checks select options and defaults', () => {
      expect(
        withFields([
          { name: 'a', type: 'select', options: [] },
          { name: 'b', type: 'select', options: ['x', 'x'] },
          { name: 'c', type: 'select', options: ['x'], defaultValue: 'y' },
          { name: 'd', type: 'select', options: ['x'], defaultValue: ['x'] },
        ]),
      ).toEqual([
        'collections.posts.fields.a.options',
        'collections.posts.fields.b.options',
        'collections.posts.fields.c.defaultValue',
        'collections.posts.fields.d.defaultValue',
      ])
    })

    it('checks slug sources', () => {
      expect(
        withFields([
          { name: 'count', type: 'number' },
          { name: 'a', type: 'slug', from: 'missing' },
          { name: 'b', type: 'slug', from: 'count' },
        ]),
      ).toEqual(['collections.posts.fields.a.from', 'collections.posts.fields.b.from'])
    })

    it('checks relationship targets, allowing built-in collections', () => {
      const issues = validateConfig(
        baseConfig({
          collections: [
            {
              slug: 'posts',
              fields: [
                { name: 'author', type: 'relationship', to: 'users' },
                { name: 'image', type: 'relationship', to: 'media' },
                { name: 'category', type: 'relationship', to: 'categories' },
              ],
            },
          ],
        }),
      )
      expect(issues).toMatchObject([
        {
          path: 'collections.posts.fields.category.to',
          hint: expect.stringContaining('users, media, posts'),
        },
      ])
    })

    it('validates nested fields in arrays and groups', () => {
      expect(
        withFields([
          { name: 'empty', type: 'group', fields: [] },
          { name: 'rows', type: 'array', fields: [{ name: 'id', type: 'text' }] },
          {
            name: 'seo',
            type: 'group',
            fields: [{ name: 'ref', type: 'relationship', to: 'nope' }],
          },
        ]),
      ).toEqual([
        'collections.posts.fields.empty.fields',
        'collections.posts.fields.rows.fields.id',
        'collections.posts.fields.seo.fields.ref.to',
      ])
    })
  })

  it('checks useAsTitle', () => {
    const fields: Field[] = [
      { name: 'title', type: 'text' },
      { name: 'body', type: 'richText' },
    ]
    expect(withFields(fields, { useAsTitle: 'title' })).toEqual([])
    expect(withFields(fields, { useAsTitle: 'missing' })).toEqual(['collections.posts.useAsTitle'])
    expect(withFields(fields, { useAsTitle: 'body' })).toEqual(['collections.posts.useAsTitle'])
  })

  it('reports every problem at once', () => {
    const issues = validateConfig({
      secret: '',
      // @ts-expect-error testing a JS user
      db: undefined,
      collections: [{ slug: 'posts', fields: [{ name: 'ref', type: 'relationship', to: 'nope' }] }],
    })
    expect(issues.map((i) => i.path)).toEqual(['secret', 'db', 'collections.posts.fields.ref.to'])
  })
})
