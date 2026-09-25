import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { cookieHeader, fixture, freshDatabase } from './helpers.js'

freshDatabase()
await setup({ rootDir: fixture, dev: true, setupTimeout: 180_000 })

describe('@easy-cms/nuxt in dev (FR-ADP-01)', () => {
  it('pushes the schema and exposes the Local API to server routes', async () => {
    await $fetch('/api/seed', { method: 'POST' })
    expect(await $fetch('/api/titles')).toEqual(['Hello Nuxt'])
  })

  it('renders Local API data during SSR', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('<li>Hello Nuxt</li>')
    expect(html).not.toContain('Secret draft')
  })

  it('serves the REST API with access rules', async () => {
    const list = await $fetch<{ docs: { title: string }[] }>('/api/cms/posts')
    expect(list.docs.map((d) => d.title)).toEqual(['Hello Nuxt'])
    const missing = await fetch('/api/cms/nope')
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ errors: [{ message: 'Unknown collection "nope"' }] })
  })

  it('logs in over REST, and host routes can read the user', async () => {
    const login = await fetch('/api/cms/users/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'password123' }),
    })
    expect(login.status).toBe(200)
    const setCookie = login.headers.getSetCookie()
    expect(setCookie).toHaveLength(2)
    const cookie = cookieHeader(setCookie)
    const { csrfToken } = (await login.json()) as { csrfToken: string }

    expect(await $fetch('/api/whoami', { headers: { cookie } })).toEqual({
      email: 'admin@example.com',
    })
    expect(await $fetch('/api/whoami')).toEqual({ email: null })

    // Logged-in users see drafts when they ask for them.
    const published = await $fetch<{ totalDocs: number }>('/api/cms/posts', { headers: { cookie } })
    expect(published.totalDocs).toBe(1)
    const all = await $fetch<{ totalDocs: number }>('/api/cms/posts?draft=true', {
      headers: { cookie },
    })
    expect(all.totalDocs).toBe(2)

    // Writes with the cookie need the CSRF token.
    const withoutToken = await fetch('/api/cms/posts', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x' }),
    })
    expect(withoutToken.status).toBe(403)
    const created = await fetch('/api/cms/posts', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ title: 'Via REST', status: 'published' }),
    })
    expect(created.status).toBe(201)
    expect(await $fetch('/api/titles')).toEqual(['Hello Nuxt', 'Via REST'])
  })

  it('serves the admin UI with security headers, and its assets', async () => {
    const shell = await fetch('/admin/collections/posts')
    expect(shell.status).toBe(200)
    expect(shell.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    const html = await shell.text()
    expect(html).toContain('<base href="/admin/">')
    const script = /src="\.\/(assets\/[^"]+\.js)"/.exec(html)?.[1]
    expect(script).toBeDefined()
    const asset = await fetch(`/admin/${script}`)
    expect(asset.status).toBe(200)
    expect(asset.headers.get('content-type')).toContain('javascript')
    expect((await fetch('/admin/assets/missing.js')).status).toBe(404)
    // The bare path redirects to the trailing slash (Nitro's static handler may answer first with 301).
    const redirect = await fetch('/admin', { redirect: 'manual' })
    expect([301, 308]).toContain(redirect.status)
    expect(redirect.headers.get('location')).toMatch(/\/admin\/$/)
  })
})
