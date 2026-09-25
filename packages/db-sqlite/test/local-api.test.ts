import { NotFoundError, QueryError, ValidationError } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { blog } from './blog.js'
import { open, rawClient } from './helpers.js'

describe('create / findById', () => {
  it('round-trips every field type', async () => {
    const cms = await open(blog)
    const author = await cms.create('authors', { name: 'Ann', email: 'ANN@example.com' })
    const post = await cms.create('posts', {
      title: 'Hello World',
      publishedAt: new Date('2026-01-02T03:04:05Z'),
      tags: ['b', 'a', 'b'],
      body: { type: 'doc', content: [{ type: 'paragraph' }] },
      meta: { nested: [1, 2] },
      author: author.id,
      links: [
        { label: 'Home', url: '/', tags: ['x'], notes: [{ text: 'one' }, { text: 'two' }] },
        { label: 'Empty' },
      ],
      seo: { title: 'SEO', noIndex: true },
    })

    const found = await cms.findById('posts', post.id, { depth: 0 })
    expect(found).toMatchObject({
      id: post.id,
      title: 'Hello World',
      slug: 'hello-world',
      status: 'draft',
      views: 0,
      featured: false,
      publishedAt: '2026-01-02T03:04:05.000Z',
      kind: 'blog',
      tags: ['b', 'a'],
      body: { type: 'doc', content: [{ type: 'paragraph' }] },
      meta: { nested: [1, 2] },
      author: author.id,
      related: [],
      links: [
        { label: 'Home', url: '/', tags: ['x'], notes: [{ text: 'one' }, { text: 'two' }] },
        { label: 'Empty', url: null, tags: [], notes: [] },
      ],
      seo: { title: 'SEO', noIndex: true },
    })
    expect(found?.links?.[0]?.id).toEqual(expect.any(String))
    expect(found?.links?.[0]?.notes?.[0]?.id).toEqual(expect.any(String))
    expect(found?.createdAt).toBe(found?.updatedAt)
    expect(author.email).toBe('ann@example.com')
    await cms.destroy()
  })

  it('returns null for missing or malformed ids', async () => {
    const cms = await open(blog)
    expect(await cms.findById('posts', 999)).toBeNull()
    expect(await cms.findById('posts', 'abc')).toBeNull()
    await cms.destroy()
  })

  it('rejects unknown collections', async () => {
    const cms = await open(blog)
    // @ts-expect-error unknown slug
    await expect(cms.find('nope')).rejects.toThrow(QueryError)
    await cms.destroy()
  })
})

describe('validation', () => {
  it('reports every invalid field with its path', async () => {
    const cms = await open(blog)
    const error = await cms
      .create('posts', {
        // @ts-expect-error wrong type on purpose
        title: 42,
        views: -1,
        // @ts-expect-error not an option
        kind: 'poem',
        publishedAt: 'not a date',
        links: [{ label: '' }],
        status: 'archived' as 'draft',
      })
      .catch((e) => e)
    expect(error).toBeInstanceOf(ValidationError)
    expect(error.status).toBe(400)
    expect(error.errors.map((e: { field: string }) => e.field).sort()).toEqual(
      ['kind', 'links.0.label', 'publishedAt', 'status', 'title', 'views'].sort(),
    )
    await cms.destroy()
  })

  it('checks that related documents exist', async () => {
    const cms = await open(blog)
    const error = await cms
      .create('posts', { title: 'x', author: 12345, related: [999] })
      .catch((e) => e)
    expect(error.errors).toEqual([
      { field: 'author', message: 'authors 12345 does not exist' },
      { field: 'related', message: 'posts 999 does not exist' },
    ])
    await cms.destroy()
  })

  it('enforces unique fields', async () => {
    const cms = await open(blog)
    const a = await cms.create('authors', { name: 'A', email: 'same@example.com' })
    await expect(
      cms.create('authors', { name: 'B', email: 'same@example.com' }),
    ).rejects.toMatchObject({
      errors: [{ field: 'email', message: 'must be unique' }],
    })
    // updating a document to its own value is fine
    await expect(cms.update('authors', a.id, { email: 'same@example.com' })).resolves.toBeTruthy()
    await cms.destroy()
  })

  it('runs custom validate functions with the whole document', async () => {
    const cms = await open({
      ...blog,
      collections: [
        {
          slug: 'events',
          fields: [
            { name: 'start', type: 'number' },
            {
              name: 'end',
              type: 'number',
              validate: (value, { data }) =>
                value == null || value >= (data.start as number) ? true : 'must be after start',
            },
          ],
        },
      ],
      globals: [],
    })
    await expect(cms.create('events', { start: 5, end: 1 })).rejects.toMatchObject({
      errors: [{ field: 'end', message: 'must be after start' }],
    })
    await cms.destroy()
  })
})

describe('slugs', () => {
  it('generates readable slugs from Thai titles and keeps them unique', async () => {
    const cms = await open(blog)
    const a = await cms.create('posts', { title: 'สวัสดี ชาวโลก!' })
    const b = await cms.create('posts', { title: 'สวัสดี ชาวโลก!' })
    const c = await cms.create('posts', { title: 'Other', slug: 'สวัสดี-ชาวโลก' })
    expect([a.slug, b.slug, c.slug]).toEqual(['สวัสดี-ชาวโลก', 'สวัสดี-ชาวโลก-2', 'สวัสดี-ชาวโลก-3'])
    await cms.destroy()
  })

  it('keeps the slug when the title changes', async () => {
    const cms = await open(blog)
    const post = await cms.create('posts', { title: 'First' })
    const updated = await cms.update('posts', post.id, { title: 'Second' })
    expect(updated.slug).toBe('first')
    await cms.destroy()
  })
})

describe('update', () => {
  it('merges top-level and group fields, replaces arrays', async () => {
    const cms = await open(blog)
    const post = await cms.create('posts', {
      title: 'T',
      tags: ['a', 'b'],
      links: [{ label: 'one' }, { label: 'two' }],
      seo: { title: 'S', noIndex: true },
    })
    const firstLinkId = post.links?.[0]?.id as string

    const updated = await cms.update('posts', post.id, {
      views: 5,
      seo: { title: 'S2' },
      links: [{ id: firstLinkId, label: 'one!' }],
      tags: ['c'],
    })
    expect(updated).toMatchObject({
      title: 'T',
      views: 5,
      seo: { title: 'S2', noIndex: true },
      links: [{ id: firstLinkId, label: 'one!' }],
      tags: ['c'],
    })
    expect(updated.links).toHaveLength(1)
    expect(updated.createdAt).toBe(post.createdAt)
    expect(updated.updatedAt >= post.updatedAt).toBe(true)
    await cms.destroy()
  })

  it('validates the merged document (required fields cannot be cleared)', async () => {
    const cms = await open(blog)
    const post = await cms.create('posts', { title: 'T' })
    await expect(cms.update('posts', post.id, { title: null as never })).rejects.toMatchObject({
      errors: [{ field: 'title', message: 'is required' }],
    })
    await cms.destroy()
  })

  it('throws NotFoundError for missing documents', async () => {
    const cms = await open(blog)
    await expect(cms.update('posts', 404, { title: 'x' })).rejects.toThrow(NotFoundError)
    await expect(cms.delete('posts', 404)).rejects.toThrow(NotFoundError)
    await cms.destroy()
  })

  it('changes status', async () => {
    const cms = await open(blog)
    const post = await cms.create('posts', { title: 'T' })
    expect((await cms.update('posts', post.id, { status: 'published' })).status).toBe('published')
    expect((await cms.update('posts', post.id, { views: 1 })).status).toBe('published')
    await cms.destroy()
  })
})

describe('delete', () => {
  it('removes the document and every child row', async () => {
    const cms = await open(blog)
    const post = await cms.create('posts', {
      title: 'T',
      tags: ['a'],
      links: [{ label: 'l', tags: ['x'], notes: [{ text: 'n' }] }],
    })
    const deleted = await cms.delete('posts', post.id)
    expect(deleted.id).toBe(post.id)
    expect(await cms.findById('posts', post.id)).toBeNull()

    const client = rawClient(cms.cwd)
    for (const table of [
      'ecms_posts__tags',
      'ecms_posts__links',
      'ecms_posts__links__tags',
      'ecms_posts__links__notes',
    ]) {
      const { rows } = await client.execute(`SELECT count(*) AS n FROM ${table}`)
      expect(rows[0]?.n, table).toBe(0)
    }
    client.close()
    await cms.destroy()
  })
})

describe('populate (FR-LAPI-04)', () => {
  it('populates relationships to the requested depth, including circular ones', async () => {
    const cms = await open(blog)
    const author = await cms.create('authors', { name: 'Ann' })
    const post = await cms.create('posts', { title: 'P', author: author.id })
    await cms.update('authors', author.id, { favorite: post.id })
    const other = await cms.create('posts', { title: 'Q', related: [post.id], author: author.id })

    const depth0 = await cms.findById('posts', other.id, { depth: 0 })
    expect(depth0?.author).toBe(author.id)
    expect(depth0?.related).toEqual([post.id])

    const depth1 = await cms.findById('posts', other.id)
    expect(depth1?.author).toMatchObject({ id: author.id, name: 'Ann', favorite: post.id })
    expect(depth1?.related).toMatchObject([{ id: post.id, title: 'P', author: author.id }])

    const depth2 = await cms.findById('posts', other.id, { depth: 2 })
    expect(depth2?.author).toMatchObject({ favorite: { id: post.id, title: 'P' } })

    const deep = await cms.findById('posts', other.id, { depth: 99 })
    // capped at 3: other → author → favorite → author (id)
    expect(deep?.author).toMatchObject({
      favorite: { author: { id: author.id, favorite: post.id } },
    })
    await cms.destroy()
  })

  it('drops related documents that were deleted', async () => {
    const cms = await open(blog)
    const a = await cms.create('posts', { title: 'A' })
    const b = await cms.create('posts', { title: 'B', related: [a.id] })
    const author = await cms.create('authors', { name: 'X', favorite: a.id })
    await cms.delete('posts', a.id)
    expect((await cms.findById('posts', b.id))?.related).toEqual([])
    expect((await cms.findById('authors', author.id))?.favorite).toBeNull()
    await cms.destroy()
  })
})

describe('globals', () => {
  it('returns defaults before the first save', async () => {
    const cms = await open(blog)
    expect(await cms.findGlobal('site')).toEqual({
      siteName: 'My site',
      featuredPost: null,
      updatedAt: null,
    })
    await cms.destroy()
  })

  it('saves, merges and populates', async () => {
    const cms = await open(blog)
    const post = await cms.create('posts', { title: 'P' })
    await cms.updateGlobal('site', { featuredPost: post.id })
    const site = await cms.updateGlobal('site', { siteName: 'Easy' })
    expect(site).toMatchObject({ siteName: 'Easy', featuredPost: { id: post.id, title: 'P' } })
    expect(site.updatedAt).toEqual(expect.any(String))
    await expect(cms.updateGlobal('site', { featuredPost: 999 })).rejects.toThrow(ValidationError)
    await cms.destroy()
  })
})
