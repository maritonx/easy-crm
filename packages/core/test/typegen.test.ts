import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateTypes, resolveConfig } from '../src/index.js'
import { baseConfig } from './helpers.js'

const config = await resolveConfig(
  baseConfig({
    auth: { roles: ['admin', 'editor', 'author'] },
    collections: [
      { slug: 'categories', fields: [{ name: 'name', type: 'text', required: true }] },
      {
        slug: 'posts',
        drafts: true,
        fields: [
          { name: 'title', type: 'text', required: true },
          { name: 'views', type: 'number' },
          {
            name: 'kind',
            type: 'select',
            options: ['news', { label: 'Blog', value: 'blog' }],
            required: true,
          },
          { name: 'tags', type: 'select', options: ['a', 'b'], hasMany: true },
          { name: 'body', type: 'richText' },
          { name: 'cover', type: 'upload' },
          { name: 'category', type: 'relationship', to: 'categories' },
          { name: 'related', type: 'relationship', to: 'posts', hasMany: true },
          { name: 'secret', type: 'text', hidden: true },
          { name: 'links', type: 'array', fields: [{ name: 'url', type: 'text', required: true }] },
          { name: 'seo', type: 'group', fields: [{ name: 'title', type: 'text' }] },
        ],
      },
      { slug: 'site-pages', fields: [{ name: 'title', type: 'text' }] },
    ],
    globals: [{ slug: 'site', fields: [{ name: 'siteName', type: 'text' }] }],
  }),
)
const output = generateTypes(config)

describe('generateTypes (FR-INS-05)', () => {
  it('names interfaces after collections and globals', () => {
    for (const name of [
      'User',
      'Media',
      'Category',
      'Post',
      'SitePage',
      'Site',
      'Collections',
      'Globals',
    ]) {
      expect(output).toContain(`export interface ${name} {`)
    }
    expect(output).not.toMatch(/Session|LoginAttempt/)
  })

  it('maps field types, required and optional', () => {
    expect(output).toContain('  title: string\n')
    expect(output).toContain('  views?: number | null\n')
    expect(output).toContain(`  kind: "news" | "blog"\n`)
    expect(output).toContain(`  tags: ("a" | "b")[]\n`)
    expect(output).toContain('  body?: RichTextDocument | null\n')
    expect(output).toContain('  cover?: ID | Media | null\n')
    expect(output).toContain('  category?: ID | Category | null\n')
    expect(output).toContain('  related: (ID | Post)[]\n')
    expect(output).toContain("  status: 'draft' | 'published'\n")
    expect(output).toContain('  links: {\n    id: string\n    url: string\n  }[]\n')
    expect(output).toContain('  seo: {\n    title?: string | null\n  }\n')
    expect(output).toContain(`  role: "admin" | "editor" | "author"\n`)
    expect(output).toContain('  url: string\n  sizes: Record<string, MediaSize>\n')
  })

  it('leaves out hidden fields', () => {
    expect(output).not.toContain('secret')
    expect(output).not.toContain('passwordHash')
  })

  it('produces valid TypeScript without imports', () => {
    const dir = mkdtempSync(join(tmpdir(), 'easy-cms-typegen-'))
    writeFileSync(join(dir, 'types.ts'), output)
    writeFileSync(
      join(dir, 'use.ts'),
      `import type { Collections, Post } from './types.js'
const post: Post = { id: 1, title: 'T', kind: 'news', tags: [], related: [], links: [], seo: {}, status: 'draft', createdAt: '', updatedAt: '' }
const again: Collections['posts'] = post
export { again }
`,
    )
    const tsc = join(import.meta.dirname, '../../../node_modules/.bin/tsc')
    execFileSync(
      tsc,
      [
        '--ignoreConfig',
        '--noEmit',
        '--strict',
        '--module',
        'nodenext',
        '--moduleResolution',
        'nodenext',
        join(dir, 'use.ts'),
      ],
      {
        stdio: 'pipe',
      },
    )
  })
})
