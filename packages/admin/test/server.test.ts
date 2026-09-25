// @vitest-environment node
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createAdminHandler, renderShell } from '../server/index.js'

const appDir = fileURLToPath(new URL('./fixtures/app', import.meta.url))
const handler = createAdminHandler({
  appDir,
  basePath: '/cms',
  apiPath: '/api/content/',
  locale: 'th',
})
const get = (path: string, method = 'GET') =>
  handler(new Request(`http://x.test${path}`, { method }))

describe('createAdminHandler', () => {
  it('serves the shell with settings for every app route', async () => {
    for (const path of ['/cms/', '/cms/collections/posts', '/cms/collections/posts/12']) {
      const res = await get(path)
      expect(res.status, path).toBe(200)
      expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
      expect(res.headers.get('cache-control')).toBe('no-store')
      const html = await res.text()
      expect(html).toContain('<base href="/cms/">')
      expect(html).toContain(
        'content="{&quot;adminPath&quot;:&quot;/cms&quot;,&quot;apiPath&quot;:&quot;/api/content&quot;,&quot;locale&quot;:&quot;th&quot;}"',
      )
    }
  })

  it('redirects the bare base path to a trailing slash', async () => {
    const res = await get('/cms?x=1')
    expect(res.status).toBe(308)
    expect(res.headers.get('location')).toBe('/cms/?x=1')
  })

  it('serves hashed assets with long-lived caching', async () => {
    const res = await get('/cms/assets/app-abc123.js')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(await res.text()).toContain("console.log('app')")
    expect((await get('/cms/assets/missing.js')).status).toBe(404)
  })

  it('sends security headers (NFR-SEC-04)', async () => {
    const res = await get('/cms/')
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(res.headers.get('content-security-policy')).toContain("script-src 'self'")
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('referrer-policy')).toBe('same-origin')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('never serves files outside the app directory', async () => {
    for (const path of [
      '/cms/../secret.txt',
      '/cms/%2e%2e/secret.txt',
      '/cms/assets/..%2f..%2fsecret.txt',
      '/cms/%2e%2e%2fsecret.txt',
    ]) {
      const res = await get(path)
      expect(await res.text(), path).not.toContain('secret')
    }
    expect((await get('/cms/%E0%A4%A')).status).toBe(400)
  })

  it('does not serve the raw shell file', async () => {
    expect(await (await get('/cms/shell.html')).text()).toContain('<base href="/cms/">')
  })

  it('rejects other methods and paths', async () => {
    expect((await get('/cms/', 'POST')).status).toBe(405)
    expect((await get('/other')).status).toBe(404)
    expect((await get('/cms/', 'HEAD')).status).toBe(200)
  })
})

describe('renderShell', () => {
  it('escapes injected values', () => {
    const html = renderShell('<head></head>', { basePath: '/a"b' })
    expect(html).toContain('<base href="/a&quot;b/">')
  })
})

describe('without the trailing slash redirect', () => {
  it('serves the shell at the bare base path', async () => {
    const bare = createAdminHandler({ appDir, basePath: '/cms', trailingSlashRedirect: false })
    const res = await bare(new Request('http://x.test/cms'))
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<base href="/cms/">')
  })
})
