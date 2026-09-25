import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Each file builds a Nuxt app; run them one at a time.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 300_000,
  },
})
