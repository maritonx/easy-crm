import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { type IO, run } from '../src/index.js'

// Projects live inside the package so the config can import workspace packages.
const TMP = join(import.meta.dirname, '.tmp')
const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function project(fields = "[{ name: 'title', type: 'text' }]") {
  mkdirSync(TMP, { recursive: true })
  const dir = mkdtempSync(join(TMP, 'project-'))
  dirs.push(dir)
  writeConfig(dir, fields)
  return dir
}

function writeConfig(dir: string, fields: string) {
  writeFileSync(
    join(dir, 'easy-cms.config.ts'),
    `import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
export default defineConfig({
  secret: '${'s'.repeat(32)}',
  db: sqlite({ url: 'file:./cms.db' }),
  collections: [{ slug: 'posts', fields: ${fields} }],
})
`,
  )
}

async function cli(...argv: string[]) {
  const out: string[] = []
  const err: string[] = []
  const io: IO = { out: (l) => out.push(l), err: (l) => err.push(l), interactive: false }
  const code = await run(argv, io)
  return { code, out: out.join('\n'), err: err.join('\n') }
}

describe('easy-cms CLI (FR-INS-06..08)', () => {
  it('shows help', async () => {
    const help = await cli('--help')
    expect(help.code).toBe(0)
    expect(help.out).toContain('migrate:create <name>')
    expect((await cli('migrate', '--help')).out).toContain('Usage: easy-cms migrate')
  })

  it('fails with a non-zero code on bad input', async () => {
    expect((await cli()).code).toBe(1)
    expect(await cli('nope')).toMatchObject({
      code: 1,
      err: expect.stringContaining('Unknown command "nope"'),
    })
    expect(await cli('--bogus')).toMatchObject({ code: 1 })
    const dir = project()
    expect(await cli('migrate:create', '--cwd', dir)).toMatchObject({
      code: 1,
      err: expect.stringContaining('Missing migration name'),
    })
  })

  it('explains a missing config', async () => {
    mkdirSync(TMP, { recursive: true })
    const empty = mkdtempSync(join(TMP, 'empty-'))
    dirs.push(empty)
    const result = await cli('migrate', '--cwd', empty)
    expect(result.code).toBe(1)
    expect(result.err).toContain('npx create-easy-cms')
    expect(result.err).not.toContain('    at ') // no stack trace
  })

  it('creates, lists and applies migrations', async () => {
    const dir = project()
    expect((await cli('migrate:status', '--cwd', dir)).out).toContain('No migrations yet')

    const created = await cli('migrate:create', 'init', '--cwd', dir)
    expect(created).toMatchObject({ code: 0, out: expect.stringMatching(/Created .*_init\.sql/) })
    expect(await cli('migrate:create', 'again', '--cwd', dir)).toMatchObject({
      out: 'No changes; nothing to migrate.',
    })
    expect((await cli('migrate:status', '--cwd', dir)).out).toMatch(/• pending\s+\d+_init/)

    expect(await cli('migrate', '--cwd', dir)).toMatchObject({
      code: 0,
      out: expect.stringContaining('Applied 1 migration(s).'),
    })
    expect((await cli('migrate:status', '--cwd', dir)).out).toMatch(/✓ applied\s+\d+_init/)
    expect((await cli('migrate', '--cwd', dir)).out).toContain('No pending migrations.')
    expect(readdirSync(join(dir, 'easy-cms/migrations'))).toHaveLength(2)
  })

  it('reports config errors', async () => {
    const dir = project("[{ name: 'bad name', type: 'text' }]")
    const result = await cli('migrate:status', '--cwd', dir)
    expect(result.code).toBe(1)
    expect(result.err).toContain('Invalid Easy CMS config')
  })
})
