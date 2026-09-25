// NFR-PERF-01/02: find (limit 10, depth 1) over 10,000 documents.
// Run: node bench.ts [sqlite|pglite]  (POSTGRES_URL=... node bench.ts postgres)
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEasyCMS, createRestHandler, defineConfig, silentLogger } from '@easy-cms/core'
import { postgres } from '@easy-cms/db-postgres'
import { sqlite } from '@easy-cms/db-sqlite'

const dialect = process.argv[2] ?? 'sqlite'
const cwd = mkdtempSync(join(tmpdir(), 'easy-cms-bench-'))
const db =
  dialect === 'sqlite'
    ? sqlite({ url: 'file:./bench.db' })
    : dialect === 'pglite'
      ? postgres({ pglite: './pgdata' })
      : postgres({ url: process.env.POSTGRES_URL as string, tablePrefix: `bench${Date.now()}_` })

const config = defineConfig({
  secret: 's'.repeat(32),
  db,
  collections: [
    { slug: 'authors', access: { read: () => true }, fields: [{ name: 'name', type: 'text' }] },
    {
      slug: 'posts',
      access: { read: () => true },
      fields: [
        { name: 'title', type: 'text', index: true },
        { name: 'views', type: 'number', index: true },
        { name: 'tags', type: 'select', options: ['a', 'b', 'c'], hasMany: true },
        { name: 'author', type: 'relationship', to: 'authors' },
      ],
    },
  ],
})

const cms = await createEasyCMS(config, { cwd, logger: silentLogger })
const authors = []
for (let i = 0; i < 20; i++) authors.push((await cms.create('authors', { name: `Author ${i}` })).id)
const seedStart = performance.now()
for (let i = 0; i < 10_000; i++) {
  await cms.create('posts', {
    title: `Post ${i}`,
    views: i % 1000,
    tags: i % 2 ? ['a', 'b'] : ['c'],
    author: authors[i % authors.length] as number,
  })
}
console.log(`seeded 10,000 posts in ${((performance.now() - seedStart) / 1000).toFixed(1)}s`)

async function measure(name: string, run: () => Promise<unknown>) {
  const times: number[] = []
  for (let i = 0; i < 20; i++) await run() // warm up
  for (let i = 0; i < 200; i++) {
    const t = performance.now()
    await run()
    times.push(performance.now() - t)
  }
  times.sort((a, b) => a - b)
  const p = (q: number) => times[Math.floor(q * (times.length - 1))]?.toFixed(1)
  console.log(`${name}: p50 ${p(0.5)} ms, p95 ${p(0.95)} ms`)
}

const handler = createRestHandler(cms)
let page = 1
await measure(`[${dialect}] Local API find (limit 10, depth 1)`, () =>
  cms.find('posts', {
    limit: 10,
    page: (page++ % 900) + 1,
    where: { views: { gte: 100 } },
    sort: '-views',
  }),
)
await measure(`[${dialect}] REST GET /posts (limit 10, depth 1)`, () =>
  handler(
    new Request(
      `http://x.test/api/cms/posts?limit=10&page=${(page++ % 900) + 1}&where[views][gte]=100&sort=-views`,
    ),
  ).then((r) => r.json()),
)
await cms.destroy()
