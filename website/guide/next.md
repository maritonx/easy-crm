# Next.js

`@easy-cms/next` supports the App Router in Next.js 15 and later.

## Setup

`npx create-easy-cms` does these steps for you.

**1. Wrap `next.config.ts`**, so the server build keeps the admin files, migrations and database
drivers (it sets `serverExternalPackages` and `outputFileTracingIncludes`):

```ts
import type { NextConfig } from 'next'
import { withEasyCMS } from '@easy-cms/next/config'

const nextConfig: NextConfig = {}
export default withEasyCMS(nextConfig)
```

**2. Add the route handlers.** Their paths must match `routes.api` and `admin.path`:

```ts
// app/api/cms/[[...path]]/route.ts
import { createRouteHandlers } from '@easy-cms/next'
import config from '@/easy-cms.config'
export const { GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS } = createRouteHandlers(config)
```

```ts
// app/admin/[[...path]]/route.ts
import { createAdminRouteHandlers } from '@easy-cms/next'
import config from '@/easy-cms.config'
export const { GET, HEAD } = createAdminRouteHandlers(config)
```

## Reading content

```tsx
import { getEasyCMS, getEasyCMSUser } from '@easy-cms/next'
import config from '@/easy-cms.config'

export const dynamic = 'force-dynamic'

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const cms = await getEasyCMS(config)
  const user = await getEasyCMSUser(config)
  const { docs } = await cms.find('posts', {
    where: { slug: { equals: slug } },
    overrideAccess: false,
    user,
    draft: user !== null,
    limit: 1,
  })
  // …
}
```

`getEasyCMS(config)` returns one instance per server that survives hot reloads. It can be used
in Server Components, Route Handlers and Server Actions.

## Things to know

- **Make CMS-backed pages dynamic** (`export const dynamic = 'force-dynamic'`) or use
  revalidation. Otherwise `next build` prerenders them and queries the database at build time.
- `createRouteHandlers(config, { trustProxy: true })` uses `X-Forwarded-For` for login rate
  limiting; enable it behind a proxy you trust, such as Vercel.
- Next.js removes trailing slashes, so the admin lives at `/admin` (not `/admin/`).

See the [Next.js example](https://github.com/easy-cms/easy-cms/tree/main/examples/next-blog).
