import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
// A fresh database per run, so the first-admin flow is always available.
const database = join(mkdtempSync(join(tmpdir(), 'easy-cms-e2e-')), 'cms.db')

export default defineConfig({
  testDir: 'tests',
  // Tests share one app and database and build on each other's data.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        // Locally use the installed Chrome; CI installs Playwright's Chromium.
        ...(process.env.CI ? {} : { channel: 'chrome' }),
      },
    },
  ],
  webServer: {
    name: 'nuxt-blog',
    command: `pnpm --dir ../examples/nuxt-blog exec nuxi dev --port ${PORT}`,
    url: `http://localhost:${PORT}/api/cms/users/init`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: `file:${database}`,
      EASY_CMS_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
      NUXT_TELEMETRY_DISABLED: '1',
    },
  },
})
