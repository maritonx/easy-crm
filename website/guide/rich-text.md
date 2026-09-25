# Rich text

`richText` fields are edited with [Tiptap](https://tiptap.dev) in the admin (headings, bold,
italic, underline, code, links, lists, quotes, images from the media library) and stored as
Tiptap JSON.

Render it with `@easy-cms/richtext`:

```bash
npm install @easy-cms/richtext
```

```ts
import { renderRichText, richTextToPlainText } from '@easy-cms/richtext'

const html = renderRichText(post.body) // safe to insert as HTML
const excerpt = richTextToPlainText(post.body).slice(0, 160)
```

`renderRichText` escapes all text and attributes and drops unsafe URLs (`javascript:`, `data:`
and anything other than http(s), mailto, tel and relative links), so its output is safe for
`v-html` or `dangerouslySetInnerHTML`. External links get `rel="noopener noreferrer"`.

Customize the output per node:

```ts
renderRichText(post.body, {
  nodes: {
    image: (node) => `<figure><img src="${node.attrs?.src}" alt=""></figure>`,
  },
})
```

Custom renderers receive raw attributes; escape them yourself (`escapeHtml`, `safeUrl` are exported).
