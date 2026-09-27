#!/usr/bin/env node
/**
 * seed-titles.mjs — pending manifests for one chapter's title audio: the
 * chapter itself plus every one of its topics (src/composables/useTitles.ts).
 *
 * Titles all live together in their chapter's own folder — one place to track
 * every title of a chapter, separate from its topics' item manifests:
 *   media/audio/<lang>/<chapterCode>/<CODE>.json   (kind 'chapter-title' | 'topic-title')
 * e.g. media/audio/ro/C1/C1.json (chapter) and media/audio/ro/C1/C1T01.json
 * (topic) — CODE is the chapter code for the chapter's own title, and each
 * topic's code for its title, but the FOLDER is always the chapter code.
 *
 *   node scripts/seed-titles.mjs <lang> <chapterCode> <ipaMap.json> [--tts ttsOverrides.json]
 *
 * ipaMap.json: { "<code>": "ipa string", ... } — one entry per chapter/topic
 * code being seeded (chapter code + every topic code in it). A code missing
 * from the map gets ipa: null.
 * ttsOverrides.json (optional): { "<code>": "text fed to the TTS engine
 * instead of the display name", ... } — for names edge-tts can't read as-is
 * (e.g. "Numere 0–100" -> "Numere de la zero la o sută").
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MEDIA_AUDIO = join(ROOT, 'media', 'audio')
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

function writeTitleManifest(code, names, kind) {
  const dir = join(MEDIA_AUDIO, lang, chapterCode)
  const path = join(dir, `${code}.json`)
  if (existsSync(path)) {
    console.log(`skip (exists): ${code}`)
    return
  }
  const term = names[lang]
  if (!term) fail(`'${code}' has no '${lang}' name`)
  const manifest = {
    id: code,
    lang,
    kind,
    term,
    names,
    ttsText: ttsMap[code] ?? null,
    ipa: ipaMap[code] ?? null,
    file: null,
    key: null,
    mime: 'audio/mpeg',
    bytes: null,
    sha1: null,
    status: 'pending',
    tags: [`title#${kind === 'chapter-title' ? 'chapter' : 'topic'}`]
  }
  if (manifest.ttsText === null) delete manifest.ttsText
  mkdirSync(dir, { recursive: true })
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`created: ${code} (${kind}) — "${term}"`)
}

writeTitleManifest(chapter.code, chapter.names, 'chapter-title')
for (const topic of chapter.topics) {
  writeTitleManifest(topic.code, topic.names, 'topic-title')
}

console.log(`\nseed-titles: ${chapterCode} + ${chapter.topics.length} topic(s)`)
