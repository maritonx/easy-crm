# @easy-cms/nuxt

Nuxt 4 module for [Easy CMS](https://github.com/easy-cms/easy-cms).

```bash
pnpm add @easy-cms/nuxt @easy-cms/core @easy-cms/db-sqlite
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@easy-cms/nuxt'],
  easyCms: {
    // configPath: 'easy-cms.config.ts',
    // trustProxy: false, // use X-Forwarded-For for login rate limiting
  },
})
```

With `easy-cms.config.ts` in the project root you get:

- **REST API** at `/api/cms` (collections, globals, uploads, login/logout/me); change it with `routes.api` in the Easy CMS config.
- **Admin UI** at `/admin` (`admin.path` in the config).
- **Local API** in server routes, typed from your config:

  ```ts
  // server/api/posts.get.ts
  export default defineEventHandler(async (event) => {
    const cms = await useEasyCMS()
    const user = await useEasyCMSUser(event) // logged-in Easy CMS user or null
    return cms.find('posts', { where: { status: { equals: 'published' } } })
  })
  ```

## Development and production

- `nuxi dev` pushes schema changes to the database automatically.
- In production the schema must match the latest migration. Create migrations with
  `npx easy-cms migrate:create <name>`, deploy the `easy-cms/migrations` folder, run
  `npx easy-cms migrate`, then start the server **from the project root** (relative database
  paths and the migrations folder resolve from the working directory).
- The module tells Nitro to ship files the database adapter loads dynamically (libsql's native
  binary), so `.output` runs on its own. Build on the same OS/architecture you deploy to.
