import { defineConfig } from 'vitest/config'

// Generous: macOS CI runners can take over 30s to start PGlite or libSQL for the first test.
export default defineConfig({ test: { testTimeout: 90_000, hookTimeout: 90_000 } })
