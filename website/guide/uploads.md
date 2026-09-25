# Uploads & media

Files live in the built-in `media` collection. Link them with `upload` fields:

```ts
{ name: 'cover', type: 'upload' }
```

Editors upload in the admin's Media library (drag and drop) or from an upload field's picker.

## Uploading from code

```ts
const media = await cms.upload({ data: bytes, name: 'photo.jpg' }, { alt: 'A photo' })
media.url // "/api/cms/media/file/photo-3f9a2c1b.jpg"
```

Over REST: `POST /api/cms/media` with `multipart/form-data`, the file in `file` and other fields
(like `alt`) as text parts.

## What happens to a file

- **The type is detected from the contents**, not the name or the client's Content-Type. It must
  match `upload.mimeTypes` (default `image/*`, `application/pdf`).
- **Size** is limited by `upload.maxFileSize` (default 10 MB); larger files get `413`.
- **Names** become `<name>-<random>.<detected extension>`, so they are safe and unique, and
  Thai names stay readable.
- **Images** get `width` and `height`. With [`sharp`](https://sharp.pixelplumbing.com) installed,
  `upload.imageSizes` creates resized copies in `sizes`.
- Deleting a media document deletes its files.

```ts
upload: {
  maxFileSize: 5 * 1024 * 1024,
  mimeTypes: ['image/*'],
  imageSizes: [
    { name: 'thumbnail', width: 400, height: 300 },
    { name: 'wide', width: 1600 },
  ],
}
```

A media document looks like:

```json
{
  "id": 7,
  "filename": "photo-3f9a2c1b.jpg",
  "originalName": "photo.jpg",
  "mimeType": "image/jpeg",
  "filesize": 184213,
  "width": 2400,
  "height": 1600,
  "alt": "A photo",
  "url": "/api/cms/media/file/photo-3f9a2c1b.jpg",
  "sizes": { "thumbnail": { "width": 400, "height": 300, "url": "…" } }
}
```

Only `alt` (and fields you add) can be edited afterwards. Media metadata is readable by anyone and
writable by logged-in users; declare a `media` collection to change that or add fields.

## Serving and storage

Files are served at `/api/cms/media/file/<name>` with long-lived caching and a sandboxing Content
Security Policy, so an uploaded SVG can't run scripts. Set `serverURL` for absolute URLs.

The default storage is the local disk (`upload.dir`, default `uploads/`), which needs a persistent
filesystem. For your own storage implement `StorageAdapter` (`put`, `get`, `delete`, optional
`url`) and pass it as `upload.storage`. An S3-compatible adapter is planned for v0.2.
