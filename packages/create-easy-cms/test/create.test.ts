import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { detectPackageManager, type IO, packagesFor, run } from '../src/index.js'

/** Temp cleanup: Windows may still hold SQLite files for a moment after close; retry, then give up quietly. */
function removeTemp(path: string) {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch {
    // leave it to the OS temp cleaner
  }
}

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) removeTemp(dir)
})

function project(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'create-easy-cms-'))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true })
    writeFileSync(join(dir, name), content)
  }
  return dir
}

async function create(dir: string, ...args: string[]) {
  const out: string[] = []
  const err: string[] = []
  const commands: string[] = []
  const io: IO = {
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    interactive: false,
    exec: async (command, argv) => {
      commands.push(`${command} ${argv.join(' ')}`)
      return 0
    },
  }
  const code = await run([dir, ...args], io)
  return { code, out: out.join('\n'), err: err.join('\n'), commands }
}

const read = (dir: string, file: string) => readFileSync(join(dir, file), 'utf8')

const NUXT_CONFIG = `// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true }
})
`
const NEXT_CONFIG = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
`

describe('create-easy-cms (FR-INS-01..03)', () => {
  it('refuses projects that are not Nuxt or Next', async () => {
    const dir = project({ 'package.json': '{"dependencies":{"vite":"1"}}' })
    const result = await create(dir, '--yes')
    expect(result.code).toBe(1)
    expect(result.err).toContain('not look like a Nuxt or Next.js project')
    expect((await create(join(dir, 'missing'))).err).toContain('No package.json')
  })

  it('sets up a Nuxt project with SQLite', async () => {
    const dir = project({
      'package.json': '{"devDependencies":{"nuxt":"^4"}}',
      'nuxt.config.ts': NUXT_CONFIG,
      'pnpm-lock.yaml': '',
    })
    const result = await create(dir, '--yes')
    expect(result.code).toBe(0)
    expect(read(dir, 'nuxt.config.ts')).toContain(
      "defineNuxtConfig({\n  modules: ['@easy-cms/nuxt'],\n  compatibilityDate",
    )
    expect(read(dir, 'easy-cms.config.ts')).toContain(
      "sqlite({ url: process.env.DATABASE_URL ?? 'file:./cms.db' })",
    )
    expect(read(dir, '.env')).toMatch(/^EASY_CMS_SECRET=[0-9a-f]{64}\n$/)
    expect(read(dir, '.gitignore')).toContain('cms.db*\nuploads/')
    expect(result.commands).toEqual([
      'pnpm add @easy-cms/core@latest @easy-cms/nuxt@latest @easy-cms/db-sqlite@latest',
      'pnpm add -D easy-cms@latest',
    ])
  })

  it('adds the module to an existing modules array', async () => {
    const dir = project({
      'package.json': '{"dependencies":{"nuxt":"^4"}}',
      'nuxt.config.ts': "export default defineNuxtConfig({ modules: ['@nuxt/ui'] })\n",
    })
    await create(dir, '--yes', '--skip-install')
    expect(read(dir, 'nuxt.config.ts')).toContain("modules: ['@easy-cms/nuxt', '@nuxt/ui']")
  })

  it('sets up a Next project with Postgres', async () => {
    const dir = project({
      'package.json': '{"dependencies":{"next":"16","react":"19"}}',
      'next.config.ts': NEXT_CONFIG,
      'src/app/page.tsx': 'export default function Page() { return null }\n',
      'package-lock.json': '{}',
    })
    const result = await create(dir, '--db', 'postgres')
    expect(result.code).toBe(0)
    expect(read(dir, 'src/app/api/cms/[[...path]]/route.ts')).toContain(
      "import config from '../../../../../easy-cms.config'",
    )
    expect(read(dir, 'src/app/admin/[[...path]]/route.ts')).toContain(
      'createAdminRouteHandlers(config)',
    )
    expect(read(dir, 'next.config.ts')).toMatch(
      /^import \{ withEasyCMS \} from '@easy-cms\/next\/config'\n/,
    )
    expect(read(dir, 'next.config.ts')).toContain('export default withEasyCMS(nextConfig)')
    expect(read(dir, 'easy-cms.config.ts')).toContain("postgres({ pglite: '.pglite' })")
    expect(result.commands[0]).toBe(
      'npm install @easy-cms/core@latest @easy-cms/next@latest @easy-cms/db-postgres@latest @electric-sql/pglite',
    )
    expect(result.commands[1]).toBe('npm install --save-dev easy-cms@latest')
  })

  it('creates next.config.ts when there is none, and leaves unusual configs to the user', async () => {
    const plain = project({ 'package.json': '{"dependencies":{"next":"16"}}' })
    await create(plain, '--yes', '--skip-install')
    expect(read(plain, 'next.config.ts')).toContain('export default withEasyCMS({})')
    expect(read(plain, 'app/api/cms/[[...path]]/route.ts')).toContain(
      "from '../../../../easy-cms.config'",
    )

    const odd = project({
      'package.json': '{"dependencies":{"next":"16"}}',
      'next.config.mjs': 'export default { reactStrictMode: true }\n',
    })
    const result = await create(odd, '--yes', '--skip-install')
    expect(result.out).toContain('Could not edit next.config.mjs')
    expect(read(odd, 'next.config.mjs')).toBe('export default { reactStrictMode: true }\n')
  })

  it('is safe to run twice', async () => {
    const dir = project({
      'package.json': '{"devDependencies":{"nuxt":"^4"}}',
      'nuxt.config.ts': NUXT_CONFIG,
      '.env': 'OTHER=1',
    })
    await create(dir, '--yes', '--skip-install')
    const first = {
      env: read(dir, '.env'),
      nuxt: read(dir, 'nuxt.config.ts'),
      ignore: read(dir, '.gitignore'),
    }
    const second = await create(dir, '--yes', '--skip-install')
    expect(second.out).toContain('easy-cms.config.ts already exists')
    expect(read(dir, '.env')).toBe(first.env)
    expect(read(dir, '.env')).toMatch(/^OTHER=1\nEASY_CMS_SECRET=/)
    expect(read(dir, 'nuxt.config.ts')).toBe(first.nuxt)
    expect(read(dir, '.gitignore')).toBe(first.ignore)
  })

  it('asks for the database in a terminal', async () => {
    const dir = project({ 'package.json': '{"dependencies":{"next":"16"}}' })
    const io: IO = { out: () => {}, err: () => {}, interactive: true, prompt: async () => '2' }
    expect(await run([dir, '--skip-install'], io)).toBe(0)
    expect(read(dir, 'easy-cms.config.ts')).toContain('@easy-cms/db-postgres')
  })

  it('reports install failures and bad options', async () => {
    const dir = project({ 'package.json': '{"dependencies":{"nuxt":"4"}}' })
    const io: IO = { out: () => {}, err: () => {}, interactive: false, exec: async () => 1 }
    expect(await run([dir, '--yes'], io)).toBe(1)
    expect((await create(dir, '--db', 'mysql')).code).toBe(1)
  })
})

describe('helpers', () => {
  it('detects the package manager from lockfiles', () => {
    expect(detectPackageManager(project({ 'yarn.lock': '' }))).toBe('yarn')
    expect(detectPackageManager(project({ 'bun.lock': '' }))).toBe('bun')
  })

  it('lists packages per framework and database', () => {
    expect(packagesFor('next', 'sqlite').deps).toEqual([
      '@easy-cms/core@latest',
      '@easy-cms/next@latest',
      '@easy-cms/db-sqlite@latest',
    ])
  })
})
