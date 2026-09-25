import { defineConfig } from 'vitest/config'

// The first test of a file connects to a database and loads drizzle-kit for the schema push,
// which takes several seconds on CI machines.
export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 30_000 } })
