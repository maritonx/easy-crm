import { defineConfig } from 'vitepress'

// GitHub Pages serves the site under /<repo>/; the deploy workflow sets DOCS_BASE.
const base = process.env.DOCS_BASE ?? '/'

export default defineConfig({
  base,
  title: 'Easy CMS',
  description: 'Embedded, code-first headless CMS for Nuxt and Next.js',
  lang: 'en',
  cleanUrls: true,
  lastUpdated: true,
  head: [['link', { rel: 'icon', href: `${base}logo.svg` }]],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Reference', link: '/guide/configuration' },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is Easy CMS?', link: '/guide/what-is-easy-cms' },
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Nuxt', link: '/guide/nuxt' },
          { text: 'Next.js', link: '/guide/next' },
        ],
      },
      {
        text: 'Content',
        items: [
          { text: 'Configuration', link: '/guide/configuration' },
          { text: 'Fields', link: '/guide/fields' },
          { text: 'Access control', link: '/guide/access-control' },
          { text: 'Hooks', link: '/guide/hooks' },
          { text: 'Drafts', link: '/guide/drafts' },
          { text: 'Uploads & media', link: '/guide/uploads' },
          { text: 'Users & auth', link: '/guide/auth' },
        ],
      },
      {
        text: 'Using content',
        items: [
          { text: 'Local API', link: '/guide/local-api' },
          { text: 'REST API', link: '/guide/rest-api' },
          { text: 'TypeScript', link: '/guide/typescript' },
          { text: 'Rich text', link: '/guide/rich-text' },
        ],
      },
      {
        text: 'Operations',
        items: [
          { text: 'Databases', link: '/guide/databases' },
          { text: 'Migrations & deployment', link: '/guide/deployment' },
          { text: 'CLI', link: '/guide/cli' },
          { text: 'Security', link: '/guide/security' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/maritonx/easy-crm' }],
    search: { provider: 'local' },
    editLink: { pattern: 'https://github.com/maritonx/easy-crm/edit/main/website/:path' },
    footer: { message: 'Released under the MIT License.' },
  },
})
