import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const fixture = fileURLToPath(new URL('./fixtures/basic', import.meta.url))

/** Points the fixture at a fresh database file. Returns the file path. */
export function freshDatabase(): string {
  const file = join(mkdtempSync(join(tmpdir(), 'easy-cms-nuxt-')), 'cms.db')
  process.env.EASY_CMS_DB_URL = `file:${file}`
  return file
}

export const cookieHeader = (setCookie: string[]) =>
  setCookie.map((c) => c.split(';')[0]).join('; ')
