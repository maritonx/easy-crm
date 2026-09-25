# TypeScript

## Inferred from the config

Keep the config's literal types with `defineConfig` and the Local API is typed without any
generation step:

```ts
const cms = await getEasyCMS(config)
const { docs } = await cms.find('posts')
docs[0].title // string
docs[0].tags // ('vue' | 'nuxt')[]
docs[0].author // number | User (a populated relationship)
await cms.find('pots') // error: unknown collection
```

Name the types you need:

```ts
import type { CollectionDocument, CreateInput, GlobalDocument } from '@easy-cms/core'
import type config from './easy-cms.config'

export type Post = CollectionDocument<typeof config, 'posts'>
export type NewPost = CreateInput<typeof config, 'posts'>
export type Site = GlobalDocument<typeof config, 'site'>
```

## Generated types for other apps

For a frontend that can't import your config, for example a Vite SPA in another repository
calling the REST API:

```bash
npx easy-cms generate:types              # writes easy-cms-types.ts
npx easy-cms generate:types --out ../web/src/cms.ts
```

The file has no imports: one interface per collection and global, plus `Collections` and
`Globals` maps.

```ts
import type { Collections, Post } from './easy-cms-types'

const res = await fetch('/api/cms/posts?limit=10')
const { docs }: { docs: Post[] } = await res.json()
```

Run it again after changing the config.
