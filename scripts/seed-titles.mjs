#!/usr/bin/env node
/**
 * seed-titles.mjs — pending manifests for one chapter's title audio: the
 * chapter itself plus every one of its topics (src/composables/useTitles.ts).
 *
 * Titles all live together in their chapter's own folder — one place to track
 * every title of a chapter, separate from its topics' item manifests:
 *   media/dictionary/<chapterCode>/item.json          (kind 'chapter-title')
 *   media/dictionary/<chapterCode>/<TOPIC>/item.json  (kind 'topic-title')
 * e.g. media/dictionary/CH01/item.json (chapter) and
 * media/dictionary/CH01/CH01T01/item.json (topic) — the folder is always the
 * chapter code, and the manifest's `code` is the chapter's or topic's code.
 *
 *   node scripts/seed-titles.mjs <lang> <chapterCode> <ipaMap.json> [--tts ttsOverrides.json]
 *
 * ipaMap.json: { "<code>": "ipa string", ... } — one entry per chapter/topic
 * code being seeded (chapter code + every topic code in it). A code missing
 * from the map gets no ipa.
 * ttsOverrides.json (optional): { "<code>": "text fed to the TTS engine
 * instead of the display name", ... } — for names edge-tts can't read as-is
 * (e.g. "Numere 0–100" -> "Numere de la zero la o sută").
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOCALES } from './lib/locales.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MEDIA = join(ROOT, 'media', 'dictionary')
const SIDEBAR_FILE = join(ROOT, 'src', 'data', 'sidebars', 'library', 'dictionary', 'sidebar.json')

function fail(msg) {
  console.error(`ERROR: ${msg}`)
  process.exit(1)
}

const args = process.argv.slice(2)
const ttsIdx = args.indexOf('--tts')
const ttsFile = ttsIdx !== -1 ? args[ttsIdx + 1] : null
const positional = args.filter((a, i) => a !== '--tts' && (ttsIdx === -1 || i !== ttsIdx + 1))
const [lang, chapterCode, ipaFile] = positional
if (!lang || !chapterCode || !ipaFile) fail('usage: seed-titles.mjs <lang> <chapterCode> <ipaMap.json> [--tts ttsOverrides.json]')

const ipaMap = JSON.parse(readFileSync(ipaFile, 'utf-8'))
const ttsMap = ttsFile ? JSON.parse(readFileSync(ttsFile, 'utf-8')) : {}

const sidebar = JSON.parse(readFileSync(SIDEBAR_FILE, 'utf-8'))
const chapter = sidebar.sections.find((c) => c.code === chapterCode)
if (!chapter) fail(`unknown chapter '${chapterCode}'`)

function writeTitleManifest(code, names, kind, dir) {
  const path = join(dir, 'item.json')
  if (existsSync(path)) {
    console.log(`skip (exists): ${code}`)
    return
  }
  const term = names[lang]
  if (!term) fail(`'${code}' has no '${lang}' name`)
  // One manifest per title, carrying every locale's row. No `files` entry —
  // the UI renders it as "audio coming soon" until a recording lands.
  const locales = {}
  for (const locale of LOCALES) {
    const name = names[locale]
    if (!name) continue
    locales[locale] = { name }
    if (locale === lang) {
      if (ipaMap[code]) locales[locale].ipa = ipaMap[code]
      if (ttsMap[code]) locales[locale].ttsText = ttsMap[code]
    }
  }
  const manifest = {
    code,
    track: 'dictionary',
    chapter: chapterCode,
    topic: kind === 'chapter-title' ? chapterCode : code,
    kind,
    entity_id: code,
    locales,
    tags: [`title#${kind === 'chapter-title' ? 'chapter' : 'topic'}`]
  }
  mkdirSync(dir, { recursive: true })
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`created: ${code} (${kind}) — "${term}"`)
}

writeTitleManifest(chapter.code, chapter.names, 'chapter-title', join(MEDIA, chapterCode))
for (const topic of chapter.topics) {
  writeTitleManifest(topic.code, topic.names, 'topic-title', join(MEDIA, chapterCode, topic.code))
}

console.log(`\nseed-titles: ${chapterCode} + ${chapter.topics.length} topic(s)`)
