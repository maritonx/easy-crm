import { defineConfig } from 'vitest/config'

// CI runners are slower than dev machines, especially while other packages test in parallel:
// scrypt at OWASP cost, loading configs with jiti, drizzle-kit and tsc all take seconds there.
// Generous: macOS CI runners can take over 30s to start PGlite or libSQL for the first test.
export default defineConfig({ test: { testTimeout: 90_000, hookTimeout: 90_000 } })
