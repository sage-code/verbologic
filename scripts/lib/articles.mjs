/**
 * Article files: one JSON per story or lecture item, every language inside.
 *
 *   content/stories/<TOPIC>/<CODE>.json
 *   content/lectures/<TOPIC>/<ID>.json
 *
 * See planning/content-in-database.md §5. This module is the ONLY writer of
 * those files in Node (scripts/lib/articles.py is its twin for Python), so the
 * canonical form lives in one place:
 *
 *   - 2-space indentation, final newline, LF line endings;
 *   - keys in the fixed order of ARTICLE_KEYS / LOCALE_KEYS, locales in the
 *     navigation.json order, then any other key alphabetically;
 *   - non-ASCII text stays readable (no \uXXXX escapes), so IPA and accents
 *     diff like prose.
 *
 * A locale holds either `sections` (a document with `##` headings, one reading
 * page per section) or `paragraphs` (no headings, one page per paragraph
 * group). Inline markup stays inside the strings; block markup (lists, tables,
 * code, directives, quotes) is refused so nothing is lost silently.
 */
import grayMatter from 'gray-matter'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { LOCALES } from './locales.mjs'

/** Article-level keys, in file order. */
export const ARTICLE_KEYS = [
  'entity_id', 'targets', 'order', 'minutes', 'paragraphsPerPage', 'terms', 'related', 'video', 'image', 'context', 'locales'
]
/** Per-language keys, in file order. */
export const LOCALE_KEYS = [
  'title', 'summary', 'status', 'sourceSha', 'reviewedAt', 'sections', 'paragraphs'
]
/** Front-matter keys that follow from the path, so the file does not store them. */
export const DERIVED_KEYS = ['track', 'topic', 'article', 'locale']
const ARTICLE_META = ['order', 'minutes', 'paragraphsPerPage', 'terms', 'related', 'video', 'image', 'context']
const LOCALE_META = ['title', 'summary', 'status', 'sourceSha', 'reviewedAt']

const rank = (keys) => (a, b) => {
  const ia = keys.indexOf(a)
  const ib = keys.indexOf(b)
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 1e6 : ia) - (ib === -1 ? 1e6 : ib)
  return a < b ? -1 : a > b ? 1 : 0
}

/** Reorder an article into canonical key order (without changing any value). */
export function canonicalize(article) {
  const out = {}
  for (const key of Object.keys(article).sort(rank(ARTICLE_KEYS))) {
    if (key !== 'locales') {
      out[key] = article[key]
      continue
    }
    const locales = {}
    for (const code of Object.keys(article.locales).sort(rank(LOCALES))) {
      const doc = article.locales[code]
      const sorted = {}
      for (const k of Object.keys(doc).sort(rank(LOCALE_KEYS))) sorted[k] = doc[k]
      locales[code] = sorted
    }
    out.locales = locales
  }
  return out
}

/** The exact text of an article file. */
export function serialize(article) {
  return JSON.stringify(canonicalize(article), null, 2) + '\n'
}

export function readArticle(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** True when the file on disk is byte-identical to its canonical form. */
export function isCanonical(path) {
  const raw = readFileSync(path, 'utf8')
  return raw === serialize(JSON.parse(raw))
}

/** Write an article in canonical form; returns false when the file was already up to date. */
export function writeArticle(path, article) {
  mkdirSync(dirname(path), { recursive: true })
  const text = serialize(article)
  if (existsSync(path) && readFileSync(path, 'utf8') === text) return false
  writeFileSync(path, text, { encoding: 'utf8' })
  return true
}

export function articlePath(contentRoot, track, topic, id) {
  return join(contentRoot, track, topic, `${id}.json`)
}

// ── Markdown <-> structured body ─────────────────────────────────────────────

const NL = String.fromCharCode(10)
const BLOCK_MARKUP = /^(\s*([-*+]|\d+[.)])\s|\s*>|\s*```|\s*~~~|\s*\|.*\||\s*::|\s*(---|\*\*\*|___)\s*$|\s*!\[)/

/**
 * Split a Markdown body into `sections` (it has `##` headings) or `paragraphs`.
 * A paragraph is a run of non-blank lines; a heading may sit directly above its
 * text. Throws on block markup other than `##` headings and plain paragraphs.
 */
export function parseBody(body) {
  const text = body.replace(/\r/g, '').trim()
  const sections = []
  let current = null
  let headed = false
  let buffer = []
  const flush = () => {
    const paragraph = buffer.join(NL).trim()
    buffer = []
    if (!paragraph) return
    const bad = paragraph.split(NL).find((line) => BLOCK_MARKUP.test(line))
    if (bad !== undefined) throw new Error(`block markup not supported: ${bad.slice(0, 50)}`)
    if (!current) {
      current = { paragraphs: [] }
      sections.push(current)
    }
    current.paragraphs.push(paragraph)
  }
  for (const line of text.split(NL)) {
    const heading = /^##\s+(.+)$/.exec(line)
    if (heading) {
      flush()
      if (!headed && current) throw new Error('text before the first heading')
      headed = true
      current = { title: heading[1].trim(), paragraphs: [] }
      sections.push(current)
    } else if (/^#{1,6}(\s|$)/.test(line)) {
      throw new Error(`heading level not supported: ${line.slice(0, 40)}`)
    } else if (!line.trim()) {
      flush()
    } else {
      buffer.push(line)
    }
  }
  flush()
  if (!headed) return { paragraphs: sections.length ? sections[0].paragraphs : [] }
  return { sections }
}

/** The Markdown body of one language (used by the round-trip check and the legacy reader). */
export function renderBody(doc) {
  const blank = NL + NL
  if (doc.sections) {
    return doc.sections.map((s) => [`## ${s.title}`, ...s.paragraphs].join(blank)).join(blank)
  }
  return (doc.paragraphs ?? []).join(blank)
}

/** Markdown with uniform spacing around `##` headings, for comparing two bodies. */
export function normalizeBody(text) {
  const lines = text.replace(/\r/g, '').trim().split(NL)
  const out = []
  for (const line of lines) {
    if (/^##\s/.test(line)) {
      if (out.length && out[out.length - 1] !== '') out.push('')
      out.push(line, '')
    } else if (line.trim() === '') {
      if (out.length && out[out.length - 1] !== '') out.push('')
    } else {
      out.push(line)
    }
  }
  return out.join(NL).trim()
}

/** One Markdown file (front matter + body) -> the pieces an article file needs. */
export function parseDoc(raw) {
  const { data, content } = grayMatter(raw)
  return { data, ...parseBody(content) }
}

/**
 * Fold the per-language documents of one article into a single article object.
 * `docs` maps locale -> { data, sections|paragraphs }. Returns { article, issues }.
 */
export function fold(docs) {
  const issues = []
  const first = docs.en ?? docs[Object.keys(docs)[0]]
  const article = { entity_id: first.data.entity_id }
  for (const key of ARTICLE_META) {
    const values = Object.entries(docs).filter(([, d]) => d.data[key] !== undefined)
    if (!values.length) continue
    const source = (docs.en && docs.en.data[key] !== undefined ? docs.en : values[0][1]).data[key]
    for (const [code, d] of values) {
      if (JSON.stringify(d.data[key]) !== JSON.stringify(source)) issues.push(`${key} differs in ${code}`)
    }
    article[key] = source
  }
  article.locales = {}
  for (const [code, d] of Object.entries(docs)) {
    const doc = {}
    for (const key of LOCALE_META) if (d.data[key] !== undefined && d.data[key] !== null) doc[key] = d.data[key]
    if (d.sections) doc.sections = d.sections
    else doc.paragraphs = d.paragraphs
    article.locales[code] = doc
  }
  return { article, issues }
}
