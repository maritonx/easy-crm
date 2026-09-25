---
"@easy-cms/next": patch
---

`withEasyCMS` now accepts a config typed as `NextConfig` (as `create-next-app` writes it). Before, `next build` failed its type check with "Index signature for type 'string' is missing in type 'NextConfig'".
