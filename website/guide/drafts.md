# Drafts

```ts
{ slug: 'posts', drafts: true, fields: [/* … */] }
```

A collection (or global) with `drafts: true` gets a `status` of `draft` or `published`. New
documents start as drafts.

- **Drafts may be incomplete:** `required` is not enforced while `status` is `draft`; types
  still are.
- **Publishing validates everything.**
- **Reads return published documents** unless you pass `draft: true`: `find`, `findById`,
  `count`, populated relationships and the REST API. Over REST, `?draft=true` only works for
  logged-in users.

```ts
await cms.find('posts') // published only
await cms.find('posts', { draft: true }) // everything
await cms.update('posts', id, { status: 'published' }) // publish
await cms.update('posts', id, { status: 'draft' }) // unpublish
```

In the admin, a draft has **Save draft** and **Publish**; a published document has **Save** (stays
published) and **Unpublish**.

::: warning No separate draft copies in v0.1
A document has one version. Saving a published document as a draft unpublishes it. Keeping edits
as a draft behind the published version needs version history, planned for v2.
:::
