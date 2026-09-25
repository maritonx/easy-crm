import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Config, ConfigError, createEasyCMS, SchemaError, silentLogger } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { sqlite } from '../src/index.js'
import { db, open, rawClient, SECRET, tables, tempProject } from './helpers.js'

const withPosts = (
  fields: Config['collections'] extends readonly (infer C)[] | undefined
    ? C extends { fields: infer F }
      ? F
      : never
    : never,
): Config => ({
  secret: SECRET,
  db: db(),
  collections: [{ slug: 'posts', fields }],
})

async function columns(cwd: string, table: string): Promise<string[]> {
  const client = rawClient(cwd)
  const { rows } = await client.execute(`PRAGMA table_info(${table})`)
  client.close()
  return rows.map((r) => String(r.name))
}

describe('development push (FR-DAT-02)', () => {
  it('creates prefixed tables for collections, children and globals', async () => {
    const cms = await open(
      withPosts([
        { name: 'title', type: 'text' },
        { name: 'tags', type: 'select', options: ['a'], hasMany: true },
        { name: 'rows', type: 'array', fields: [{ name: 'x', type: 'text' }] },
        { name: 'seo', type: 'group', fields: [{ name: 'metaTitle', type: 'text' }] },
      ]),
    )
    await cms.destroy()
    expect(await tables(cms.cwd)).toEqual([
      'ecms_globals',
      'ecms_login_attempts',
      'ecms_migrations',
      'ecms_posts',
      'ecms_posts__rows',
      'ecms_posts__tags',
      'ecms_sessions',
      'ecms_users',
    ])
    expect(await columns(cms.cwd, 'ecms_posts')).toEqual([
      'id',
      'created_at',
      'updated_at',
      'title',
      'seo_meta_title',
    ])
  })

  it('adds and removes columns when the config changes, keeping data', async () => {
    const cwd = tempProject()
    const v1 = await open(
      withPosts([
        { name: 'title', type: 'text' },
        { name: 'old', type: 'text' },
      ]),
      cwd,
    )
    const post = await v1.create('posts', { title: 'kept', old: 'x' })
    await v1.destroy()

    const v2 = await open(
      withPosts([
        { name: 'title', type: 'text' },
        { name: 'fresh', type: 'number' },
      ]),
      cwd,
    )
    expect(await v2.findById('posts', post.id)).toMatchObject({ title: 'kept', fresh: null })
    await v2.destroy()
    expect(await columns(cwd, 'ecms_posts')).toEqual([
      'id',
      'created_at',
      'updated_at',
      'title',
      'fresh',
    ])
  })

  it('treats a renamed field as drop + add without prompting', async () => {
    const cwd = tempProject()
    await (await open(withPosts([{ name: 'title', type: 'text' }]), cwd)).destroy()
    const cms = await open(withPosts([{ name: 'headline', type: 'text' }]), cwd)
    await cms.destroy()
    expect(await columns(cwd, 'ecms_posts')).toEqual(['id', 'created_at', 'updated_at', 'headline'])
  })

  it('never touches tables it does not own (FR-DAT-04)', async () => {
    const cwd = tempProject()
    const client = rawClient(cwd)
    await client.execute('CREATE TABLE posts (id integer primary key, body text)')
    await client.execute('CREATE TABLE users (id integer primary key, email text)')
    await client.execute("INSERT INTO users (email) VALUES ('host@app.test')")
    client.close()

    await (await open(withPosts([{ name: 'title', type: 'text' }]), cwd)).destroy()
    await (await open(withPosts([{ name: 'other', type: 'text' }]), cwd)).destroy()

    expect(await tables(cwd)).toEqual([
      'ecms_globals',
      'ecms_login_attempts',
      'ecms_migrations',
      'ecms_posts',
      'ecms_sessions',
      'ecms_users',
      'posts',
      'users',
    ])
    const check = rawClient(cwd)
    expect((await check.execute('SELECT email FROM users')).rows[0]?.email).toBe('host@app.test')
    check.close()
  })

  it('uses a custom table prefix', async () => {
    const cms = await open({
      ...withPosts([{ name: 'title', type: 'text' }]),
      db: sqlite({ url: 'file:./cms.db', tablePrefix: 'cms_' }),
    })
    await cms.destroy()
    expect(await tables(cms.cwd)).toEqual([
      'cms_globals',
      'cms_login_attempts',
      'cms_migrations',
      'cms_posts',
      'cms_sessions',
      'cms_users',
    ])
  })

  it('reports column name clashes as config errors', async () => {
    await expect(
      open(
        withPosts([
          { name: 'seo_title', type: 'text' },
          { name: 'seo', type: 'group', fields: [{ name: 'title', type: 'text' }] },
        ]),
      ),
    ).rejects.toThrow(ConfigError)
  })
})

describe('migration files (FR-INS-06/07, FR-DAT-03)', () => {
  const v1 = withPosts([{ name: 'title', type: 'text' }])
  const v2 = withPosts([
    { name: 'title', type: 'text' },
    { name: 'views', type: 'number' },
  ])

  async function cli(config: Config, cwd: string) {
    return createEasyCMS(config, { cwd, schema: 'skip', logger: silentLogger })
  }

  it('creates, applies and reports migrations', async () => {
    const cwd = tempProject()
    const tool = await cli(v1, cwd)
    const first = await tool.db.createMigration({ name: 'Init Schema' })
    expect(first?.name).toMatch(/^\d{14}_init_schema$/)
    expect(first?.statements.join('\n')).toContain('CREATE TABLE `ecms_posts`')
    expect(await tool.db.createMigration({ name: 'again' })).toBeNull()

    expect(await tool.db.migrationStatus()).toEqual([{ name: first?.name, applied: false }])
    expect(await tool.db.migrate()).toEqual([first?.name])
    expect(await tool.db.migrate()).toEqual([])
    expect(await tool.db.migrationStatus()).toEqual([{ name: first?.name, applied: true }])
    await tool.destroy()

    const files = readdirSync(join(cwd, 'easy-cms/migrations')).sort()
    expect(files).toEqual([`${first?.name}.json`, `${first?.name}.sql`])

    // production start succeeds once everything is applied
    const prod = await open(v1, cwd, 'verify')
    await prod.create('posts', { title: 'ok' })
    await prod.destroy()
  })

  it('refuses to start in production without migrations', async () => {
    await expect(open(v1, tempProject(), 'verify')).rejects.toThrow(/No migrations found/)
  })

  it('refuses to start with pending migrations', async () => {
    const cwd = tempProject()
    const tool = await cli(v1, cwd)
    await tool.db.createMigration({ name: 'init' })
    await tool.destroy()
    await expect(open(v1, cwd, 'verify')).rejects.toThrow(/1 pending migration.*easy-cms migrate/s)
  })

  it('refuses to start when the config changed without a migration', async () => {
    const cwd = tempProject()
    const tool = await cli(v1, cwd)
    await tool.db.createMigration({ name: 'init' })
    await tool.db.migrate()
    await tool.destroy()
    const error = await open(v2, cwd, 'verify').catch((e) => e)
    expect(error).toBeInstanceOf(SchemaError)
    expect(error.message).toContain('migrate:create')
  })

  it('generates incremental migrations', async () => {
    const cwd = tempProject()
    const t1 = await cli(v1, cwd)
    await t1.db.createMigration({ name: 'init' })
    await t1.db.migrate()
    await t1.destroy()

    await new Promise((r) => setTimeout(r, 1100)) // names are timestamped to the second
    const t2 = await cli(v2, cwd)
    const second = await t2.db.createMigration({ name: 'add views' })
    expect(second?.statements).toEqual(['ALTER TABLE `ecms_posts` ADD `views` real;'])
    expect(await t2.db.migrate()).toEqual([second?.name])
    await t2.destroy()

    const prod = await open(v2, cwd, 'verify')
    await prod.destroy()
  })

  it('rolls back a failing migration and does not record it (NFR-REL-02)', async () => {
    const cwd = tempProject()
    const tool = await cli(v1, cwd)
    const created = await tool.db.createMigration({ name: 'init' })
    const file = created?.file as string
    writeFileSync(
      file,
      `${readFileSync(file, 'utf8')}\n--> statement-breakpoint\nTHIS IS NOT SQL;\n`,
    )

    await expect(tool.db.migrate()).rejects.toThrow(/failed and was rolled back/)
    expect(await tool.db.migrationStatus()).toEqual([{ name: created?.name, applied: false }])
    await tool.destroy()
    expect(await tables(cwd)).toEqual(['ecms_migrations'])
  })

  it('will not apply migrations on top of a dev-pushed database', async () => {
    const cwd = tempProject()
    await (await open(v1, cwd)).destroy()
    const tool = await cli(v1, cwd)
    await tool.db.createMigration({ name: 'init' })
    await expect(tool.db.migrate()).rejects.toThrow(/development schema push/)
    await tool.destroy()
  })
})
