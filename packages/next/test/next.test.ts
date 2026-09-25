import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { afterAll, describe, expect, it } from 'vitest'
import { SERVER_EXTERNAL_PACKAGES, withEasyCMS } from '../src/config.js'
import { createAdminRouteHandlers, createRouteHandlers, getEasyCMS } from '../src/index.js'

/** Temp cleanup: Windows may still hold SQLite files for a moment after close; retry, then give up quietly. */
function removeTemp(path: string) {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch {
    // leave it to the OS temp cleaner
  }
}

const dir = mkdtempSync(join(tmpdir(), 'easy-cms-next-'))
afterAll(() => removeTemp(dir))

const config = defineConfig({
  secret: 's'.repeat(32),
  db: sqlite({ url: `file:${join(dir, 'cms.db')}` }),
  collections: [
    { slug: 'notes', access: { read: () => true }, fields: [{ name: 'text', type: 'text' }] },
  ],
})

describe('getEasyCMS', () => {
  it('returns one typed instance per config', async () => {
    const a = await getEasyCMS(config)
    const b = await getEasyCMS(config)
    expect(a).toBe(b)
    const note = await a.create('notes', { text: 'hi' })
    expect(note.text).toBe('hi')
  })
})

describe('createRouteHandlers', () => {
  it('serves the REST API for every method', async () => {
    const handlers = createRouteHandlers(config)
    expect(Object.keys(handlers).sort()).toEqual([
      'DELETE',
      'GET',
      'HEAD',
      'OPTIONS',
      'PATCH',
      'POST',
      'PUT',
    ])
    const res = await handlers.GET(new Request('http://x.test/api/cms/notes'))
    expect(res.status).toBe(200)
    expect(((await res.json()) as { docs: unknown[] }).docs).toHaveLength(1)
  })
})

describe('createAdminRouteHandlers', () => {
  it('serves the admin shell at the bare path without redirecting', async () => {
    const { GET } = createAdminRouteHandlers(config)
    const res = await GET(new Request('http://x.test/admin'))
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<base href="/admin/">')
  })
})

describe('withEasyCMS', () => {
  it('adds server externals and tracing includes, keeping the user config', async () => {
    const make = withEasyCMS({ reactStrictMode: true, serverExternalPackages: ['mine'] })
    const result = await make('phase-production-build', { defaultConfig: {} })
    expect(result.reactStrictMode).toBe(true)
    expect(result.serverExternalPackages).toEqual(
      expect.arrayContaining(['mine', ...SERVER_EXTERNAL_PACKAGES]),
    )
    expect(result.outputFileTracingIncludes?.['/**']).toContain('easy-cms/migrations/**')
  })

  it('accepts a config function', async () => {
    const make = withEasyCMS(async (phase) => ({ env: { PHASE: phase } }))
    const result = await make('phase-development-server', { defaultConfig: {} })
    expect(result.env).toEqual({ PHASE: 'phase-development-server' })
  })
})
