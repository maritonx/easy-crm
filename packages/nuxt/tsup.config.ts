import { defineConfig } from 'tsup'

// tsup's dts build sets `baseUrl`, which TypeScript 6 deprecates.
const dts = { compilerOptions: { ignoreDeprecations: '6.0' } }

export default defineConfig([
  {
    entry: ['src/module.ts'],
    format: ['esm'],
    dts,
    clean: true,
    target: 'node22',
    external: ['@nuxt/kit', '@nuxt/schema'],
  },
  {
    // Runtime files are loaded by Nuxt/Nitro, which resolve `#imports` and `#easy-cms/config`.
    entry: [
      'src/runtime/admin.ts',
      'src/runtime/cms.ts',
      'src/runtime/handler.ts',
      'src/runtime/plugin.ts',
    ],
    outDir: 'dist/runtime',
    format: ['esm'],
    bundle: false,
    external: ['#easy-cms-local-api', '#easy-cms-admin-shell'],
    dts,
    target: 'node22',
  },
])
