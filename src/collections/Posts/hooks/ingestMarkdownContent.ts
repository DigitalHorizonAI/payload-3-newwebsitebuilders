import type { FieldHook, RichTextField } from 'payload'

import {
  convertHTMLToLexical,
  convertMarkdownToLexical,
  editorConfigFactory,
} from '@payloadcms/richtext-lexical'
import { JSDOM } from 'jsdom'

// GetRanked's Payload connector can only emit a Markdown or HTML *string*, but
// `content` is a Lexical richText field — a string fails validation with the
// misleading "This field is required." Convert either format on the way in.
//
// Both are accepted because the connection setting does not decide what
// arrives: the site was set to Markdown in GetRanked and HTML arrived anyway.
// Refusing HTML meant refusing every article the generator writes.
//
// This hook is a no-op the moment their connector learns to send Lexical, and a
// no-op for the admin panel, because it only fires on a string.
//
// Link safety is deliberately NOT done here. This hook is only one of four
// writers into posts.content — the import scripts and the admin panel write
// Lexical objects and return at the `typeof value !== 'string'` gate below.
// The guard lives at the two render sinks instead, where every writer
// converges: src/lib/articleHtml.ts and src/components/Link/index.tsx.
//
// KNOWN CEILING: `<img>` is dropped. This field registers no upload feature and
// MediaBlock needs a real Media document, so no DOM importer claims an image
// tag. Measured on a real generated article: headings, lists, tables, quotes,
// bold and italic all survive and no prose is lost — only the images go. The
// count is logged below so the loss is visible in the server log rather than
// silent. Restoring them means importing remote images as Media docs, which
// needs storage decided first.

// Block-level closing tags. Markdown legitimately contains inline HTML, so only
// these mean "this is an HTML document, not Markdown".
const LOOKS_LIKE_HTML = /<\/(p|div|h[1-6]|ul|ol|li|article|section|table)>/i

export const ingestMarkdownContent: FieldHook = ({ field, value }) => {
  if (typeof value !== 'string') return value

  const source = value.trim()
  if (!source) return value

  // fromField, NOT editorConfigFactory.default — `default` resolves to the
  // config-level `defaultLexical` (five features, no headings), which would
  // silently drop every heading and list. fromField uses this field's own
  // editor, which includes headings, lists, links, tables and blockquotes.
  const editorConfig = editorConfigFactory.fromField({ field: field as RichTextField })

  if (LOOKS_LIKE_HTML.test(source)) {
    const droppedImages = (source.match(/<img\b/gi) ?? []).length
    if (droppedImages > 0) {
      console.warn(
        `ingestMarkdownContent: dropped ${droppedImages} <img> tag(s) — the content field has no upload feature`,
      )
    }
    return convertHTMLToLexical({ editorConfig, html: source, JSDOM })
  }

  return convertMarkdownToLexical({ editorConfig, markdown: source })
}
