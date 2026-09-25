import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { createEasyCMS, silentLogger } from '@easy-cms/core'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'
import { fixture, freshDatabase } from './helpers.js'

// Like a deploy: create and apply a migration, then build and start the server from the project root.
freshDatabase()
const migrations = join(fixture, 'easy-cms')
rmSync(migrations, { recursive: true, force: true })
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
  rmSync(migrations, { recursive: true, force: true })
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
})
