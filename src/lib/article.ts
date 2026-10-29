/**
 * Article documents as the reading page uses them.
 *
 * The database row (`article_docs`) holds every language of one article. A
 * locale's body is either `sections` (a lecture: a title and paragraphs each) or
 * `paragraphs` (a story). The page turns either into one flat list of blocks, so
 * pagination and rendering have a single shape to deal with.
 */
export interface ArticleNode {
  /** `h` heading, `p` paragraph */
  t: 'h' | 'p'
  text: string
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

/** A locale's body as a flat list of blocks. */
export function nodesOf(body: ArticleLocale): ArticleNode[] {
  if (body.sections?.length) {
    return body.sections.flatMap((section) => [
      { t: 'h' as const, text: section.title },
      ...section.paragraphs.map((text) => ({ t: 'p' as const, text }))
    ])
  }
  return (body.paragraphs ?? []).map((text) => ({ t: 'p' as const, text }))
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
