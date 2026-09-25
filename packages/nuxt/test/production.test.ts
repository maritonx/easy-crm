import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { createEasyCMS, silentLogger } from '@easy-cms/core'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'
import { fixture, freshDatabase } from './helpers.js'

/** Temp cleanup: Windows may still hold SQLite files for a moment after close; retry, then give up quietly. */
function removeTemp(path: string) {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch {
    // leave it to the OS temp cleaner
  }
}

// Like a deploy: create and apply a migration, then build and start the server from the project root.
freshDatabase()
const migrations = join(fixture, 'easy-cms')
removeTemp(migrations)
// Imported after the env var is set, since the config reads it.
const { default: config } = await import('./fixtures/basic/easy-cms.config.js')
const tool = await createEasyCMS(config, { cwd: fixture, schema: 'skip', logger: silentLogger })
await tool.db.createMigration({ name: 'init' })
await tool.db.migrate()
await tool.create('posts', { title: 'Built', status: 'published' })
await tool.destroy()

// The server resolves migrations from its working directory, which it inherits from us.
const previousCwd = process.cwd()
process.chdir(fixture)
await setup({ rootDir: fixture, env: { NODE_ENV: 'production' }, setupTimeout: 300_000 })

afterAll(() => {
  process.chdir(previousCwd)
  removeTemp(migrations)
})

describe('@easy-cms/nuxt production build', () => {
  it('ships the native database driver and verifies migrations at startup', async () => {
    expect(await $fetch('/api/titles')).toEqual(['Built'])
  })

  it('serves the REST API', async () => {
    const rest = await fetch('/api/cms/posts')
    expect(rest.status).toBe(200)
    expect(((await rest.json()) as { docs: { title: string }[] }).docs[0]?.title).toBe('Built')
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
