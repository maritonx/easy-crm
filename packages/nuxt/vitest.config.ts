import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // @nuxt/test-utils imports "vitest" dynamically. With several vitest copies installed
    // (pnpm makes one per set of peers) it could get a different one than the runner and fail
    // with "Vitest failed to find the current suite". Inlining makes it use the runner's.
    server: { deps: { inline: [/@nuxt\/test-utils/] } },
    // Each file builds a Nuxt app; run them one at a time.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 300_000,
  },
})
