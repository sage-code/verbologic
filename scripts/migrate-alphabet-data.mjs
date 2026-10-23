/**
 * One-shot migration: seed src/data/alphabets/<lang>.json from the existing
 * phonetic manifests.
 *
 * The manifests already hold the expensive, hand-checked facts — the glyph, the
 * IPA transcription, the example word and the nine-locale explanation. This
 * script lifts them into the per-language data file that becomes the authoring
 * surface, so nothing has to be re-transcribed.
 *
 *   node scripts/migrate-alphabet-data.mjs [--apply]
 *
 * Without --apply it prints what it would write.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOCALES } from './lib/locales.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SIDEBAR = join(ROOT, 'src', 'data', 'sidebars', 'library', 'lectures', 'sidebar.json')
const MEDIA = join(ROOT, 'media', 'lectures')
const OUT_DIR = join(ROOT, 'src', 'data', 'alphabets')
const apply = process.argv.includes('--apply')

/** Topic code → which array of the language file its items belong to. */
const GROUPS_TOPICS = new Set(['LT01T02', 'LT01T08'])

/**
 * A single alphabetic character is a LETTER; anything else (a digraph like
 * "th", a pattern like "-ough", a phrase like "ea in seară") is a GROUP.
 * English's LT01T07 mixes both in one topic, so the glyph decides.
 */
const isLetterGlyph = (glyph) => typeof glyph === 'string' && /^\p{L}$/u.test(glyph.trim())

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const sidebar = readJson(SIDEBAR)
const chapter = sidebar.sections.find((s) => s.code === 'LT01')

/** lang → { lang, title, letters[], groups[] } */
const byLang = new Map()

for (const topic of chapter.topics) {
  if (topic.phonetic !== true) continue
  const sourceLang = topic.langs?.[0]
  if (!sourceLang) {
    console.warn(`skip ${topic.code}: phonetic topic without a single source language`)
    continue
  }
  const bucket = byLang.get(sourceLang) ?? { lang: sourceLang, title: topic.names, letters: [], groups: [] }
  byLang.set(sourceLang, bucket)

  for (const id of topic.items) {
    const file = join(MEDIA, chapter.code, topic.code, id, 'item.json')
    if (!existsSync(file)) {
      console.warn(`skip ${topic.code}/${id}: no manifest`)
      continue
    }
    const m = readJson(file)
    const meta = m.metadata?.[sourceLang] ?? {}
    const ipa = m.pronunciation?.[sourceLang]?.ipa ?? null
    if (!ipa) console.warn(`warn ${topic.code}/${id}: no IPA for ${sourceLang}`)
    const glyph = m.names?.[sourceLang] ?? null

    // A topic that is explicitly about groups always lands in groups[]; a
    // mixed topic (English LT01T07) is split by glyph shape.
    const target = GROUPS_TOPICS.has(topic.code) || !isLetterGlyph(glyph) ? bucket.groups : bucket.letters

    target.push({
      code: id,
      glyph,
      ipa,
      letterName: meta.context ?? null,
      example: meta.example ?? null,
      note: m.description ?? {}
    })
  }
}

if (!apply) {
  for (const [lang, data] of byLang) {
    console.log(
      `${lang}: ${data.letters.length} letter(s), ${data.groups.length} group(s) → src/data/alphabets/${lang}.json`
    )
  }
  console.log('\n(dry run — pass --apply to write)')
  process.exit(0)
}

mkdirSync(OUT_DIR, { recursive: true })
for (const [lang, data] of byLang) {
  // Keep the nine-locale note maps in registry order so diffs stay stable.
  const ordered = {
    lang,
    title: Object.fromEntries(LOCALES.map((l) => [l, data.title[l] ?? null])),
    letters: data.letters.map((e) => ({
      ...e,
      note: Object.fromEntries(LOCALES.map((l) => [l, e.note[l] ?? null]))
    })),
    groups: data.groups.map((e) => ({
      ...e,
      note: Object.fromEntries(LOCALES.map((l) => [l, e.note[l] ?? null]))
    }))
  }
  const out = join(OUT_DIR, `${lang}.json`)
  writeFileSync(out, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8')
  console.log(`wrote ${out} (${ordered.letters.length} letters, ${ordered.groups.length} groups)`)
}
