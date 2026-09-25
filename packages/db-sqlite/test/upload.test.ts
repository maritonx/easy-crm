import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  createRestHandler,
  defineConfig,
  PayloadTooLargeError,
  ValidationError,
} from '@easy-cms/core'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

const config = defineConfig({
  secret: SECRET,
  db: db(),
  upload: {
    maxFileSize: 200_000,
    imageSizes: [
      { name: 'thumbnail', width: 32, height: 32 },
      { name: 'card', width: 100 },
    ],
  },
  collections: [
    {
      slug: 'posts',
      access: { read: () => true },
      fields: [
        { name: 'title', type: 'text' },
        { name: 'cover', type: 'upload' },
      ],
    },
  ],
})

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#2f6f5e' } })
    .png()
    .toBuffer()
    .then((b) => new Uint8Array(b))

const uploadsIn = (cwd: string) =>
  existsSync(join(cwd, 'uploads')) ? readdirSync(join(cwd, 'uploads')).sort() : []

describe('cms.upload (FR-UPL)', () => {
  it('stores the file, detects type and size, and makes resized copies', async () => {
    const cms = await open(config)
    const media = await cms.upload(
      { data: await png(200, 120), name: 'Hello World!.PNG' },
      { alt: 'Green' },
    )
    expect(media).toMatchObject({
      originalName: 'Hello World!.PNG',
      mimeType: 'image/png',
      width: 200,
      height: 120,
      alt: 'Green',
      filename: expect.stringMatching(/^hello-world-[0-9a-f]{8}\.png$/),
      url: expect.stringMatching(/^\/api\/cms\/media\/file\/hello-world-[0-9a-f]{8}\.png$/),
    })
    const sizes = media.sizes as Record<string, { width: number; height: number; url: string }>
    expect(sizes.thumbnail).toMatchObject({
      width: 32,
      height: 32,
      url: expect.stringContaining('-thumbnail.png'),
    })
    expect(sizes.card).toMatchObject({ width: 100, height: 60 })
    expect(uploadsIn(cms.cwd)).toHaveLength(3)
    await cms.destroy()
  })

  it('detects the type from the contents, not the name (FR-UPL-03)', async () => {
    const cms = await open(config)
    const disguised = new TextEncoder().encode('<html><script>alert(1)</script></html>')
    await expect(cms.upload({ data: disguised, name: 'photo.png' })).rejects.toMatchObject({
      errors: [{ field: 'file', message: expect.stringContaining('text/plain is not allowed') }],
    })
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
    )
    expect((await cms.upload({ data: svg, name: 'icon.txt' })).filename).toMatch(/\.svg$/)
    await cms.destroy()
  })

  it('rejects files that are too large (FR-UPL-04) or empty', async () => {
    const cms = await open(config)
    await expect(cms.upload({ data: new Uint8Array(200_001), name: 'big.png' })).rejects.toThrow(
      PayloadTooLargeError,
    )
    await expect(cms.upload({ data: new Uint8Array(0), name: 'empty.png' })).rejects.toThrow(
      ValidationError,
    )
    expect(uploadsIn(cms.cwd)).toEqual([])
    await cms.destroy()
  })

  it('makes unique, safe file names (FR-UPL-05)', async () => {
    const cms = await open(config)
    const data = await png(4, 4)
    const a = await cms.upload({ data, name: '../../etc/passwd.png' })
    const b = await cms.upload({ data, name: '../../etc/passwd.png' })
    expect(a.filename).toMatch(/^passwd-[0-9a-f]{8}\.png$/)
    expect(a.filename).not.toBe(b.filename)
    const thai = await cms.upload({ data, name: 'รูปภาพ สวย.png' })
    expect(thai.filename).toMatch(/^รูปภาพ-สวย-[0-9a-f]{8}\.png$/)
    await cms.destroy()
  })

  it('links uploads to documents and populates them with URLs', async () => {
    const cms = await open(config)
    const media = await cms.upload({ data: await png(10, 10), name: 'cover.png' })
    const post = await cms.create('posts', { title: 'P', cover: media.id })
    expect(post.cover).toMatchObject({
      id: media.id,
      url: expect.stringContaining('/media/file/cover-'),
    })
    await expect(cms.create('posts', { title: 'Bad', cover: 999 })).rejects.toMatchObject({
      errors: [{ field: 'cover', message: 'media 999 does not exist' }],
    })
    await cms.destroy()
  })

  it('deletes the files with the document', async () => {
    const cms = await open(config)
    const media = await cms.upload({ data: await png(50, 50), name: 'gone.png' })
    expect(uploadsIn(cms.cwd)).toHaveLength(3)
    await cms.delete('media', media.id)
    expect(uploadsIn(cms.cwd)).toEqual([])
    await cms.destroy()
  })

  it('only lets alt text change afterwards, and refuses create() without a file', async () => {
    const cms = await open(config)
    const admin = await cms.create('users', {
      email: 'a@b.co',
      password: 'password123',
      role: 'admin',
    })
    const media = await cms.upload({ data: await png(4, 4), name: 'a.png' })
    const updated = await cms.update(
      'media',
      media.id,
      { alt: 'New alt', filename: 'evil.png' },
      {
        overrideAccess: false,
        user: admin as never,
      },
    )
    expect(updated).toMatchObject({ alt: 'New alt', filename: media.filename })
    await expect(cms.create('media', { filename: 'x.png' } as never)).rejects.toThrow(
      ValidationError,
    )
    await cms.destroy()
  })

  it('uses serverURL for absolute URLs', async () => {
    const cms = await open({ ...config, serverURL: 'https://cms.example.com/' })
    const media = await cms.upload({ data: await png(4, 4), name: 'a.png' })
    expect(media.url).toMatch(/^https:\/\/cms\.example\.com\/api\/cms\/media\/file\//)
    await cms.destroy()
  })
})

describe('REST uploads and files', () => {
  async function setup() {
    const cms = await open(config)
    await cms.create('users', { email: 'a@b.co', password: 'password123', role: 'admin' })
    const { token } = await cms.auth.login({ email: 'a@b.co', password: 'password123' })
    const handler = createRestHandler(cms)
    const upload = (form: FormData, auth = true) =>
      handler(
        new Request('http://cms.test/api/cms/media', {
          method: 'POST',
          headers: auth ? { authorization: `Bearer ${token}` } : {},
          body: form,
        }),
      )
    return { cms, handler, upload }
  }

  it('uploads multipart files and serves them with safe headers', async () => {
    const { cms, handler, upload } = await setup()
    const form = new FormData()
    form.set('file', new Blob([await png(20, 10)], { type: 'image/png' }), 'photo.png')
    form.set('alt', 'A photo')
    const res = await upload(form)
    expect(res.status).toBe(201)
    const media = (await res.json()) as { url: string; alt: string; width: number }
    expect(media).toMatchObject({ alt: 'A photo', width: 20 })

    const file = await handler(new Request(`http://cms.test${media.url}`))
    expect(file.status).toBe(200)
    expect(file.headers.get('content-type')).toBe('image/png')
    expect(file.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(file.headers.get('content-security-policy')).toContain('sandbox')
    expect(file.headers.get('x-content-type-options')).toBe('nosniff')
    expect((await file.arrayBuffer()).byteLength).toBeGreaterThan(0)

    expect(
      (await handler(new Request('http://cms.test/api/cms/media/file/missing-00000000.png')))
        .status,
    ).toBe(404)
    expect(
      (await handler(new Request('http://cms.test/api/cms/media/file/..%2F..%2Fcms.db'))).status,
    ).toBe(404)
    await cms.destroy()
  })

  it('checks access, content type and size', async () => {
    const { cms, handler, upload } = await setup()
    const form = new FormData()
    form.set('file', new Blob([await png(4, 4)]), 'a.png')
    expect((await upload(form, false)).status).toBe(401)

    const json = await handler(
      new Request('http://cms.test/api/cms/media', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    )
    expect(json.status).toBe(415)

    const big = new FormData()
    big.set('file', new Blob([new Uint8Array(300_000)]), 'big.png')
    expect((await upload(big)).status).toBe(413)

    const noFile = new FormData()
    noFile.set('alt', 'x')
    expect((await upload(noFile)).status).toBe(400)
    await cms.destroy()
  })
})
