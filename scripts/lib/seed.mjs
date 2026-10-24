/**
 * seed.mjs — the seed-file shape shared by the exporter and the importer.
 *
 * The seed files are the **import source** for the Supabase content tables
 * (planning/performance-and-content-refactor.md §14.2). They are committed to
 * git and never deployed: they exist so the database can be rebuilt from source
 * control without re-parsing Markdown and manifests.
 *
 * Layout — one shared file plus one thin file per target language:
 *
 *   seed/names.json      { "<entity_id>": { en: "hello", ro: "salut", … } }
 *   seed/units.<lang>.json  [ { i, term, ipa, audio, read } ]
 *   seed/articles.json   [ { entity_id, locale, title, summary, body, status, … } ]
 *   seed/topics.json     [ { track, chapter, topic, title, order, … } ]
 *
 * `names` is the same 9-language map in every language's rows, so it is stored
 * once and joined by `entity_id` — that is the −69% measured in §14.2. Each
 * per-language file carries only the fields that actually differ per language.
 */

/** Bump when the seed shape changes; the importer refuses a mismatch. */
export const SEED_SCHEMA = 1

/** Directory (repo-relative) the seed files are written to. */
export const SEED_DIR = 'seed'

/** The nine site languages, in the canonical order used everywhere. */
export const SEED_LOCALES = ['en', 'es', 'it', 'fr', 'de', 'ru', 'hu', 'pt', 'ro']

/** File name for one target language's unit rows. */
export function unitsFile(locale) {
  return `units.${locale}.json`
}

/**
 * A unit row as stored per language. Deliberately terse keys: these files are
 * read by a script, never by a human, and the short names measurably shrink the
 * payload (§14.2).
 *
 *   i     entity_id — the join key to names.json and articles.json
 *   term  the word/phrase in this language
 *   ipa   hand-transcribed pronunciation, or null
 *   audio absolute URL of the short recording, or null when not generated
 *   read  absolute URL of the full-article recording, or null
 *   order 0-based position within the topic, from the sidebar's item list
 */
export function unitRow({ entityId, term, ipa, audio, read, order }) {
  const row = { i: entityId, term }
  if (ipa) row.ipa = ipa
  if (audio) row.audio = audio
  if (read) row.read = read
  if (order !== undefined && order !== null) row.order = order
  return row
}

/**
 * An article row — one per (entity_id, locale). `body` is the Markdown body
 * with the front matter stripped; `source_sha` lets the importer skip unchanged
 * rows on a re-import.
 */
export function articleRow({ entityId, locale, title, summary, body, status, order, related, sourceSha }) {
  const row = { entity_id: entityId, locale, title, body, status }
  if (summary) row.summary = summary
  if (order !== undefined && order !== null) row.order = order
  if (related && related.length) row.related = related
  if (sourceSha) row.source_sha = sourceSha
  return row
}

/** A topic row — the structure layer the sidebar queries instead of bundling. */
export function topicRow({ track, chapter, topic, title, order, level, words }) {
  const row = { track, chapter, topic, title, order }
  if (level) row.level = level
  if (words !== undefined) row.words = words
  return row
}
