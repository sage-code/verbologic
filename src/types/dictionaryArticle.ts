export type DictionaryLocale = 'en' | 'ro' | 'de' | 'ru' | 'it' | 'es' | 'fr' | 'hu' | 'pt'
export type DictionaryTrackLanguage = 'en' | 'ro'

export type DictionaryArticleBlock =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered?: boolean; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }

export interface DictionaryArticleDocument {
  schema: 1
  article: string
  trackLang: DictionaryTrackLanguage
  topic: string
  locale: DictionaryLocale
  title: string
  summary?: string
  status: 'draft' | 'reviewed'
  sourceSha?: string
  reviewedAt?: string
  related: string[]
  order: number
  minutes?: number
  blocks: DictionaryArticleBlock[]
}

const LOCALES = new Set<string>(['en', 'ro', 'de', 'ru', 'it', 'es', 'fr', 'hu', 'pt'])
const TRACK_LANGUAGES = new Set<string>(['en', 'ro'])

function isDictionaryLocale(value: string): value is DictionaryLocale {
  return LOCALES.has(value)
}

function isTrackLanguage(value: string): value is DictionaryTrackLanguage {
  return TRACK_LANGUAGES.has(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`Dictionary article field '${field}' must be a non-empty string`)
  }
  return value
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  return requiredString(value, field)
}

function parseStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new TypeError(`Dictionary article field '${field}' must be an array`)
  return value.map((item, index) => requiredString(item, `${field}[${index}]`))
}

function parseBlock(value: unknown, index: number): DictionaryArticleBlock {
  if (!isRecord(value)) throw new TypeError(`Dictionary article block ${index} must be an object`)

  switch (value.type) {
    case 'heading':
      if (value.level !== 2 && value.level !== 3) {
        throw new TypeError(`Dictionary article heading ${index} must have level 2 or 3`)
      }
      return { type: 'heading', level: value.level, text: requiredString(value.text, `blocks[${index}].text`) }
    case 'paragraph':
      return { type: 'paragraph', text: requiredString(value.text, `blocks[${index}].text`) }
    case 'list':
      if (value.ordered !== undefined && typeof value.ordered !== 'boolean') {
        throw new TypeError(`Dictionary article list ${index} 'ordered' must be a boolean`)
      }
      return {
        type: 'list',
        ordered: value.ordered,
        items: parseStringArray(value.items, `blocks[${index}].items`)
      }
    case 'table':
      {
        const headers = parseStringArray(value.headers, `blocks[${index}].headers`)
        if (headers.length === 0 || !Array.isArray(value.rows)) {
          throw new TypeError(`Dictionary article table ${index} must have headers and rows`)
        }
        const rows = value.rows.map((row, rowIndex) => {
          if (
            !Array.isArray(row) ||
            row.length !== headers.length ||
            row.some((cell) => typeof cell !== 'string')
          ) {
            throw new TypeError(`Dictionary article table ${index} row ${rowIndex} must match the header width`)
          }
          return row
        })
        return { type: 'table', headers, rows }
      }
    default:
      throw new TypeError(`Dictionary article block ${index} has an unsupported type`)
  }
}

export function parseDictionaryArticle(
  value: unknown,
  expected: {
    article: string
    trackLang: string
    topic: string
    locale: string
  }
): DictionaryArticleDocument {
  if (!isRecord(value)) throw new TypeError('Dictionary article must be a JSON object')
  if (value.schema !== 1) throw new TypeError('Dictionary article has an unsupported schema')

  const article = requiredString(value.article, 'article')
  const trackLang = requiredString(value.trackLang, 'trackLang')
  const topic = requiredString(value.topic, 'topic')
  const locale = requiredString(value.locale, 'locale')
  if (article !== expected.article || trackLang !== expected.trackLang || topic !== expected.topic || locale !== expected.locale) {
    throw new TypeError('Dictionary article metadata does not match its URL')
  }
  if (!isTrackLanguage(trackLang)) throw new TypeError(`Unsupported dictionary track language '${trackLang}'`)
  if (!isDictionaryLocale(locale)) throw new TypeError(`Unsupported dictionary article locale '${locale}'`)
  if (value.status !== undefined && value.status !== 'draft' && value.status !== 'reviewed') {
    throw new TypeError("Dictionary article status must be 'draft' or 'reviewed'")
  }
  const related = value.related === undefined ? [] : parseStringArray(value.related, 'related')
  const order = value.order === undefined ? 0 : value.order
  const minutes = value.minutes
  if (typeof order !== 'number' || !Number.isFinite(order)) {
    throw new TypeError("Dictionary article 'order' must be a finite number")
  }
  if (minutes !== undefined && (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0)) {
    throw new TypeError("Dictionary article 'minutes' must be a positive number")
  }
  if (!Array.isArray(value.blocks)) throw new TypeError("Dictionary article 'blocks' must be an array")

  return {
    schema: 1,
    article,
    trackLang,
    topic,
    locale,
    title: requiredString(value.title, 'title'),
    summary: optionalString(value.summary, 'summary'),
    status: value.status === 'reviewed' ? 'reviewed' : 'draft',
    sourceSha: optionalString(value.sourceSha, 'sourceSha'),
    reviewedAt: optionalString(value.reviewedAt, 'reviewedAt'),
    related,
    order,
    minutes,
    blocks: value.blocks.map(parseBlock)
  }
}
