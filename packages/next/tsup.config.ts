import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/config.ts'],
  format: ['esm'],
  // tsup's dts build sets `baseUrl`, which TypeScript 6 deprecates.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  clean: true,
  target: 'node22',
  external: ['next', 'next/headers.js'],
})
