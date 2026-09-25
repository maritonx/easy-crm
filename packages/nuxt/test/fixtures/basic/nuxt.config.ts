import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  // The built module, as users get it from npm.
  modules: [fileURLToPath(new URL('../../../dist/module.js', import.meta.url))],
  compatibilityDate: '2026-09-01',
  devtools: { enabled: false },
  telemetry: false,
})
