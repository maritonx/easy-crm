import { defineConfig } from 'vitest/config'

// The same suites run against every database: SQLite, PGlite (Postgres in WebAssembly),
// and a real Postgres server when POSTGRES_URL is set (CI).
const dialects = ['sqlite', 'pglite', ...(process.env.POSTGRES_URL ? ['postgres'] : [])]

export default defineConfig({
  test: {
    // The first test of a file starts PGlite and loads drizzle-kit.
    testTimeout: 90_000,
    hookTimeout: 90_000,
    projects: dialects.map((dialect) => ({
      extends: true,
      test: { name: dialect, env: { EASY_CMS_TEST_DIALECT: dialect } },
    })),
  },
})
