#!/usr/bin/env node
/**
 * alphabet-to-articles.mjs — turn the alphabet data into lecture article files.
 *
 *   node scripts/alphabet-to-articles.mjs            write content/lectures/**
 *   node scripts/alphabet-to-articles.mjs --dry-run  report only
 *   node scripts/alphabet-to-articles.mjs --check    exit 1 if any article is missing a generated page
 *   node scripts/alphabet-to-articles.mjs --overwrite  regenerate pages that already exist
 *
 * The alphabet data (src/data/alphabets/<lang>.json) stays the authoring
 * surface for the STRUCTURED facts — glyph, IPA, example word, pronunciation
 * variations — and for the generated prose of each page. This script writes
 * that prose into the article files:
 *
 *   content/lectures/<TOPIC>/<CODE>.json     (scripts/lib/articles.mjs, one file, every language)
 *
 * One page = one section, which is the pagination contract the reading view
 * uses. The generated locales are written; any other language already in the
 * file (a translation) is left exactly as it is.
 *
 * Idempotent: the output is deterministic, so a re-run rewrites only what changed.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { articlePath, readArticle, serialize, writeArticle } from './lib/articles.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ALPHABETS = join(ROOT, 'src', 'data', 'alphabets')
const SIDEBARS = join(ROOT, 'src', 'data', 'sidebars', 'library', 'lectures', 'sidebar.json')
const CONTENT = join(ROOT, 'content')

const dryRun = process.argv.includes('--dry-run')
const checkOnly = process.argv.includes('--check')
const overwrite = process.argv.includes('--overwrite')

const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'))

/** Section order in the article — the reading order the renderer uses. */
const SECTION_ORDER = ['sound', 'howToSay', 'spelling', 'compare']

/** Every registered explanation locale, in the canonical order. */
const LOCALES = ['en', 'es', 'it', 'fr', 'de', 'ru', 'hu', 'pt', 'ro']

/** The value after a flag, or null: `--locales de,es` -> 'de,es'. */
const flagValue = (name) => {
  const at = process.argv.indexOf(name)
  return at === -1 ? null : (process.argv[at + 1] ?? null)
}

/**
 * Locales a page is exported in. English by default: the other languages' prose
 * in the alphabet JSON is only exported for the alphabets whose pages were
 * authored natively with the current writing rules (`--locales all` or a list,
 * with `--target xx`). `LOCALES` above still names every site language, because
 * `terms` must cover all of them.
 */
const requested = flagValue('--locales')
const DOC_LOCALES = !requested ? ['en'] : requested === 'all' ? LOCALES : requested.split(',').filter((l) => LOCALES.includes(l))

/** Only the items that teach this language: `--target ro`. */
const TARGET_ONLY = flagValue('--target')

/** Only these item codes: `--code L022,L030` (so `--overwrite` leaves hand-edited pages alone). */
const CODE_ONLY = flagValue('--code')?.split(',') ?? null

/**
 * The per-locale names of one item, read from its media manifest.
 *
 * A letter's name is the glyph in every language, but a GROUP's is not — the
 * Romanian "ea" is "ea in seară (evening)" in English. The manifest is the
 * authority for those, and the shared-article invariant requires the article's
 * `terms` to match it exactly.
 */
function manifestNames(code) {
  const manifest = manifestFor(code)
  if (!manifest) return null
  const names = {}
  for (const [locale, value] of Object.entries(manifest.locales ?? {})) {
    if (typeof value?.name === 'string' && value.name) names[locale] = value.name
  }
  return Object.keys(names).length ? names : null
}

/**
 * The one-line summary under the article title.
 *
 * Deliberately the legacy `note`'s first line, not the `sound` page: the sound
 * page is the first thing the reader sees, so repeating its opening sentence
 * above it would say the same thing twice. Most entries have no note, and an
 * empty summary is honest — the article itself is the summary.
 */
function summaryOf(entry, locale) {
  const note = entry.note?.[locale] ?? entry.note?.en ?? ''
  return note.split('\n')[0].slice(0, 200)
}

/** The pages of one locale as article sections: one section per authored page. */
function sectionsOf(entry, locale) {
  // A locale without its own pages gets none: falling back to English would
  // publish English prose as if it were that language.
  const sections = entry.sections?.[locale] ?? {}
  const out = []
  for (const key of SECTION_ORDER) {
    const section = sections[key]
    if (!section?.text) continue
    out.push({
      title: section.title || key,
      paragraphs: section.text.trim().split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    })
  }
  return out
}

/** item code -> its media manifest, wherever the folder sits (an item keeps its
 *  folder when the sidebar moves it between topics, so the path says nothing). */
const manifestIndex = new Map()
function indexManifests(dir) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) indexManifests(full)
    else if (entry.name === 'item.json') {
      const manifest = readJson(full)
      if (manifest.code && (manifest.kind === 'letter' || manifest.kind === 'article')) {
        manifestIndex.set(manifest.code, manifest)
      }
    }
  }
}
indexManifests(join(ROOT, 'media', 'lectures'))
const manifestFor = (code) => manifestIndex.get(code) ?? null

/** Every phonetic topic; each item teaches the language its manifest names
 *  (`target`), unless the topic itself is pinned to one. */
function phoneticTopics() {
  const sidebar = readJson(SIDEBARS)
  const topics = []
  for (const section of sidebar.sections ?? []) {
    for (const topic of section.topics ?? []) {
      if (topic.phonetic !== true || topic.mode !== 'directional') continue
      topics.push({ code: topic.code, target: topic.target ?? null, items: topic.items ?? [] })
    }
  }
  return topics
}

/** One language's alphabet entries, by item code (cached). */
const alphabetCache = new Map()
function alphabetEntries(target) {
  if (alphabetCache.has(target)) return alphabetCache.get(target)
  const file = join(ALPHABETS, `${target}.json`)
  let byCode = null
  if (existsSync(file)) {
    const data = readJson(file)
    byCode = new Map()
    for (const entry of [...(data.letters ?? []), ...(data.groups ?? [])]) byCode.set(entry.code, entry)
  }
  alphabetCache.set(target, byCode)
  return byCode
}

function main() {
  const topics = phoneticTopics()
  let entries = 0
  let skipped = 0
  let pages = 0
  let stale = 0
  let written = 0

  for (const topic of topics) {
    topic.items.forEach((code, index) => {
      const target = topic.target ?? manifestFor(code)?.target
      if (TARGET_ONLY && target !== TARGET_ONLY) return
      if (CODE_ONLY && !CODE_ONLY.includes(code)) return
      const byCode = target ? alphabetEntries(target) : null
      if (!byCode) return
      const entry = byCode.get(code)
      if (!entry) {
        skipped += 1
        return
      }
      entries += 1
      const glyph = entry.glyph ?? entry.code
      const path = articlePath(CONTENT, 'lectures', topic.code, code)
      const existing = existsSync(path) ? readArticle(path) : null
      // A letter's "term" is its glyph in every language, but a group's name is
      // per-locale ("ea in seară (evening)"). The manifest is the authority —
      // the shared-article invariant requires an exact match.
      const names = manifestNames(code)
      const article = existing ?? { entity_id: `${topic.code}:${code}`, locales: {} }
      article.order = index
      article.targets = [target]
      article.terms = Object.fromEntries(LOCALES.map((l) => [l, names?.[l] ?? glyph]))

      for (const locale of DOC_LOCALES) {
        const sections = sectionsOf(entry, locale)
        // A locale with no prose would produce an empty page — skip it so the
        // article list stays honest about what actually exists.
        if (!sections.length) continue
        pages += 1
        if (article.locales[locale] && !overwrite) continue
        article.locales[locale] = {
          title: names?.[locale] ?? glyph,
          summary: summaryOf(entry, locale),
          status: article.locales[locale]?.status ?? 'draft',
          sections
        }
      }

      if (!Object.keys(article.locales).length) return
      const changed = !existing || serialize(existing) !== serialize(article) || readFileSync(path, 'utf8') !== serialize(article)
      if (!changed) return
      stale += 1
      if (dryRun || checkOnly) return
      if (writeArticle(path, article)) written += 1
    })
  }

  const summary = `${entries} entries · ${pages} page(s) · ${stale} to write`
  if (checkOnly) {
    console.log(`alphabet-to-articles: ${summary}`)
    if (stale) {
      console.error('alphabet-to-articles: content/lectures is stale — re-run without --check')
      process.exit(1)
    }
    return
  }
  if (dryRun) {
    console.log(`alphabet-to-articles: ${summary} (dry run — nothing written)`)
    return
  }
  console.log(`alphabet-to-articles: ${summary} · ${written} written`)
  if (skipped) console.log(`alphabet-to-articles: ${skipped} sidebar item(s) had no alphabet entry`)
}

main()
