import { defineConfig } from 'vitest/config'

// The first test also starts PGlite (WebAssembly) and loads drizzle-kit, which can take
// over 30s on a busy macOS runner.
export default defineConfig({ test: { testTimeout: 90_000, hookTimeout: 90_000 } })
