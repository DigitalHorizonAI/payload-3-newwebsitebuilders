// Lexical DOES define this allowlist (@lexical/link SUPPORTED_URL_PROTOCOLS)
// but only applies it in createDOM, when the *editor* draws a link.
// $convertAnchorElement stores `getAttribute('href')` raw, and
// convertMarkdownToLexical is no stricter — so `javascript:` survives import on
// both paths.
//
// The guard therefore sits at the two RENDER sinks rather than at ingest,
// because posts.content has four writers: the GetRanked string path
// (ingestMarkdownContent), the three import scripts, and the admin panel. Only
// the first passes through the hook; all four pass through here.
//
// Both sinks blank the href rather than the link, so no prose is lost:
//   - src/lib/articleHtml.ts     -> emits `<a href="">text</a>`
//   - src/components/Link/index.tsx -> returns null (its pre-existing empty-href behaviour)
const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:', 'sms:'])

/**
 * True when `url` carries an allowlisted protocol, or is relative.
 *
 * Verified against case-folding (`JaVaScRiPt:`), tab/newline injection
 * (`java\tscript:` — WHATWG strips those anywhere, normalising it *into*
 * `javascript:`), HTML entities (JSDOM decodes before getAttribute),
 * percent-encoding, and `data:`/`vbscript:`/`file:`/`blob:`.
 */
export const isSafeUrl = (url: string): boolean => {
  const trimmed = url.trim()
  if (!trimmed) return false
  try {
    // The base makes RELATIVE hrefs parse — `about.html`, `../guide`, `#top`
    // and `//host/path` all resolve to https: and pass. Without it they throw
    // and get blanked, which turns a security control into something that eats
    // real content. The base is never kept — only its protocol is inspected.
    return SAFE_LINK_PROTOCOLS.has(new URL(trimmed, 'https://relative.invalid').protocol)
  } catch {
    return false
  }
}
