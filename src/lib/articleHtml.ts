/**
 * Lexical → the article HTML the website was hand-written in.
 *
 * The websites splice `contentHtml` into their pages verbatim (the static
 * builder only normalises em dashes), so this serializer's contract is
 * byte-identity: rendering the imported articles must reproduce
 * `newwebsitebuilders/blog/_build/bodies/*.html` exactly. The import script
 * enforces that with a round-trip check before it writes anything.
 *
 * That is why this is hand-rolled rather than `convertLexicalToHTMLAsync`:
 * the source files carry a fixed house format — a blank line between
 * top-level elements, two-space indents inside keyboxes, quotes and tables,
 * `<h2 id="...">` anchors — and the stock converters know none of it.
 */

import { isSafeUrl } from '@/lib/isSafeUrl'

/** Anchors the articles already rank with. Lexical headings cannot carry an
 * id attribute, so the id is recovered from the heading text at render time:
 * first from this map (the pre-CMS hand-written ids), else by slugifying —
 * which is what gives every future article its anchors for free. */
const LEGACY_HEADING_IDS: Record<string, string> = {
  'Access to your domain': 'domain',
  'De analytics- en bedrijfsaccounts': 'accounts',
  "De pagina's die je echt nodig hebt": 'paginas',
  'Does classic SEO still count?': 'what-still-counts',
  'Eén persoon die ja mag zeggen': 'beslisser',
  'Eén zin die zegt wat je doet': 'een-zin',
  "Foto's die echt van jou zijn": 'fotos',
  'Headless of traditioneel: wat heb je nodig?': 'headless-of-traditioneel',
  'Headless or traditional: which one do you need?': 'headless-or-traditional',
  'Hoe schrijf je een pagina voor een AI-antwoord?': 'losstaand-schrijven',
  'Hoe weet je of het werkt?': 'meten',
  'Hoeveel scheelt het echt?': 'core-web-vitals',
  'Hoeveel van de site moet bewerkbaar zijn?': 'hoeveel-bewerkbaar',
  'How do you know whether it is working?': 'how-to-measure',
  'How much does the difference actually matter?': 'core-web-vitals',
  'How much of the site should be editable?': 'how-much-editable',
  'How should a page be written for an answer engine?': 'write-standalone',
  'Is snelheid de enige reden?': 'meer-dan-snelheid',
  'Is speed the only reason?': 'beyond-speed',
  'Je logo als vectorbestand': 'logo',
  'One person who can say yes': 'decider',
  'One sentence that says what you do': 'one-sentence',
  'Photographs that are actually yours': 'photographs',
  'Telt klassieke SEO nog mee?': 'klassieke-seo',
  'The analytics and business accounts': 'accounts',
  'The pages you truly need': 'pages',
  'Toegang tot je domein': 'domein',
  'Waarom loopt een bouw vast?': 'waarom-vastlopen',
  'Waarom zijn de regels veranderd?': 'waarom-veranderd',
  'Wanneer is een paginabouwer wél het goede antwoord?': 'wanneer-bouwers-winnen',
  'Wat betekent handgecodeerd precies?': 'wat-is-handgecodeerd',
  'Wat geeft een CMS je niet?': 'wat-het-niet-geeft',
  'Wat geeft een CMS je nu echt?': 'wat-het-geeft',
  'Wat is een CMS, in één alinea?': 'wat-is-een-cms',
  'Wat is GEO, en hoe verschilt het van SEO?': 'wat-is-geo',
  'Wat je deze maand aan je site verandert': 'checklist',
  'Wat je niet hoeft voor te bereiden': 'niet-nodig',
  'Wat stuurt een paginabouwer eigenlijk naar de browser?': 'wat-bouwers-sturen',
  'Wat vraag je voordat je site gebouwd wordt?': 'wat-vragen',
  'Wat vraag je voordat je tekent?': 'wat-vragen',
  'Welke structured data heeft een site van een klein bedrijf nodig?': 'structured-data',
  'What does a CMS actually give you?': 'what-it-gives-you',
  'What does a CMS not give you?': 'what-it-does-not',
  'What does a page builder actually send to the browser?': 'what-builders-send',
  'What does hand-coded mean, exactly?': 'what-is-hand-coded',
  'What is a CMS, in one paragraph?': 'what-is-a-cms',
  'What is GEO, and how is it different from SEO?': 'what-is-geo',
  'What should you ask before you sign?': 'what-to-ask',
  'What structured data does a small business site need?': 'structured-data',
  'What to ask for before your site is built': 'what-to-ask',
  'What to change on your site this month': 'checklist',
  'What you do not need to prepare': 'not-needed',
  'When is a page builder the right answer?': 'when-builders-win',
  'Why did the rules change?': 'why-it-changed',
  'Why does a build stall?': 'why-builds-stall',
  'Your logo as a vector file': 'logo',
}

// NFD splits accented letters into base + combining mark; dropping the marks
// (U+0300–U+036F) is what turns 'één' into 'een' rather than 'n'.
const stripCombiningMarks = (s: string): string =>
  Array.from(s)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0
      return code < 0x300 || code > 0x36f
    })
    .join('')

export const slugifyHeading = (text: string): string =>
  stripCombiningMarks(text.toLowerCase().normalize('NFD'))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const headingId = (text: string): string =>
  LEGACY_HEADING_IDS[text] ?? slugifyHeading(text)

// Lexical text-format bitmask.
const BOLD = 1
const ITALIC = 2
const CODE = 16

type LexicalNode = {
  type?: string
  text?: string
  format?: number | string
  tag?: string
  headerState?: number
  fields?: Record<string, unknown>
  children?: LexicalNode[]
}

export type ResolvedMedia = { url: string; alt: string }

export type ArticleHtmlOptions = {
  /** Throw on a node this serializer cannot render, instead of dropping it.
   * The importer runs strict — a silent drop is the exact failure the whole
   * re-import exists to fix. The public endpoint stays lenient. */
  strict?: boolean
  /** Looks up a media document for mediaBlock nodes; absent means images
   * render as nothing (the corpus has none). */
  resolveMedia?: (id: unknown) => Promise<ResolvedMedia | null>
}

const escapeText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const escapeAttr = (s: string) => escapeText(s).replace(/"/g, '&quot;')

const plainText = (nodes: LexicalNode[]): string =>
  nodes.map((n) => (typeof n.text === 'string' ? n.text : plainText(n.children ?? []))).join('')

const inline = (nodes: LexicalNode[], opts: ArticleHtmlOptions): string =>
  nodes
    .map((node) => {
      if (node.type === 'text') {
        let out = escapeText(node.text ?? '')
        const format = typeof node.format === 'number' ? node.format : 0
        if (format & CODE) out = `<code>${out}</code>`
        if (format & ITALIC) out = `<em>${out}</em>`
        if (format & BOLD) out = `<strong>${out}</strong>`
        return out
      }
      if (node.type === 'link' || node.type === 'autolink') {
        const url = String((node.fields as { url?: unknown })?.url ?? '')
        // Blank a disallowed protocol, keep the words. escapeAttr only escapes
        // & < > " — none of which appear in `javascript:alert(1)` — so without
        // this the URL reaches the static sites verbatim.
        const href = isSafeUrl(url) ? escapeAttr(url) : ''
        return `<a href="${href}">${inline(node.children ?? [], opts)}</a>`
      }
      if (node.type === 'linebreak') return '<br />'
      if (opts.strict) throw new Error(`articleHtml: unrenderable inline node '${node.type}'`)
      return ''
    })
    .join('')

/** One `<p>` per paragraph child, for containers whose paragraphs sit on their
 * own indented lines (keyboxes, blockquotes). */
const indentedParagraphs = (nodes: LexicalNode[], opts: ArticleHtmlOptions): string =>
  nodes
    .filter((n) => n.type === 'paragraph')
    .map((p) => `  <p>${inline(p.children ?? [], opts)}</p>`)
    .join('\n')

const tableRow = (row: LexicalNode, opts: ArticleHtmlOptions): string => {
  const cells = (row.children ?? [])
    .map((cell) => {
      const tag = (cell.headerState ?? 0) > 0 ? 'th' : 'td'
      // Cell content is one or more paragraphs; the site writes cells inline.
      const body = (cell.children ?? []).map((p) => inline(p.children ?? [], opts)).join('')
      return `<${tag}>${body}</${tag}>`
    })
    .join('')
  return `<tr>${cells}</tr>`
}

const table = (node: LexicalNode, opts: ArticleHtmlOptions): string => {
  const rows = node.children ?? []
  const isHeader = (row: LexicalNode) =>
    (row.children ?? []).length > 0 && (row.children ?? []).every((c) => (c.headerState ?? 0) > 0)
  const headerRows = rows.filter(isHeader)
  const bodyRows = rows.filter((r) => !isHeader(r))
  const section = (name: string, sectionRows: LexicalNode[]) =>
    sectionRows.length
      ? `  <${name}>\n${sectionRows.map((r) => `    ${tableRow(r, opts)}`).join('\n')}\n  </${name}>\n`
      : ''
  return (
    `<div class="table-scroll">\n<table>\n` +
    section('thead', headerRows) +
    section('tbody', bodyRows) +
    `</table>\n</div>`
  )
}

const banner = (fields: Record<string, unknown>, opts: ArticleHtmlOptions): string => {
  const label = typeof fields.label === 'string' && fields.label ? fields.label : null
  const content = (fields.content as { root?: { children?: LexicalNode[] } })?.root?.children ?? []
  return (
    `<div class="keybox">\n` +
    (label ? `  <span class="label">${escapeText(label)}</span>\n` : '') +
    indentedParagraphs(content, opts) +
    `\n</div>`
  )
}

const block = async (node: LexicalNode, opts: ArticleHtmlOptions): Promise<string> => {
  const fields = node.fields ?? {}
  const blockType = fields.blockType
  if (blockType === 'banner') return banner(fields, opts)
  if (blockType === 'code') {
    // Emitted verbatim, not escaped: the code field holds the display-ready
    // markup, including the hand-written `<span class="code-*">` highlights
    // the pre-CMS articles carry. Escaping here would print those spans as
    // text on every article page.
    return `<pre><code>${String(fields.code ?? '')}</code></pre>`
  }
  if (blockType === 'mediaBlock') {
    const media = await opts.resolveMedia?.(fields.media)
    if (!media) return ''
    return `<figure><img src="${escapeAttr(media.url)}" alt="${escapeAttr(media.alt)}" loading="lazy" /></figure>`
  }
  if (opts.strict) throw new Error(`articleHtml: unrenderable block '${String(blockType)}'`)
  return ''
}

const topLevel = async (node: LexicalNode, opts: ArticleHtmlOptions): Promise<string> => {
  switch (node.type) {
    case 'paragraph':
      return `<p>${inline(node.children ?? [], opts)}</p>`
    case 'heading': {
      const tag = node.tag ?? 'h2'
      // Only h2 carries an anchor: the pre-CMS articles never id anything
      // else, and the site's table of contents reads h2 alone.
      const id = tag === 'h2' ? ` id="${headingId(plainText(node.children ?? []))}"` : ''
      return `<${tag}${id}>${inline(node.children ?? [], opts)}</${tag}>`
    }
    case 'list': {
      const tag = node.tag === 'ol' ? 'ol' : 'ul'
      const items = (node.children ?? [])
        .map((li) => `  <li>${inline(li.children ?? [], opts)}</li>`)
        .join('\n')
      return `<${tag}>\n${items}\n</${tag}>`
    }
    case 'quote':
      return `<blockquote>\n${indentedParagraphs(node.children ?? [], opts)}\n</blockquote>`
    case 'table':
      return table(node, opts)
    case 'block':
      return block(node, opts)
    case 'horizontalrule':
      return '<hr />'
    default:
      if (opts.strict) throw new Error(`articleHtml: unrenderable node '${node.type}'`)
      return ''
  }
}

/** The article body as the website's own HTML: top-level elements separated by
 * a blank line, exactly as the hand-written source files are laid out. */
export const articleHtml = async (
  content: { root?: { children?: LexicalNode[] } } | null | undefined,
  opts: ArticleHtmlOptions = {},
): Promise<string> => {
  const children = content?.root?.children ?? []
  const parts: string[] = []
  for (const node of children) parts.push(await topLevel(node, opts))
  return parts.filter((p) => p !== '').join('\n\n')
}
