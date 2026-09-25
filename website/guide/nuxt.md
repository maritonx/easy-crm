# Nuxt

`@easy-cms/nuxt` is a Nuxt 4 module.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@easy-cms/nuxt'],
  easyCms: {
    // configPath: 'easy-cms.config.ts',
    // trustProxy: false,
  },
})
```

With `easy-cms.config.ts` in the project root the module:

- serves the REST API at `routes.api` (default `/api/cms`) and the admin at `admin.path` (`/admin`)
- auto-imports two server utilities, typed from your config:

```ts
// server/api/posts/[slug].get.ts
export default defineEventHandler(async (event) => {
  const cms = await useEasyCMS()
  const user = await useEasyCMSUser(event) // the logged-in Easy CMS user, or null
  const { docs } = await cms.find('posts', {
    where: { slug: { equals: getRouterParam(event, 'slug') } },
    // Let access rules decide, and show drafts to logged-in editors.
    overrideAccess: false,
    user,
    draft: user !== null,
    limit: 1,
  })
  return docs[0] ?? null
})
```

## Options

| Option | Default | |
|---|---|---|
| `configPath` | `easy-cms.config.ts` | Path to the Easy CMS config |
| `trustProxy` | `false` | Use `X-Forwarded-For` as the client IP for login rate limiting. Only behind a proxy you control. |

## Notes

- The module connects at server start: schema problems (pending migrations) show up in the log
  immediately.
- The admin's static files are Nitro public assets, so on platforms with a CDN they are served
  from it.
- The production build ships the database driver's native files (libSQL). Build on the same OS
  and architecture you deploy to, and start the server from the project root.

See the [Nuxt example](https://github.com/easy-cms/easy-cms/tree/main/examples/nuxt-blog).
