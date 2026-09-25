import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Config, createEasyCMS, type SchemaMode, silentLogger } from '@easy-cms/core'
import { createClient } from '@libsql/client'
import { afterEach } from 'vitest'
import { sqlite } from '../src/index.js'

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

/** A fresh temporary project directory, removed after each test. */
export function tempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'easy-cms-sqlite-'))
  dirs.push(dir)
  return dir
}

export const SECRET = 'x'.repeat(32)

export async function open<const C extends Config>(
  config: C,
  cwd: string = tempProject(),
  schema: SchemaMode = 'push',
) {
  const cms = await createEasyCMS(config, { cwd, schema, logger: silentLogger })
  return Object.assign(cms, { cwd })
}

export const db = () => sqlite({ url: 'file:./cms.db' })

/** Raw access to the test database, for checking what is actually stored. */
export function rawClient(cwd: string) {
  return createClient({ url: `file:${join(cwd, 'cms.db')}` })
}

export async function tables(cwd: string): Promise<string[]> {
  const client = rawClient(cwd)
  const result = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  )
  client.close()
  return result.rows.map((r) => String(r.name)).filter((n) => !n.startsWith('sqlite_'))
}
