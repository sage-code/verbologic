#!/usr/bin/env node
/**
 * gallery-scaffold-topic.mjs — "fill in the blanks later" tooling.
 *
 * Seeds one dictionary topic with pending manifests from a small term list, so
 * filling it later is mechanical: drop the mp3 into the topic folder, fill the
 * key/file/bytes/sha1 (or re-run the manifest generation), done.
 *
 *   node scripts/gallery-scaffold-topic.mjs <lang> <TOPIC> <seed.json> [--kind word]
 *
 * Seed JSON: [{ "term": "carte", "names": { "en": "book" }, "ipa": "/ˈkar.te/" }, …]
 *  - term (required, target language) · names: extra locale glosses (optional)
 *  - ipa (optional) · kind via --kind (default 'word' → id prefix 'word')
 *
 * What it does:
 *  - writes gallery/audio/<lang>/<TOPIC>/<ID>.json with status 'pending'
 *    (key/file/bytes/sha1 null — renders as "audio coming soon" until filled)
 *  - ids are `<kind-prefix>_<slug(term)>`, deduped against the whole sidebar
 *  - inserts the ids into the sidebar topic's items (append, deduped)
 *  - never touches published manifests or existing items
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const GALLERY_AUDIO = join(ROOT, 'gallery', 'audio')
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

function main() {
  const [lang, topic, seedFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const kindFlag = process.argv[process.argv.indexOf('--kind') + 1]
  if (!lang || !topic || !seedFile) fail('usage: gallery-scaffold-topic.mjs <lang> <TOPIC> <seed.json> [--kind word]')
  const kind = kindFlag ?? 'word'
  const prefix = PREFIX_BY_KIND[kind]
  if (!prefix) fail(`unknown kind '${kind}' (${Object.keys(PREFIX_BY_KIND).join(', ')})`)

  const seed = JSON.parse(readFileSync(seedFile, 'utf-8'))
  if (!Array.isArray(seed) || seed.length === 0) fail('seed must be a non-empty array of { term, names?, ipa? }')

  const sidebar = JSON.parse(readFileSync(SIDEBAR_FILE, 'utf-8'))
  // Reserved ids: the whole sidebar (all languages) + existing manifest ids.
  const taken = new Set(
    sidebar.sections.flatMap((c) => c.topics.flatMap((t) => t.items))
  )

  const chapter = sidebar.sections.find((c) => c.topics.some((t) => t.code === topic))
  const topicEntry = chapter?.topics.find((t) => t.code === topic)
  if (!topicEntry) fail(`unknown topic '${topic}'`)

  const dir = join(GALLERY_AUDIO, lang, topic)
  const created = []
  for (const row of seed) {
    if (!row.term) fail(`seed row without term: ${JSON.stringify(row)}`)
    const base = slug(row.term)
    let id = `${prefix}_${base}`
    let n = 2
    while (taken.has(id)) id = `${prefix}_${base}-${n++}`
    taken.add(id)

    const manifest = {
      id,
      lang,
      kind,
      term: row.term,
      names: { ...(row.names ?? {}), [lang]: row.term },
      ipa: row.ipa ?? null,
      file: null,
      key: null,
      mime: 'audio/mpeg',
      bytes: null,
      sha1: null,
      status: 'pending',
      tags: [`scaffold#${topic}`]
    }
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${id}.json`), JSON.stringify(manifest, null, 2) + '\n')
    topicEntry.items.push(id)
    created.push(id)
  }

  writeFileSync(SIDEBAR_FILE, JSON.stringify(sidebar, null, 2) + '\n')
  console.log(`scaffold: ${created.length} pending manifest(s) in ${lang}/${topic} · ids: ${created.join(', ')}`)
  console.log('next: drop the mp3s into the topic folder, then re-run the manifest fill (key/sha1/bytes).')
}

main()