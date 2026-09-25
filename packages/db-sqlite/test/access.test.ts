import {
  type AuthUser,
  anyone,
  defineConfig,
  ForbiddenError,
  isAdmin,
  QueryError,
  UnauthorizedError,
} from '@easy-cms/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

const config = defineConfig({
  secret: SECRET,
  db: db(),
  collections: [
    {
      slug: 'posts',
      drafts: true,
      access: {
        // Anyone sees published posts; logged-in users see everything.
        read: ({ user }) => (user ? true : { status: { equals: 'published' } }),
        create: ({ user }) => user !== null,
        // Authors edit their own posts; admins edit all.
        update: ({ user }) =>
          user?.role === 'admin' ? true : user ? { author: { equals: user.id } } : false,
        delete: isAdmin,
      },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'author', type: 'relationship', to: 'users' },
        { name: 'secretRef', type: 'relationship', to: 'secrets' },
        { name: 'notes', type: 'text', access: { read: ({ user }) => user !== null } },
        {
          name: 'featured',
          type: 'boolean',
          access: { update: ({ user }) => user?.role === 'admin' },
        },
        {
          name: 'seo',
          type: 'group',
          fields: [{ name: 'internal', type: 'text', access: { read: () => false } }],
        },
      ],
    },
    // No access defined: logged-in users only (FR-ACL-03).
    { slug: 'pages', fields: [{ name: 'title', type: 'text' }] },
    { slug: 'secrets', access: { read: () => false }, fields: [{ name: 'code', type: 'text' }] },
    {
      slug: 'bad',
      access: { create: () => ({ id: { equals: 1 } }) },
      fields: [{ name: 'x', type: 'text' }],
    },
  ],
  globals: [
    {
      slug: 'site',
      access: { read: anyone, update: isAdmin },
      fields: [{ name: 'name', type: 'text' }],
    },
    { slug: 'private', fields: [{ name: 'key', type: 'text' }] },
  ],
})

type CMS = Awaited<ReturnType<typeof open<typeof config>>>
let cms: CMS
let admin: AuthUser
let editor: AuthUser
let editorPost: number
let adminDraft: number

const as = (user: AuthUser | null) => ({ overrideAccess: false, user }) as const

beforeAll(async () => {
  cms = await open(config)
  const password = 'password123'
  admin = (await cms.create('users', {
    email: 'admin@x.co',
    password,
    role: 'admin',
  })) as unknown as AuthUser
  editor = (await cms.create('users', {
    email: 'editor@x.co',
    password,
    role: 'editor',
  })) as unknown as AuthUser
  const secret = await cms.create('secrets', { code: 'hunter2' })
  editorPost = (
    await cms.create('posts', {
      title: 'Mine',
      author: editor.id,
      status: 'published',
      secretRef: secret.id,
      notes: 'n',
      seo: { internal: 'i' },
    })
  ).id as number
  adminDraft = (await cms.create('posts', { title: 'Draft', author: admin.id })).id as number
  return () => cms.destroy()
})

describe('Local API skips access by default (FR-LAPI-06)', () => {
  it('returns everything without a user', async () => {
    expect((await cms.find('posts')).totalDocs).toBe(2)
    expect(await cms.findById('secrets', 1)).toMatchObject({ code: 'hunter2' })
  })
})

describe('collection access (FR-ACL-01..03)', () => {
  it('denies anonymous users when no access is defined', async () => {
    await expect(cms.find('pages', as(null))).rejects.toThrow(UnauthorizedError)
    await expect(cms.find('pages', as(editor))).resolves.toMatchObject({ totalDocs: 0 })
  })

  it('filters reads with a where constraint', async () => {
    expect((await cms.find('posts', as(null))).docs.map((d) => d.title)).toEqual(['Mine'])
    expect(await cms.count('posts', as(null))).toBe(1)
    expect(await cms.findById('posts', adminDraft, as(null))).toBeNull()
    expect((await cms.find('posts', as(editor))).totalDocs).toBe(2)
  })

  it('checks document-level update access', async () => {
    await expect(
      cms.update('posts', editorPost, { title: 'Edited' }, as(editor)),
    ).resolves.toMatchObject({ title: 'Edited' })
    await expect(cms.update('posts', adminDraft, { title: 'Nope' }, as(editor))).rejects.toThrow(
      ForbiddenError,
    )
    await expect(cms.update('posts', adminDraft, { title: 'Nope' }, as(null))).rejects.toThrow(
      UnauthorizedError,
    )
    await expect(
      cms.update('posts', adminDraft, { title: 'Admin' }, as(admin)),
    ).resolves.toBeTruthy()
  })

  it('checks create and delete access', async () => {
    await expect(cms.create('posts', { title: 'x' }, as(null))).rejects.toThrow(UnauthorizedError)
    const post = await cms.create('posts', { title: 'Temp' }, as(editor))
    await expect(cms.delete('posts', post.id, as(editor))).rejects.toThrow(ForbiddenError)
    await expect(cms.delete('posts', post.id, as(admin))).resolves.toMatchObject({ title: 'Temp' })
  })

  it('requires create access to return a boolean', async () => {
    await expect(cms.create('bad', { x: 'y' }, as(admin))).rejects.toThrow(QueryError)
  })
})

describe('field access (FR-ACL-05)', () => {
  it('hides fields the user may not read, including inside groups', async () => {
    const anon = await cms.findById('posts', editorPost, as(null))
    expect(anon).not.toHaveProperty('notes')
    expect(anon?.seo).toEqual({})
    const logged = await cms.findById('posts', editorPost, as(editor))
    expect(logged).toMatchObject({ notes: 'n' })
    expect(logged?.seo).toEqual({})
  })

  it('ignores fields the user may not update', async () => {
    const updated = await cms.update(
      'posts',
      editorPost,
      { featured: true, title: 'Still mine' },
      as(editor),
    )
    expect(updated).toMatchObject({ title: 'Still mine', featured: null })
    expect((await cms.update('posts', editorPost, { featured: true }, as(admin))).featured).toBe(
      true,
    )
  })
})

describe('populated documents respect access', () => {
  it('does not populate documents the user may not read', async () => {
    const post = await cms.findById('posts', editorPost, as(editor))
    expect(post?.secretRef).toBeNull()
    expect(post?.author).toMatchObject({ email: 'editor@x.co' })
    const trusted = await cms.findById('posts', editorPost)
    expect(trusted?.secretRef).toMatchObject({ code: 'hunter2' })
  })
})

describe('built-in users access', () => {
  it('lets logged-in users read users but only admins create or delete them', async () => {
    await expect(cms.find('users', as(null))).rejects.toThrow(UnauthorizedError)
    expect((await cms.find('users', as(editor))).totalDocs).toBe(2)
    await expect(
      cms.create('users', { email: 'n@x.co', password: 'password123', role: 'editor' }, as(editor)),
    ).rejects.toThrow(ForbiddenError)
  })

  it('lets users edit themselves but not their role or active flag', async () => {
    const self = await cms.update(
      'users',
      editor.id,
      { name: 'Ed', role: 'admin', active: false },
      as(editor),
    )
    expect(self).toMatchObject({ name: 'Ed', role: 'editor', active: true })
    await expect(cms.update('users', admin.id, { name: 'Hacked' }, as(editor))).rejects.toThrow(
      ForbiddenError,
    )
  })
})

describe('global access', () => {
  it('uses read/update functions and defaults to logged-in only', async () => {
    await expect(cms.findGlobal('site', as(null))).resolves.toMatchObject({ name: null })
    await expect(cms.updateGlobal('site', { name: 'x' }, as(editor))).rejects.toThrow(
      ForbiddenError,
    )
    await expect(cms.updateGlobal('site', { name: 'x' }, as(admin))).resolves.toMatchObject({
      name: 'x',
    })
    await expect(cms.findGlobal('private', as(null))).rejects.toThrow(UnauthorizedError)
    await expect(cms.findGlobal('private', as(editor))).resolves.toBeTruthy()
  })
})
