/**
 * Article documents as the reading page uses them.
 *
 * The database row (`article_docs`) holds every language of one article. A
 * locale's body is either `sections` (a lecture: a title and paragraphs each) or
 * `paragraphs` (a story). The page turns either into one flat list of blocks, so
 * pagination and rendering have a single shape to deal with.
 */
export interface ArticleNode {
  /** `h` heading, `p` paragraph, `ul` / `ol` list, `table` table */
  t: 'h' | 'p' | 'ul' | 'ol' | 'table'
  /** The text of the block; for a list or table, all its text joined (length, search). */
  text: string
  /** `ul` / `ol`: one string per item */
  items?: string[]
  /** `table`: the header cells, then the body rows */
  headers?: string[]
  rows?: string[][]
}

export interface ArticleLocale {
  title: string
  summary?: string
  status?: string
  sections?: { title: string; paragraphs: string[] }[]
  paragraphs?: string[]
}

export interface ArticleRow {
  entity_id: string
  track: string
  topic: string
  targets: string[] | null
  related: unknown[]
  meta: { minutes?: number; paragraphsPerPage?: number; terms?: Record<string, string>; context?: Record<string, string> }
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

const tableCells = (line: string): string[] =>
  line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((cell) => cell.trim())

/**
 * One paragraph string as a block. Block markup stays inside the string, so the
 * stored format is unchanged: a paragraph whose lines all start with `|` is a
 * table (header row, `| --- |` rule, body rows), all start with `- ` a bullet
 * list, all start with `1. ` a numbered list. Anything else is a paragraph.
 */
export function blockOf(text: string): ArticleNode {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length >= 2 && lines.every((line) => line.startsWith('|'))) {
    const body = lines.map(tableCells).filter((cells) => !cells.every((cell) => /^:?-{3,}:?$/.test(cell)))
    const [headers = [], ...rows] = body
    return { t: 'table', text: body.flat().join(' '), headers, rows }
  }
  if (lines.length >= 1 && lines.every((line) => /^[-*]\s+/.test(line))) {
    const items = lines.map((line) => line.replace(/^[-*]\s+/, ''))
    return { t: 'ul', text: items.join(' '), items }
  }
  if (lines.length >= 1 && lines.every((line) => /^\d+\.\s+/.test(line))) {
    const items = lines.map((line) => line.replace(/^\d+\.\s+/, ''))
    return { t: 'ol', text: items.join(' '), items }
  }
  return { t: 'p', text }
}

/** A locale's body as a flat list of blocks. */
export function nodesOf(body: ArticleLocale): ArticleNode[] {
  if (body.sections?.length) {
    return body.sections.flatMap((section) => [
      { t: 'h' as const, text: section.title },
      ...section.paragraphs.map(blockOf)
    ])
  }
  return (body.paragraphs ?? []).map(blockOf)
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
