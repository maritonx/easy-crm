import { describe, expect, it } from 'vitest'
import { s3Storage } from '../src/index.js'

interface Call {
  method: string
  url: string
  headers: Headers
  body: Uint8Array | null
}

/** A fetch that records requests and answers from a script. */
function fakeFetch(answer: (call: Call) => Response = () => new Response(null, { status: 200 })) {
  const calls: Call[] = []
  const fetch = (async (input: Request | string | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const body = request.body ? new Uint8Array(await request.arrayBuffer()) : null
    const call = { method: request.method, url: request.url, headers: request.headers, body }
    calls.push(call)
    return answer(call)
  }) as typeof globalThis.fetch
  return { fetch, calls }
}

const credentials = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret' }

describe('s3Storage', () => {
  it('uses virtual-hosted URLs on AWS and signs requests', async () => {
    const { fetch, calls } = fakeFetch()
    const storage = s3Storage({ bucket: 'site', region: 'eu-central-1', ...credentials, fetch })
    await storage.init?.({ cwd: '/' })
    await storage.put('photo-1a2b.png', new Uint8Array([1, 2, 3]), { contentType: 'image/png' })

    const [put] = calls
    expect(put?.method).toBe('PUT')
    expect(put?.url).toBe('https://site.s3.eu-central-1.amazonaws.com/photo-1a2b.png')
    expect(put?.headers.get('content-type')).toBe('image/png')
    expect(put?.headers.get('authorization')).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/eu-central-1\/s3\/aws4_request/,
    )
    expect([...(put?.body ?? [])]).toEqual([1, 2, 3])
  })

  it('uses path-style URLs with a custom endpoint, a prefix and encoded keys', async () => {
    const { fetch, calls } = fakeFetch()
    const storage = s3Storage({
      bucket: 'site',
      endpoint: 'http://localhost:9000/',
      prefix: '/media/',
      ...credentials,
      fetch,
    })
    await storage.init?.({ cwd: '/' })
    await storage.delete('ภาพ-1a2b.png')
    expect(calls[0]?.url).toBe(
      `http://localhost:9000/site/media/${encodeURIComponent('ภาพ-1a2b.png')}`,
    )
    expect(calls[0]?.method).toBe('DELETE')
  })

  it('returns null for missing objects and the bytes for existing ones', async () => {
    const { fetch } = fakeFetch(({ url }) =>
      url.endsWith('/missing.png')
        ? new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 })
        : new Response(new Uint8Array([7, 8])),
    )
    const storage = s3Storage({
      bucket: 'b',
      region: 'auto',
      endpoint: 'https://r2.test',
      ...credentials,
      fetch,
    })
    await storage.init?.({ cwd: '/' })
    expect(await storage.get('missing.png')).toBeNull()
    expect(await storage.get('found.png')).toEqual({ body: new Uint8Array([7, 8]), size: 2 })
  })

  it('reports S3 errors with their code and message', async () => {
    const { fetch } = fakeFetch(
      () =>
        new Response('<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>', {
          status: 403,
        }),
    )
    const storage = s3Storage({ bucket: 'b', ...credentials, fetch })
    await storage.init?.({ cwd: '/' })
    await expect(
      storage.put('a.png', new Uint8Array(1), { contentType: 'image/png' }),
    ).rejects.toThrow('S3 PUT a.png failed (403): AccessDenied: Access Denied')
  })

  it('serves through the API unless publicUrl is set', () => {
    expect(s3Storage({ bucket: 'b' }).url?.('a.png')).toBeUndefined()
    const storage = s3Storage({ bucket: 'b', prefix: 'media', publicUrl: 'https://cdn.test/' })
    expect(storage.url?.('ภาพ.png')).toBe(`https://cdn.test/media/${encodeURIComponent('ภาพ.png')}`)
  })

  it('reads credentials at init, from options or AWS_* variables', async () => {
    const saved = { ...process.env }
    try {
      delete process.env.AWS_ACCESS_KEY_ID
      delete process.env.AWS_SECRET_ACCESS_KEY
      // Creating the adapter never throws, so builds work without credentials.
      const storage = s3Storage({ bucket: 'b' })
      expect(() => storage.init?.({ cwd: '/' })).toThrow(/accessKeyId.*AWS_ACCESS_KEY_ID/)

      process.env.AWS_ACCESS_KEY_ID = 'from-env'
      process.env.AWS_SECRET_ACCESS_KEY = 'secret'
      process.env.AWS_REGION = 'ap-southeast-1'
      const { fetch, calls } = fakeFetch()
      const fromEnv = s3Storage({ bucket: 'b', fetch })
      await fromEnv.init?.({ cwd: '/' })
      await fromEnv.delete('a.png')
      expect(calls[0]?.url).toBe('https://b.s3.ap-southeast-1.amazonaws.com/a.png')
      expect(calls[0]?.headers.get('authorization')).toContain('Credential=from-env/')
    } finally {
      process.env = saved
    }
  })
})
