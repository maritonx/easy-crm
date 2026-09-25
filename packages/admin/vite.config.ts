import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'

/**
 * Emits index.html as shell.html: static file servers (Nitro public assets, Next's public dir)
 * would otherwise serve it raw at the admin root, skipping the server's settings injection.
 */
const renameShell = (): Plugin => ({
  name: 'easy-cms-shell',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const html = bundle['index.html']
    if (html) html.fileName = 'shell.html'
  },
})

export default defineConfig({
  root: 'app',
  // Assets are referenced relative to <base href>, which the server sets to the admin path.
  base: './',
  plugins: [vue(), renameShell()],
  build: {
    outDir: '../dist/app',
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
  },
  server: {
    // `pnpm dev` in this package: proxy the API to a running Easy CMS app.
    proxy: { '/api/cms': process.env.EASY_CMS_API ?? 'http://localhost:3000' },
  },
})
