import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// Fresh databases per run, so the first-admin flow is always available.
const scratch = mkdtempSync(join(tmpdir(), 'easy-cms-e2e-'))
const SECRET = 'e2e-secret-e2e-secret-e2e-secret-e2e'
const browser = {
  ...devices['Desktop Chrome'],
  // Locally use the installed Chrome; CI installs Playwright's Chromium.
  ...(process.env.CI ? {} : { channel: 'chrome' as const }),
}

/** The same admin suite runs against both adapters (FR-ADP-03). */
const apps = [
  {
    name: 'nuxt',
    port: 3100,
    command: 'pnpm --dir ../examples/nuxt-blog exec nuxi dev --port 3100',
  },
  {
    name: 'next',
    port: 3101,
    command: 'pnpm --dir ../examples/next-blog exec next dev --port 3101',
  },
] as const

export default defineConfig({
  testDir: 'tests',
  // Tests build on each other's data within an app.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: apps.map((app) => ({
    name: app.name,
    use: { ...browser, baseURL: `http://localhost:${app.port}` },
  })),
  webServer: apps.map((app) => ({
    name: app.name,
    command: app.command,
    url: `http://localhost:${app.port}/api/cms/users/init`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      EASY_CMS_SECRET: SECRET,
      // Nuxt example: SQLite. Next example: Postgres via PGlite.
      DATABASE_URL: app.name === 'nuxt' ? `file:${join(scratch, 'nuxt.db')}` : '',
      PGLITE_DIR: join(scratch, 'next-pglite'),
      NUXT_TELEMETRY_DISABLED: '1',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  })),
})
