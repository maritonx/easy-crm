/** A Tiptap / ProseMirror JSON node. */
export interface RichTextNode {
  readonly type: string
  readonly attrs?: Readonly<Record<string, unknown>>
  readonly content?: readonly RichTextNode[]
  readonly text?: string
  readonly marks?: readonly {
    readonly type: string
    readonly attrs?: Readonly<Record<string, unknown>>
  }[]
}

/** What rich text fields hold: `@easy-cms/core`'s `RichTextDocument` fits. */
export type RichTextInput =
  | RichTextNode
  | { readonly type: string; readonly content?: readonly unknown[] }

export interface RenderOptions {
  /** Override or add node renderers. Receives the node and its rendered children. */
  nodes?: Record<string, (node: RichTextNode, children: string) => string>
  /** Attributes added to every link. Default adds `rel="noopener noreferrer"` to external links. */
  linkAttributes?: (href: string) => Record<string, string>
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escapes text for use in HTML content and quoted attributes. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] as string)
}

/** Allows http(s), mailto, tel, relative URLs and fragments. Everything else (javascript:, data:, …) is dropped. */
export function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const url = value.trim()
  // Strip characters browsers ignore inside schemes, e.g. "java\tscript:".
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
  const compact = url.replace(/[\u0000-\u001F\u007F\s]/g, '').toLowerCase()
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(compact)?.[1]
  if (scheme && !['http', 'https', 'mailto', 'tel'].includes(scheme)) return undefined
  return url
}

function attributes(attrs: Record<string, string | undefined>): string {
  return Object.entries(attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${escapeHtml(v as string)}"`)
    .join('')
}

const defaultLinkAttributes = (href: string): Record<string, string> =>
  /^https?:\/\//i.test(href) ? { rel: 'noopener noreferrer' } : {}

function renderMarks(text: string, marks: RichTextNode['marks'], options: RenderOptions): string {
  let html = escapeHtml(text)
  for (const mark of marks ?? []) {
    switch (mark.type) {
      case 'bold':
        html = `<strong>${html}</strong>`
        break
      case 'italic':
        html = `<em>${html}</em>`
        break
      case 'underline':
        html = `<u>${html}</u>`
        break
      case 'strike':
        html = `<s>${html}</s>`
        break
      case 'code':
        html = `<code>${html}</code>`
        break
      case 'link': {
        const href = safeUrl(mark.attrs?.href)
        if (!href) break
        const extra = (options.linkAttributes ?? defaultLinkAttributes)(href)
        const target = mark.attrs?.target === '_blank' ? '_blank' : undefined
        html = `<a${attributes({ href, target, ...extra })}>${html}</a>`
        break
      }
    }
  }
  return html
}

function renderNode(node: RichTextNode, options: RenderOptions): string {
  if (!node || typeof node !== 'object') return ''
  if (node.type === 'text') return renderMarks(String(node.text ?? ''), node.marks, options)

  const children = (Array.isArray(node.content) ? node.content : [])
    .map((c) => renderNode(c, options))
    .join('')
  const custom = options.nodes?.[node.type]
  if (custom) return custom(node, children)

  switch (node.type) {
    case 'doc':
      return children
    case 'paragraph':
      return `<p>${children}</p>`
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 2))
      return `<h${level}>${children}</h${level}>`
    }
    case 'bulletList':
      return `<ul>${children}</ul>`
    case 'orderedList': {
      const start = Number(node.attrs?.start)
      return `<ol${Number.isInteger(start) && start !== 1 ? ` start="${start}"` : ''}>${children}</ol>`
    }
    case 'listItem':
      return `<li>${children}</li>`
    case 'blockquote':
      return `<blockquote>${children}</blockquote>`
    case 'codeBlock': {
      const language = typeof node.attrs?.language === 'string' ? node.attrs.language : undefined
      return `<pre><code${attributes({ class: language ? `language-${language}` : undefined })}>${children}</code></pre>`
    }
    case 'hardBreak':
      return '<br>'
    case 'horizontalRule':
      return '<hr>'
    case 'image': {
      const src = safeUrl(node.attrs?.src)
      if (!src) return ''
      const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''
      const title = typeof node.attrs?.title === 'string' ? node.attrs.title : undefined
      return `<img${attributes({ src, alt, title })}>`
    }
    default:
      // Unknown nodes keep their text but no markup.
      return children
  }
}

/** Renders a rich text document to HTML. Text is escaped and unsafe URLs are removed. */
export function renderRichText(
  doc: RichTextInput | null | undefined,
  options: RenderOptions = {},
): string {
  if (!doc) return ''
  return renderNode(doc as RichTextNode, options)
}

/** Plain text of a document, e.g. for excerpts or search. Blocks are separated by newlines. */
export function richTextToPlainText(doc: RichTextInput | null | undefined): string {
  if (!doc) return ''
  const blocks = new Set(['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock'])
  const walk = (node: RichTextNode): string => {
    if (node.type === 'text') return String(node.text ?? '')
    if (node.type === 'hardBreak') return '\n'
    const inner = (node.content ?? []).map(walk).join('')
    return blocks.has(node.type) ? `${inner}\n` : inner
  }
  return walk(doc as RichTextNode)
    .replace(/\n{2,}/g, '\n')
    .trim()
}
