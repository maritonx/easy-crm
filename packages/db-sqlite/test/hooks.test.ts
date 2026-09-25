import { defineConfig, silentLogger } from '@easy-cms/core'
import { describe, expect, it, vi } from 'vitest'
import { db, open, SECRET } from './helpers.js'

function config(calls: string[], extra: { failAfterChange?: boolean } = {}) {
  return defineConfig({
    secret: SECRET,
    db: db(),
    collections: [
      {
        slug: 'posts',
        fields: [
          { name: 'title', type: 'text', required: true },
          { name: 'wordCount', type: 'number' },
          { name: 'secret', type: 'text' },
        ],
        hooks: {
          beforeValidate: [
            ({ data, operation }) => {
              calls.push(`beforeValidate:${operation}`)
              // Normalize input before validation.
              return typeof data.title === 'string'
                ? { ...data, title: data.title.trim() }
                : undefined
            },
          ],
          beforeChange: [
            ({ data, operation, originalDoc }) => {
              calls.push(`beforeChange:${operation}:${originalDoc ? 'with-original' : 'new'}`)
              if (data.title === 'forbidden') throw new Error('Title not allowed')
              return { ...data, wordCount: String(data.title).split(/\s+/).length }
            },
            async () => {
              calls.push('beforeChange:second')
              return undefined // keeps data
            },
          ],
          afterChange: [
            ({ doc, operation, previousDoc, cms, user }) => {
              calls.push(
                `afterChange:${operation}:${doc.title}:${previousDoc?.title ?? '-'}:${cms ? 'cms' : ''}:${user?.email ?? 'none'}`,
              )
              if (extra.failAfterChange) throw new Error('webhook down')
            },
          ],
          beforeDelete: [
            ({ id }) => {
              calls.push(`beforeDelete:${id}`)
            },
          ],
          afterDelete: [({ id, doc }) => void calls.push(`afterDelete:${id}:${doc.title}`)],
          afterRead: [
            ({ doc }) => {
              const { secret: _hidden, ...rest } = doc
              return { ...rest, readAt: 'now' }
            },
          ],
        },
      },
    ],
    globals: [
      {
        slug: 'site',
        fields: [{ name: 'name', type: 'text' }],
        hooks: {
          beforeChange: [({ data }) => ({ ...data, name: String(data.name ?? '').toUpperCase() })],
          afterChange: [({ doc }) => void calls.push(`global:afterChange:${doc.name}`)],
          afterRead: [({ doc }) => ({ ...doc, greeting: `Hello ${doc.name}` })],
        },
      },
    ],
  })
}

describe('collection hooks (FR-HOOK-01..04)', () => {
  it('run in order around create, update, read and delete', async () => {
    const calls: string[] = []
    const cms = await open(config(calls))
    const post = await cms.create('posts', { title: '  Hello big world  ', secret: 's' })
    expect(post).toMatchObject({ title: 'Hello big world', wordCount: 3, readAt: 'now' })
    expect(post).not.toHaveProperty('secret')

    await cms.update('posts', post.id, { title: 'Short' })
    await cms.delete('posts', post.id)
    expect(calls).toEqual([
      'beforeValidate:create',
      'beforeChange:create:new',
      'beforeChange:second',
      'afterChange:create:Hello big world:-:cms:none',
      'beforeValidate:update',
      'beforeChange:update:with-original',
      'beforeChange:second',
      'afterChange:update:Short:Hello big world:cms:none',
      `beforeDelete:${post.id}`,
      `afterDelete:${post.id}:Short`,
    ])
    await cms.destroy()
  })

  it('cancel the operation when a before hook throws', async () => {
    const cms = await open(config([]))
    await expect(cms.create('posts', { title: 'forbidden' })).rejects.toThrow('Title not allowed')
    expect(await cms.count('posts')).toBe(0)
    await cms.destroy()
  })

  it('keep the change and log when an after hook throws (NFR-REL-03)', async () => {
    const errors: string[] = []
    const logger = { ...silentLogger, error: (m: string) => errors.push(m) }
    const cms = await open(config([], { failAfterChange: true }))
    ;(cms as unknown as { logger: typeof logger }).logger = logger
    const post = await cms.create('posts', { title: 'Saved anyway' })
    expect(await cms.findById('posts', post.id)).toMatchObject({ title: 'Saved anyway' })
    expect(errors).toEqual(['afterChange hook of "posts" failed: webhook down'])
    await cms.destroy()
  })

  it('pass the user and run afterRead on every read, including REST-style access', async () => {
    const calls: string[] = []
    const cms = await open(config(calls))
    const admin = await cms.create('users', {
      email: 'a@b.co',
      password: 'password123',
      role: 'admin',
    })
    await cms.create(
      'posts',
      { title: 'By admin' },
      { overrideAccess: false, user: admin as never },
    )
    expect(calls.at(-1)).toBe('afterChange:create:By admin:-:cms:a@b.co')
    const { docs } = await cms.find('posts', { overrideAccess: false, user: admin as never })
    expect(docs[0]).toMatchObject({ readAt: 'now' })
    await cms.destroy()
  })
})

describe('global hooks (FR-HOOK-05)', () => {
  it('run beforeChange, afterChange and afterRead', async () => {
    const calls: string[] = []
    const cms = await open(config(calls))
    const site = await cms.updateGlobal('site', { name: 'easy' })
    expect(site).toMatchObject({ name: 'EASY', greeting: 'Hello EASY' })
    expect(calls).toEqual(['global:afterChange:EASY'])
    expect(await cms.findGlobal('site')).toMatchObject({ greeting: 'Hello EASY' })
    await cms.destroy()
  })
})

describe('hook typing', () => {
  it('is checked', () => {
    // Compile-time only: hooks receive cms and slug.
    const fn = vi.fn()
    defineConfig({
      secret: SECRET,
      db: db(),
      collections: [
        {
          slug: 'x',
          fields: [],
          hooks: { afterChange: [({ cms, slug }) => fn(cms.config, slug)] },
        },
      ],
    })
  })
})
