#!/usr/bin/env node
/**
 * validate-data.mjs — maintenance integrity checks over the decoupled data:
 *   - every entity: unique id, valid type/lang, well-formed audio URL (or null)
 *   - every menu route resolves to a page file (manual best-effort)
 *   - menu labels complete for every supported language
 *   - flags present on all 9 interface languages
 * Exits non-zero on any failure (used by `run release` / `run validate`).
 */
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ERRORS = []
const WARNINGS = []

const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf-8'))

/* ── entities ─────────────────────────────────────────────────────────── */
const entities = []
const sawId = new Set()
let withAudio = 0
let ttsQueue = 0

for (const file of [
  'ro_vocabulary.json', 'ro_questions.json', 'ro_imperative.json',
  'ro_sentences.json', 'ro_greetings.json', 'ro_alphabet.json', 'en_alphabet.json'
]) {
  const list = readJson(`public/data/entities/${file}`)
  for (const e of list) {
    entities.push(e)
    if (sawId.has(e.id)) ERRORS.push(`duplicate entity id: ${e.id}`)
    sawId.add(e.id)
    if (!e.id || !e.term) ERRORS.push(`entity missing id/term in ${file}`)
    if (!['word', 'sentence', 'question', 'imperative', 'letter', 'greeting'].includes(e.type)) {
      ERRORS.push(`bad type '${e.type}' on ${e.id}`)
    }
    if (!['ro', 'en'].includes(e.lang)) ERRORS.push(`bad lang '${e.lang}' on ${e.id}`)

    if (e.audio === null) ttsQueue++
    else if (typeof e.audio === 'string') {
      withAudio++
      if (!e.audio.startsWith('https://media.verbologic.com/audio/')) {
        ERRORS.push(`bad audio URL on ${e.id}: ${e.audio}`)
      }
      if (!e.audio.endsWith('.mp3')) ERRORS.push(`non-mp3 audio on ${e.id}`)
    } else ERRORS.push(`audio must be string|null on ${e.id}`)
  }
}

/* ── navigation ───────────────────────────────────────────────────────── */
const nav = readJson('src/data/navigation.json')
const langCount = nav.languages.length
const menuIds = nav.menu.map((m) => m.id)

const KNOWN_FLAGS = ['us', 'ro', 'de', 'ru', 'it', 'es', 'fr', 'hu', 'pt']
const KNOWN_BRANDS = ['bluesky', 'discord', 'youtube', 'reddit']

if (langCount !== 9) ERRORS.push(`expected 9 languages, got ${langCount}`)
for (const l of nav.languages) {
  if (!l.flag || !l.code || !l.locale) ERRORS.push(`language entry incomplete: ${JSON.stringify(l)}`)
  if (!KNOWN_FLAGS.includes(l.flag)) ERRORS.push(`language '${l.code}' has unknown flag code '${l.flag}' (expected one of ${KNOWN_FLAGS.join(', ')})`)
}
for (const s of nav.social) {
  if (!KNOWN_BRANDS.includes(s.icon)) ERRORS.push(`social '${s.id}' has unknown brand icon '${s.icon}' (expected one of ${KNOWN_BRANDS.join(', ')})`)
}
for (const lang of Object.keys(nav.menuLabels)) {
  const missing = menuIds.filter((id) => !nav.menuLabels[lang][id])
  if (missing.length) ERRORS.push(`menuLabels.${lang} missing: ${missing.join(', ')}`)
}

/* ── locales ──────────────────────────────────────────────────────────── */
try {
  readJson('public/data/locales/en.json')
  readJson('public/data/locales/ro.json')
} catch {
  ERRORS.push('missing base locale files (en.json / ro.json)')
}

/* ── report ───────────────────────────────────────────────────────────── */
console.log(`entities: ${entities.length} (audio: ${withAudio}, TTS queue: ${ttsQueue})`)
console.log(`languages: ${langCount} · menu items: ${menuIds.length}`)
for (const w of WARNINGS) console.warn(`warn: ${w}`)
if (ERRORS.length) {
  for (const e of ERRORS) console.error(`ERROR: ${e}`)
  console.error(`validate-data FAILED (${ERRORS.length} errors)`)
  process.exit(1)
}
console.log('validate-data OK ✓')
