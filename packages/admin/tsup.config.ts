import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'server/index.ts' },
  outDir: 'dist/server',
  format: ['esm'],
  // tsup's dts build sets `baseUrl`, which TypeScript 6 deprecates.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  // vite build writes dist/app first; keep it.
  clean: false,
  target: 'node22',
})
