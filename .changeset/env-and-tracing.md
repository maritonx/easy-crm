---
"@easy-cms/core": patch
"create-easy-cms": patch
---

- Next.js builds no longer trace the whole project into the server output: the config lookup and local upload storage mark their runtime paths with `turbopackIgnore`.
- `create-easy-cms` and the "secret is required" error now say that the secret must be set in the production environment (Nuxt's production server does not read `.env`).
