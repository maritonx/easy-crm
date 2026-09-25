import { defineConfig } from 'vitest/config'

// CI runners are slower than dev machines, especially while other packages test in parallel:
// scrypt at OWASP cost, loading configs with jiti, drizzle-kit and tsc all take seconds there.
export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 30_000 } })
