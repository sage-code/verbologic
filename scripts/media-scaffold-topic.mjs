#!/usr/bin/env node
/**
 * media-scaffold-topic.mjs — "fill in the blanks later" tooling.
 *
 * Seeds one dictionary topic with pending manifests from a small term list, so
 * filling it later is mechanical: drop the mp3 into the topic folder, fill the
 * key/file/bytes/sha1 (or re-run the manifest generation), done.
 *
 *   node scripts/media-scaffold-topic.mjs <lang> <TOPIC> <seed.json> [--kind word]
 *
 * Seed JSON: [{ "term": "carte", "id": "A023", "names": { …all locales… }, "ipa": "/ˈkar.te/" }, …]
 *  - term (required, target language) · names must cover all other 8 locales
 *  - id (optional) reuses an assigned content code for another language variant
 *  - ipa (optional) · kind via --kind (default 'word')
 *
 * What it does:
 *  - writes media/dictionary/<CH>/<TOPIC>/<CODE>/item.json with no `files`
 *    entry (renders as "audio coming soon" until a recording lands).
 *    The manifest `code` is a topic-scoped content code (A001, A002, …), shared
 *    by every target-language variant.
 *  - assigns a language-independent `<TOPIC>:<CODE>` entity_id
 *  - replaces a matching planned sidebar slug, or appends the new content code
 *  - never touches published manifests or existing items
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOCALES } from './lib/locales.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MEDIA = join(ROOT, 'media')
const SIDEBAR_FILE = join(ROOT, 'src', 'data', 'sidebars', 'library', 'dictionary', 'sidebar.json')

/** ASCII-safe slug (diacritics stripped) — the extract-legacy convention. */
const slug = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** Manifest id prefix per kind (mirrors the legacy entity naming). */
const PREFIX_BY_KIND = {
  word: 'word',
  greeting: 'greeting',
  question: 'question',
  imperative: 'imperative',
  sentence: 'sentence',
  letter: 'letter',
  phrase: 'phrase'
}

function fail(msg) {
  console.error(`ERROR: ${msg}`)
  process.exit(1)
}

/** Every item.json under a topic folder (media/<track>/<CH>/<TOPIC>/<CODE>/item.json). */
function topicManifests(topicDir) {
  if (!existsSync(topicDir)) return []
  const out = []
  for (const entry of readdirSync(topicDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const file = join(topicDir, entry.name, 'item.json')
    if (existsSync(file)) out.push(JSON.parse(readFileSync(file, 'utf8')))
  }
  return out
}

function nextContentCode(topic, topicEntry, chapterCode) {
  let highest = 0
  for (const manifest of topicManifests(join(MEDIA, 'dictionary', chapterCode, topic))) {
    const match = /^A(\d{3,})(?:-\d+)?$/.exec(manifest.code ?? '')
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  for (const id of topicEntry.items) {
    const match = /^A(\d{3,})(?:-\d+)?$/.exec(id)
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  for (const counters of Object.values(topicEntry.lastIndex ?? {})) {
    highest = Math.max(highest, Number(counters?.audio ?? 0))
  }
  return highest + 1
}

function main() {
  const [lang, topic, seedFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const kindIdx = process.argv.indexOf('--kind')
  const kindFlag = kindIdx !== -1 ? process.argv[kindIdx + 1] : undefined
  if (!lang || !topic || !seedFile) fail('usage: media-scaffold-topic.mjs <lang> <TOPIC> <seed.json> [--kind word]')
  const kind = kindFlag ?? 'word'
  const prefix = PREFIX_BY_KIND[kind]
  if (!prefix) fail(`unknown kind '${kind}' (${Object.keys(PREFIX_BY_KIND).join(', ')})`)

  const seed = JSON.parse(readFileSync(seedFile, 'utf-8'))
  if (!Array.isArray(seed) || seed.length === 0) fail('seed must be a non-empty array of { term, names, id?, ipa? }')
  if (!LOCALES.includes(lang)) fail(`unknown language '${lang}' (${LOCALES.join(', ')})`)
  for (const row of seed) {
    const missing = LOCALES.filter((locale) =>
      locale !== lang && (typeof row.names?.[locale] !== 'string' || !row.names[locale].trim())
    )
    if (missing.length) fail(`seed row '${row.term ?? '?'}' is missing names for: ${missing.join(', ')}`)
  }

  const sidebar = JSON.parse(readFileSync(SIDEBAR_FILE, 'utf-8'))
  const chapter = sidebar.sections.find((c) => c.topics.some((t) => t.code === topic))
  const topicEntry = chapter?.topics.find((t) => t.code === topic)
  if (!topicEntry) fail(`unknown topic '${topic}'`)

  const dir = join(MEDIA, 'dictionary', chapter.code, topic)
  mkdirSync(dir, { recursive: true })
  let contentCode = nextContentCode(topic, topicEntry, chapter.code)
  const existingCodes = new Map()
  const existingLanguageCodes = new Set()
  for (const manifest of topicManifests(dir)) {
    if (manifest.code && manifest.entity_id) existingCodes.set(manifest.code, manifest.entity_id)
    if (manifest.code) existingLanguageCodes.add(manifest.code)
  }
  const created = []
  for (const row of seed) {
    if (!row.term) fail(`seed row without term: ${JSON.stringify(row)}`)
    const plannedId = `${prefix}_${slug(row.term)}`
    let id = row.id
    if (id) {
      if (!/^A\d{3,}(?:-\d+)?$/.test(id)) fail(`seed row id must be a content code such as A023: ${id}`)
      if (existingLanguageCodes.has(id)) fail(`content code '${id}' already has a ${lang} manifest in ${topic}`)
      if (!topicEntry.items.includes(id) && !existingCodes.has(id)) {
        fail(`content code '${id}' is not already assigned to ${topic}; omit row.id to allocate a new code`)
      }
    } else {
      id = `A${String(contentCode++).padStart(3, '0')}`
      const existingIndex = topicEntry.items.indexOf(plannedId)
      if (existingIndex >= 0) topicEntry.items[existingIndex] = id
      else topicEntry.items.push(id)
    }
    const entityId = existingCodes.get(id) ?? `${topic}:${id}`

    // One manifest per concept, carrying every locale's row. A new concept has
    // no `files` entry — the UI renders it as "audio coming soon" until a
    // recording lands and `media manifest` records its bytes/sha1.
    const locales = {}
    for (const locale of LOCALES) {
      const name = locale === lang ? row.term : row.names?.[locale]
      if (!name) continue
      locales[locale] = { name }
      if (locale === lang && row.ipa) locales[locale].ipa = row.ipa
    }
    const manifest = {
      code: id,
      track: 'dictionary',
      chapter: chapter.code,
      topic,
      kind,
      entity_id: entityId,
      locales,
      tags: [`scaffold#${topic}`]
    }
    const itemDir = join(dir, id)
    mkdirSync(itemDir, { recursive: true })
    writeFileSync(join(itemDir, 'item.json'), JSON.stringify(manifest, null, 2) + '\n')
    existingCodes.set(id, entityId)
    created.push(`${id} (${entityId})`)
  }

  writeFileSync(SIDEBAR_FILE, JSON.stringify(sidebar, null, 2) + '\n')
  console.log(`scaffold: ${created.length} pending manifest(s) in ${lang}/${topic} · ids: ${created.join(', ')}`)
  console.log('next: drop the mp3s into the topic folder, then re-run the manifest fill (key/sha1/bytes).')
}

main()