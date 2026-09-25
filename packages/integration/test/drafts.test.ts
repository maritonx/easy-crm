import { defineConfig } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

const config = defineConfig({
  secret: SECRET,
  db: db(),
  collections: [
    {
      slug: 'posts',
      drafts: true,
      access: { read: () => true },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'summary', type: 'text', required: true },
        { name: 'views', type: 'number' },
        { name: 'related', type: 'relationship', to: 'posts' },
      ],
    },
  ],
})

describe('drafts (FR-DRF)', () => {
  it('save incomplete drafts but still check types (FR-DRF-02)', async () => {
    const cms = await open(config)
    const draft = await cms.create('posts', { title: 'Only a title' } as never)
    expect(draft).toMatchObject({ status: 'draft', summary: null })
    await expect(cms.create('posts', { title: 'x', views: 'many' } as never)).rejects.toMatchObject(
      {
        errors: [{ field: 'views', message: 'must be a number' }],
      },
    )
    await cms.destroy()
  })

  it('validate everything when publishing (FR-DRF-03)', async () => {
    const cms = await open(config)
    const draft = await cms.create('posts', { title: 'T' } as never)
    await expect(cms.update('posts', draft.id, { status: 'published' })).rejects.toMatchObject({
      errors: [{ field: 'summary', message: 'is required' }],
    })
    const published = await cms.update('posts', draft.id, { status: 'published', summary: 'S' })
    expect(published.status).toBe('published')
    await cms.destroy()
  })

  it('return only published documents unless drafts are asked for (FR-DRF-04)', async () => {
    const cms = await open(config)
    const live = await cms.create('posts', { title: 'Live', summary: 's', status: 'published' })
    const draft = await cms.create('posts', { title: 'Draft', summary: 's', related: live.id })
    await cms.update('posts', live.id, { related: draft.id })

    expect((await cms.find('posts')).docs.map((d) => d.title)).toEqual(['Live'])
    expect((await cms.find('posts', { draft: true })).totalDocs).toBe(2)
    expect(await cms.count('posts')).toBe(1)
    expect(await cms.findById('posts', draft.id)).toBeNull()
    expect(await cms.findById('posts', draft.id, { draft: true })).toMatchObject({ title: 'Draft' })

    // Drafts are not populated into published content either.
    expect((await cms.findById('posts', live.id))?.related).toBeNull()
    expect((await cms.findById('posts', live.id, { draft: true }))?.related).toMatchObject({
      title: 'Draft',
    })

    // Writes always return the document, whatever its status.
    expect((await cms.update('posts', draft.id, { views: 1 })).title).toBe('Draft')
    await cms.destroy()
  })

  it('unpublish by switching back to draft (FR-DRF-05)', async () => {
    const cms = await open(config)
    const post = await cms.create('posts', { title: 'T', summary: 'S', status: 'published' })
    await cms.update('posts', post.id, { status: 'draft' })
    expect(await cms.find('posts')).toMatchObject({ totalDocs: 0 })
    await cms.destroy()
  })
})
