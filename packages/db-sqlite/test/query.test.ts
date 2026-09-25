import { QueryError, type Where } from '@easy-cms/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { blog } from './blog.js'
import { open } from './helpers.js'

type CMS = Awaited<ReturnType<typeof open<typeof blog>>>
let cms: CMS
const ids: Record<string, number> = {}

beforeAll(async () => {
  cms = await open(blog)
  const author = await cms.create('authors', { name: 'Ann' })
  const posts = [
    {
      title: 'Alpha',
      views: 10,
      featured: true,
      tags: ['a'],
      kind: 'news',
      seo: { title: 'first' },
      links: [{ label: 'x', url: 'https://a.test' }],
    },
    {
      title: 'Beta',
      views: 20,
      tags: ['a', 'b'],
      publishedAt: '2026-02-01T00:00:00Z',
      author: author.id,
    },
    { title: 'Gamma 100%', views: 30, tags: [], links: [{ label: 'y', tags: ['y'] }] },
    { title: 'delta', status: 'published', publishedAt: '2026-03-01T00:00:00Z' },
  ] as const
  for (const post of posts) {
    const created = await cms.create('posts', post)
    ids[post.title] = created.id as number
  }
  ids.author = author.id as number
  return () => cms.destroy()
})

const titles = async (where: Where, sort: string | string[] = 'title') =>
  (await cms.find('posts', { draft: true, where, sort, limit: 0 })).docs.map((d) => d.title)

describe('where operators (FR-LAPI-02)', () => {
  it('equals / not_equals, including null', async () => {
    expect(await titles({ views: { equals: 20 } })).toEqual(['Beta'])
    expect(await titles({ views: { not_equals: 20 } })).toEqual(['Alpha', 'Gamma 100%', 'delta'])
    expect(await titles({ publishedAt: { equals: null } })).toEqual(['Alpha', 'Gamma 100%'])
    expect(await titles({ publishedAt: { not_equals: null } })).toEqual(['Beta', 'delta'])
  })

  it('in / not_in', async () => {
    expect(await titles({ views: { in: [10, 30] } })).toEqual(['Alpha', 'Gamma 100%'])
    expect(await titles({ views: { not_in: [10, 30] } })).toEqual(['Beta', 'delta'])
    expect(await titles({ views: { in: [] } })).toEqual([])
  })

  it('comparisons on numbers and dates', async () => {
    expect(await titles({ views: { gt: 10, lte: 30 } })).toEqual(['Beta', 'Gamma 100%'])
    expect(await titles({ publishedAt: { gte: new Date('2026-02-15') } as never })).toEqual([
      'delta',
    ])
  })

  it('like is a case-insensitive substring match that escapes wildcards', async () => {
    expect(await titles({ title: { like: 'ALP' } })).toEqual(['Alpha'])
    expect(await titles({ title: { like: '100%' } })).toEqual(['Gamma 100%'])
    expect(await titles({ title: { like: '_' } })).toEqual([])
  })

  it('exists', async () => {
    expect(await titles({ author: { exists: true } })).toEqual(['Beta'])
    expect(await titles({ author: { exists: false } })).toHaveLength(3)
  })

  it('booleans, selects, status and system fields', async () => {
    expect(await titles({ featured: { equals: true } })).toEqual(['Alpha'])
    expect(await titles({ kind: { equals: 'news' } })).toEqual(['Alpha'])
    expect(await titles({ status: { equals: 'published' } })).toEqual(['delta'])
    expect(await titles({ id: { equals: String(ids.Beta) } })).toEqual(['Beta'])
    expect(await titles({ author: { equals: String(ids.author) } })).toEqual(['Beta'])
  })

  it('and / or', async () => {
    expect(
      await titles({ or: [{ views: { equals: 10 } }, { title: { equals: 'delta' } }] }),
    ).toEqual(['Alpha', 'delta'])
    expect(
      await titles({
        and: [{ views: { gte: 10 } }, { views: { lte: 20 } }],
        featured: { equals: false },
      }),
    ).toEqual(['Beta'])
  })
})

describe('nested paths', () => {
  it('group fields', async () => {
    expect(await titles({ 'seo.title': { equals: 'first' } })).toEqual(['Alpha'])
  })

  it('hasMany values', async () => {
    expect(await titles({ tags: { equals: 'a' } })).toEqual(['Alpha', 'Beta'])
    expect(await titles({ tags: { in: ['b', 'c'] } })).toEqual(['Beta'])
    expect(await titles({ tags: { not_equals: 'a' } })).toEqual(['Gamma 100%', 'delta'])
    expect(await titles({ tags: { exists: false } })).toEqual(['Gamma 100%', 'delta'])
  })

  it('array row fields, including values inside rows', async () => {
    expect(await titles({ 'links.url': { like: 'a.test' } })).toEqual(['Alpha'])
    expect(await titles({ 'links.tags': { equals: 'y' } })).toEqual(['Gamma 100%'])
    expect(await titles({ links: { exists: true } })).toEqual(['Alpha', 'Gamma 100%'])
  })

  it('rejects paths that cannot be queried', async () => {
    const bad: Where[] = [
      { nope: { equals: 1 } },
      { body: { equals: 1 } },
      { 'author.name': { equals: 'Ann' } },
      { seo: { equals: 1 } },
      { links: { equals: 1 } },
      { title: { contains: 'x' } as never },
      { title: 'x' as never },
    ]
    for (const where of bad) {
      await expect(
        cms.find('posts', { draft: true, where }),
        JSON.stringify(where),
      ).rejects.toThrow(QueryError)
    }
  })
})

describe('sort and pagination', () => {
  it('sorts ascending and descending, newest first by default', async () => {
    expect(
      (await cms.find('posts', { draft: true, sort: '-views', limit: 2 })).docs.map((d) => d.title),
    ).toEqual(['Gamma 100%', 'Beta'])
    expect((await cms.find('posts', { draft: true, limit: 1 })).docs[0]?.title).toBe('delta')
    expect(
      (await cms.find('posts', { draft: true, sort: 'seo.title', limit: 0 })).docs,
    ).toHaveLength(4)
    await expect(cms.find('posts', { draft: true, sort: 'links' })).rejects.toThrow(QueryError)
  })

  it('paginates', async () => {
    const page2 = await cms.find('posts', { draft: true, sort: 'title', limit: 3, page: 2 })
    expect(page2).toMatchObject({
      totalDocs: 4,
      limit: 3,
      page: 2,
      totalPages: 2,
      hasNextPage: false,
      hasPrevPage: true,
    })
    expect(page2.docs.map((d) => d.title)).toEqual(['delta'])

    const all = await cms.find('posts', { draft: true, limit: 0 })
    expect(all).toMatchObject({ totalDocs: 4, totalPages: 1, hasNextPage: false })
    expect(await cms.count('posts', { where: { views: { gt: 15 } }, draft: true })).toBe(2)
  })

  it('validates limit and page', async () => {
    await expect(cms.find('posts', { draft: true, limit: -1 })).rejects.toThrow(QueryError)
    await expect(cms.find('posts', { page: 0 })).rejects.toThrow(QueryError)
  })
})
