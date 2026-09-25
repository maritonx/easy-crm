# @easy-cms/next

Next.js (App Router, 15+) adapter for [Easy CMS](https://github.com/maritonx/easy-crm).

```bash
pnpm add @easy-cms/next @easy-cms/core @easy-cms/db-postgres
```

**1. Wrap `next.config.ts`** so the server build keeps the admin UI and database drivers:

```ts
import { withEasyCMS } from '@easy-cms/next/config'
export default withEasyCMS({ /* your Next config */ })
```

**2. Add two route handlers** (paths match `routes.api` and `admin.path` in your Easy CMS config):

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

**3. Read content in Server Components** with the typed Local API:

```tsx
import { getEasyCMS, getEasyCMSUser } from '@easy-cms/next'
import config from '@/easy-cms.config'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const cms = await getEasyCMS(config)
  const { docs } = await cms.find('posts', { limit: 10 })
  const user = await getEasyCMSUser(config) // logged-in Easy CMS user or null
  // …
}
```

Pages that read from the CMS should be dynamic (or use `revalidate`), otherwise `next build`
tries to query the database while prerendering.

`createRouteHandlers(config, { trustProxy: true })` uses `X-Forwarded-For` for login rate limiting;
enable it behind a proxy you trust, such as Vercel.
