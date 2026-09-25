# @easy-cms/richtext

Renders [Easy CMS](https://github.com/easy-cms/easy-cms) rich text (Tiptap JSON) to safe HTML.

```ts
import { renderRichText, richTextToPlainText } from '@easy-cms/richtext'

const html = renderRichText(post.body) // escaped, unsafe URLs removed
const text = richTextToPlainText(post.body)
```

Supports headings, paragraphs, bold, italic, underline, strike, code, links, lists, quotes, code
blocks, hard breaks, rules and images. Pass `{ nodes: { image: (node, children) => '…' } }` to
customize a node. No dependencies; works in Node and browsers.
