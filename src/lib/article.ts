/**
 * Article documents as the reading page uses them.
 *
 * The database row (`article_docs`) holds every language of one article. A
 * locale's body is either `sections` (a lecture: a title and paragraphs each) or
 * `paragraphs` (a story). The page turns either into one flat list of blocks, so
 * pagination and rendering have a single shape to deal with.
 */
export interface ArticleNode {
  /** `h` heading · `p` paragraph · `ul` / `ol` list · `dialog` · `table` */
  t: 'h' | 'p' | 'ul' | 'ol' | 'dialog' | 'table'
  /** The text of the block (a list, dialog or table: all its text joined), for length and search. */
  text: string
  /** `ul` / `ol`: one string per item */
  items?: string[]
  /** `dialog`: one entry per spoken line */
  lines?: { speaker: string; text: string }[]
  /** `table`: the table as sanitised HTML (see `safeHtml`) */
  html?: string
}

/**
 * The typed content of a section. Text is plain with two inline marks, **bold**
 * and `code`; only a table is HTML, because a table cannot be written as text.
 */
export type ArticleBlock =
  | { type: 'paragraphs'; paragraphs: string[] }
  | { type: 'bullets'; items: string[]; ordered?: boolean }
  | { type: 'dialog'; lines: { speaker: string; text: string }[] }
  | { type: 'table'; html: string }

/** A section: a title (one reading page) and its content, as `blocks` or, in older articles, plain `paragraphs`. */
export interface ArticleSection {
  title: string
  paragraphs?: string[]
  blocks?: ArticleBlock[]
}

export interface ArticleLocale {
  title: string
  summary?: string
  status?: string
  sections?: ArticleSection[]
  paragraphs?: string[]
}

export interface ArticleRow {
  entity_id: string
  track: string
  topic: string
  targets: string[] | null
  related: unknown[]
  meta: { grammar?: string[]; minutes?: number; paragraphsPerPage?: number; terms?: Record<string, string>; context?: Record<string, string> }
  languages: string[]
  locales: Record<string, ArticleLocale>
}

/** One language of an article, ready to paginate and render. */
export interface ArticleDoc {
  locale: string
  title: string
  summary: string
  status: string
  minutes: number | null
  paragraphsPerPage: number
  terms: Record<string, string>
  nodes: ArticleNode[]
}

/** Tags a table may use. Attributes are never allowed, so a link, image or handler cannot get in. */
const HTML_TAGS = new Set(['table', 'thead', 'tbody', 'tr', 'th', 'td', 'strong', 'em', 'code', 'br'])

const escapeText = (text: string): string =>
  text.replace(/&(?!(?:amp|lt|gt|quot|#39|nbsp);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Table HTML made safe to render with v-html: only the bare tags in HTML_TAGS
 * survive; any other `<` (a tag with attributes, a script, a comment) is shown as text.
 */
export function safeHtml(input: string): string {
  let out = ''
  let last = 0
  for (const match of input.matchAll(/<(\/?)([a-z][a-z0-9]*)\s*(\/?)>/gi)) {
    const name = match[2].toLowerCase()
    out += escapeText(input.slice(last, match.index))
    out += HTML_TAGS.has(name) ? `<${match[1]}${name}${name === 'br' ? ' /' : ''}>` : escapeText(match[0])
    last = (match.index ?? 0) + match[0].length
  }
  return out + escapeText(input.slice(last))
}

/** The text of an HTML block, without tags. */
const plainText = (html: string): string => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

const paragraphNode = (text: string): ArticleNode => ({ t: 'p', text })

/** One typed block as reading blocks (a paragraphs block is one block per paragraph). */
function blockNodes(block: ArticleBlock): ArticleNode[] {
  switch (block.type) {
    case 'paragraphs':
      return block.paragraphs.map(paragraphNode)
    case 'bullets':
      return [{ t: block.ordered ? 'ol' : 'ul', text: block.items.join(' '), items: block.items }]
    case 'dialog':
      return [{ t: 'dialog', text: block.lines.map((line) => `${line.speaker}: ${line.text}`).join(' '), lines: block.lines }]
    case 'table':
      return [{ t: 'table', text: plainText(block.html), html: safeHtml(block.html) }]
    default:
      return []
  }
}

/** A locale's body as a flat list of blocks. */
export function nodesOf(body: ArticleLocale): ArticleNode[] {
  if (body.sections?.length) {
    return body.sections.flatMap((section) => [
      { t: 'h' as const, text: section.title },
      ...(section.paragraphs ?? []).map(paragraphNode),
      ...(section.blocks ?? []).flatMap(blockNodes)
    ])
  }
  return (body.paragraphs ?? []).map(paragraphNode)
}

/** Every language of a row as docs. */
export function docsOf(row: ArticleRow): ArticleDoc[] {
  return Object.entries(row.locales).map(([locale, body]) => ({
    locale,
    title: body.title,
    summary: body.summary ?? '',
    status: body.status ?? 'draft',
    minutes: row.meta.minutes ?? null,
    paragraphsPerPage: row.meta.paragraphsPerPage ?? 1,
    terms: row.meta.terms ?? {},
    nodes: nodesOf(body)
  }))
}

export interface InlinePart {
  mark: 'b' | 'c' | null
  text: string
}

/** Split a paragraph at its `**bold**` and `code` marks. */
export function inlineParts(text: string): InlinePart[] {
  const parts: InlinePart[] = []
  const mark = /\*\*([^*]+)\*\*|`([^`]+)`/g
  let last = 0
  for (let m = mark.exec(text); m; m = mark.exec(text)) {
    if (m.index > last) parts.push({ mark: null, text: text.slice(last, m.index) })
    parts.push(m[1] !== undefined ? { mark: 'b', text: m[1] } : { mark: 'c', text: m[2] })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ mark: null, text: text.slice(last) })
  return parts
}

/** The track a topic code belongs to, before the row has loaded. */
export function trackOfTopic(topic: string): string {
  if (topic.startsWith('ST')) return 'stories'
  if (topic.startsWith('LT')) return 'lectures'
  return 'dictionary'
}
