import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type Config,
  ConfigError,
  createEasyCMS,
  SchemaError,
  type SchemaMode,
  silentLogger,
} from '@easy-cms/core'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { postgres } from '../src/index.js'

const pg = new PGlite()
afterAll(() => pg.close())

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
let counter = 0

/** A project directory with its own table prefix in the shared PGlite database. */
function project() {
  const cwd = mkdtempSync(join(tmpdir(), 'easy-cms-pg-'))
  dirs.push(cwd)
  return { cwd, prefix: `m${counter++}_` }
}

type Fields = NonNullable<Config['collections']>[number]['fields']
const config = (prefix: string, fields: Fields): Config => ({
  secret: 'x'.repeat(32),
  db: postgres({ pglite: pg, tablePrefix: prefix }),
  collections: [{ slug: 'posts', fields }],
})

const open = (cfg: Config, cwd: string, schema: SchemaMode = 'push') =>
  createEasyCMS(cfg, { cwd, schema, logger: silentLogger })

async function tables(prefix: string) {
  const { rows } = await pg.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public' and tablename like '${prefix}%' order by tablename`,
  )
  return rows.map((r) => r.tablename.slice(prefix.length))
}

async function columns(table: string) {
  const { rows } = await pg.query<{ column_name: string; data_type: string }>(
    `select column_name, data_type from information_schema.columns where table_name = '${table}' order by ordinal_position`,
  )
  return Object.fromEntries(rows.map((r) => [r.column_name, r.data_type]))
}

describe('postgres development push', () => {
  it('creates tables with native types', async () => {
    const { cwd, prefix } = project()
    const cms = await open(
      config(prefix, [
        { name: 'title', type: 'text' },
        { name: 'views', type: 'number' },
        { name: 'featured', type: 'boolean' },
        { name: 'meta', type: 'json' },
        { name: 'tags', type: 'select', options: ['a'], hasMany: true },
      ]),
      cwd,
    )
    await cms.destroy()
    expect(await tables(prefix)).toEqual([
      'globals',
      'login_attempts',
      'media',
      'migrations',
      'posts',
      'posts__tags',
      'sessions',
      'users',
    ])
    expect(await columns(`${prefix}posts`)).toEqual({
      id: 'integer',
      created_at: 'text',
      updated_at: 'text',
      title: 'text',
      views: 'double precision',
      featured: 'boolean',
      meta: 'jsonb',
    })
  })

  it('adds and drops columns, keeping data, without prompting on renames', async () => {
    const { cwd, prefix } = project()
    const v1 = await open(
      config(prefix, [
        { name: 'title', type: 'text' },
        { name: 'old', type: 'text' },
      ]),
      cwd,
    )
    const post = await v1.create('posts', { title: 'kept', old: 'x' })
    await v1.destroy()
    const v2 = await open(
      config(prefix, [
        { name: 'title', type: 'text' },
        { name: 'renamed', type: 'number' },
      ]),
      cwd,
    )
    expect(await v2.findById('posts', post.id)).toMatchObject({ title: 'kept', renamed: null })
    await v2.destroy()
    expect(Object.keys(await columns(`${prefix}posts`))).toEqual([
      'id',
      'created_at',
      'updated_at',
      'title',
      'renamed',
    ])
  })

  it('never touches tables it does not own', async () => {
    const { cwd, prefix } = project()
    await pg.exec(
      `create table ${prefix}host_posts (id serial primary key, body text); insert into ${prefix}host_posts (body) values ('mine')`,
    )
    await (await open(config(prefix, [{ name: 'title', type: 'text' }]), cwd)).destroy()
    await (await open(config(prefix, [{ name: 'other', type: 'text' }]), cwd)).destroy()
    expect((await pg.query(`select body from ${prefix}host_posts`)).rows).toEqual([
      { body: 'mine' },
    ])
  })

  it('reports column clashes as config errors', async () => {
    const { cwd, prefix } = project()
    await expect(
      open(
        config(prefix, [
          { name: 'seo_title', type: 'text' },
          { name: 'seo', type: 'group', fields: [{ name: 'title', type: 'text' }] },
        ]),
        cwd,
      ),
    ).rejects.toThrow(ConfigError)
  })
})

describe('postgres migration files', () => {
  it('creates, applies and verifies migrations', async () => {
    const { cwd, prefix } = project()
    const v1 = config(prefix, [{ name: 'title', type: 'text' }])
    const tool = await open(v1, cwd, 'skip')
    const init = await tool.db.createMigration({ name: 'init' })
    expect(init?.statements.join('\n')).toContain(`CREATE TABLE "${prefix}posts"`)
    expect(readFileSync(init?.file as string, 'utf8')).toContain('(postgres)')
    expect(await tool.db.migrate()).toEqual([init?.name])
    await tool.destroy()

    const prod = await open(v1, cwd, 'verify')
    await prod.create('posts', { title: 'ok' })
    await prod.destroy()

    const changed = config(prefix, [
      { name: 'title', type: 'text' },
      { name: 'views', type: 'number' },
    ])
    await expect(open(changed, cwd, 'verify')).rejects.toThrow(SchemaError)
  })

  it('rolls back a failing migration and does not record it', async () => {
    const { cwd, prefix } = project()
    const tool = await open(config(prefix, [{ name: 'title', type: 'text' }]), cwd, 'skip')
    const created = await tool.db.createMigration({ name: 'init' })
    const file = created?.file as string
    writeFileSync(
      file,
      `${readFileSync(file, 'utf8')}\n--> statement-breakpoint\nTHIS IS NOT SQL;\n`,
    )
    await expect(tool.db.migrate()).rejects.toThrow(/rolled back/)
    expect(await tool.db.migrationStatus()).toEqual([{ name: created?.name, applied: false }])
    await tool.destroy()
    expect(await tables(prefix)).toEqual(['migrations'])
  })

  it('refuses migrations created for another database', async () => {
    const { cwd, prefix } = project()
    const tool = await open(config(prefix, [{ name: 'title', type: 'text' }]), cwd, 'skip')
    const created = await tool.db.createMigration({ name: 'init' })
    const meta = String(created?.file).replace(/\.sql$/, '.json')
    writeFileSync(
      meta,
      readFileSync(meta, 'utf8').replace('"dialect": "postgres"', '"dialect": "sqlite"'),
    )
    await expect(tool.db.migrate()).rejects.toThrow(/created for sqlite/)
    await tool.destroy()
  })
})

describe('postgres adapter options', () => {
  it('requires a url or pglite', () => {
    expect(() => postgres({})).toThrow(/url.*pglite/)
  })

  it('opens a PGlite data directory relative to the project', async () => {
    const { cwd } = project()
    const cfg: Config = {
      secret: 'x'.repeat(32),
      db: postgres({ pglite: './pgdata' }),
      collections: [{ slug: 'notes', fields: [{ name: 'text', type: 'text' }] }],
    }
    const first = await open(cfg, cwd)
    await first.create('notes', { text: 'persisted' })
    await first.destroy()
    const second = await open(cfg, cwd)
    expect((await second.find('notes')).docs.map((d) => d.text)).toEqual(['persisted'])
    await second.destroy()
  })
})
