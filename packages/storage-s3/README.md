# @easy-cms/storage-s3

Upload storage for [Easy CMS](https://maritonx.github.io/easy-crm/) on AWS S3, Cloudflare R2,
MinIO or any S3-compatible service. Use it where there is no persistent disk: Vercel, Netlify,
containers.

```ts
import { s3Storage } from '@easy-cms/storage-s3'

export default defineConfig({
  // …
  upload: { storage: s3Storage({ bucket: 'my-site-media', region: 'eu-central-1' }) },
})
```

Credentials default to `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`. Files are served through the
CMS API (private bucket) unless you set `publicUrl`.

See [Uploads & media](https://maritonx.github.io/easy-crm/guide/uploads#s3-cloudflare-r2-and-minio).
