import { defineConfig } from 'vitest/config'

// The first test of a file connects to a database and loads drizzle-kit for the schema push,
// which takes several seconds on CI machines.
// Generous: macOS CI runners can take over 30s to start PGlite or libSQL for the first test.
export default defineConfig({ test: { testTimeout: 90_000, hookTimeout: 90_000 } })
