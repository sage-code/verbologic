#!/usr/bin/env node
/**
 * seed-export.mjs — export the content model to seed/*.json for the Supabase
 * importer (planning/performance-and-content-refactor.md §14.2, phase 5).
 *
 *   node scripts/seed-export.mjs            write seed/
 *   node scripts/seed-export.mjs --dry-run  report only, write nothing
 *   node scripts/seed-export.mjs --check    exit 1 if seed/ is stale
 *
 * The seed files are the **import source**, not a runtime asset: they are
 * committed to git and never deployed. They exist so the database can be
 * rebuilt from source control without re-parsing Markdown and manifests.
 *
 * Sources, all already produced by the build:
 *   public/data/media/library/<track>/<topic>.json   the runtime records
 *   public/data/media/index.json                     counts + progress aliases
 *   content/<track>/<topic>/<id>/<locale>.md         article bodies
 *   src/data/sidebars/**                             chapter/topic structure
 *
 * The exporter reads the *runtime payloads* rather than the manifests directly,
 * so it inherits every projection the client already relies on (dropped fields,
 * resolved audio URLs, canonical ids) instead of re-deriving them.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOCALES } from './lib/locales.mjs'
import { SEED_DIR, SEED_LOCALES, SEED_SCHEMA, articleRow, topicRow, unitRow, unitsFile } from './lib/seed.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MEDIA_OUT = join(ROOT, 'public', 'data', 'media')
const CONTENT = join(ROOT, 'content')
const SIDEBARS = join(ROOT, 'src', 'data', 'sidebars')
const OUT = join(ROOT, SEED_DIR)

const dryRun = process.argv.includes('--dry-run')
const checkOnly = process.argv.includes('--check')

const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'))
const sha1 = (text) => createHash('sha1').update(text).digest('hex')

/** Track directory names under public/data/media/library/. */
const TRACKS = ['dictionary', 'lectures', 'stories']

// ── 1. Collect the runtime records ──────────────────────────────────────────
// One file per topic; each is an array of records, one per (entity, language).

/** @type {Map<string, any>} entity_id -> merged record (first wins for shared fields) */
const byEntity = new Map()
/** @type {Map<string, Set<string>>} entity_id -> locales that have a row */
const localesByEntity = new Map()
/** @type {Map<string, any[]>} `${track}/${topic}` -> records */
const byTopic = new Map()
/** @type {Map<string, number>} entity_id -> position within its topic payload */
const payloadOrder = new Map()

let recordCount = 0
for (const track of TRACKS) {
  const dir = join(MEDIA_OUT, 'library', track)
  if (!existsSync(dir)) continue
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json') || file === 'search.json') continue
    const topic = file.replace(/\.json$/, '')
    const records = readJson(join(dir, file))
    if (!Array.isArray(records)) continue
    byTopic.set(`${track}/${topic}`, records)
    // The payload is already emitted in manifest order, so the index among
    // *distinct* entity ids is a usable fallback for topics whose sidebar items
    // are semantic slugs rather than the `L001`/`S001` codes entity ids use.
    const seenInTopic = new Set()
    for (const record of records) {
      recordCount += 1
      const id = record.entity_id ?? record.id
      if (!id) continue
      if (!byEntity.has(id)) byEntity.set(id, record)
      if (!localesByEntity.has(id)) localesByEntity.set(id, new Set())
      if (record.lang) localesByEntity.get(id).add(record.lang)
      if (!payloadOrder.has(id)) payloadOrder.set(id, seenInTopic.size)
      seenInTopic.add(id)
    }
  }
}

// ── 2. names.json — the shared 9-language map, stored once ──────────────────
// Every per-language unit row would otherwise repeat this map; §14.2 measured
// that as the single biggest saving in the seed layout.

/** @type {Record<string, Record<string, string>>} */
const names = {}
for (const [id, record] of byEntity) {
  const map = {}
  for (const locale of SEED_LOCALES) {
    const value = record.names?.[locale]
    if (typeof value === 'string' && value) map[locale] = value
  }
  // The record's own term is authoritative for its language.
  if (record.lang && record.term) map[record.lang] = record.term
  if (Object.keys(map).length) names[id] = map
}

// ── 2b. unit order — the sidebar's item position ────────────────────────────
// `units.order` is what the client sorts by (`ORDER BY order`), so it must be
// unique within a topic. Without it every row ties at 0 and Postgres is free to
// return them in any physical order — which is how the alphabet table ended up
// starting mid-list. The sidebar's `items` array is the authoritative order.

/** @type {Map<string, number>} entity_id -> 0-based position within its topic */
const unitOrder = new Map()

function collectUnitOrder(dir) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectUnitOrder(full)
      continue
    }
    if (!entry.endsWith('.json') || entry === 'topic-map.json') continue
    const data = readJson(full)
    for (const section of data.sections ?? []) {
      for (const topic of section.topics ?? []) {
        if (!topic.code || !Array.isArray(topic.items)) continue
        topic.items.forEach((item, index) => {
          const code = typeof item === 'string' ? item : item?.code
          if (code) unitOrder.set(`${topic.code}:${code}`, index)
        })
      }
    }
  }
}

for (const track of TRACKS) collectUnitOrder(join(SIDEBARS, 'library', track))

// ── 3. units.<lang>.json — one thin file per target language ────────────────
// A record is one (entity, language) pair, so the row for a language must come
// from the record whose `lang` matches — not from the first record for the
// entity, which is a different language and would carry the wrong term and
// audio URL.

/** @type {Map<string, Map<string, any>>} entity_id -> (locale -> record) */
const recordByEntityLocale = new Map()
for (const records of byTopic.values()) {
  for (const record of records) {
    const id = record.entity_id ?? record.id
    if (!id || !record.lang) continue
    if (!recordByEntityLocale.has(id)) recordByEntityLocale.set(id, new Map())
    const byLocale = recordByEntityLocale.get(id)
    // First record wins: a later duplicate for the same (entity, locale) is a
    // shared-variant repeat, not a different unit.
    if (!byLocale.has(record.lang)) byLocale.set(record.lang, record)
  }
}

/** @type {Record<string, any[]>} */
const unitsByLocale = Object.fromEntries(SEED_LOCALES.map((l) => [l, []]))
for (const [id, byLocale] of recordByEntityLocale) {
  for (const [locale, record] of byLocale) {
    if (!unitsByLocale[locale]) continue
    unitsByLocale[locale].push(
      unitRow({
        entityId: id,
        term: record.term,
        ipa: record.ipa,
        audio: record.media?.url ?? null,
        read: record.read?.url ?? null,
        order: unitOrder.get(id) ?? payloadOrder.get(id)
      })
    )
  }
}
for (const locale of SEED_LOCALES) {
  unitsByLocale[locale].sort((a, b) => a.i.localeCompare(b.i))
}

// ── 4. articles.json — one row per (entity_id, locale) ──────────────────────
// Bodies come from content/<track>/<topic>/<id>/<locale>.md. The front matter is
// parsed here (not by Nuxt Content) so the exporter has no build dependency.

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/** Minimal YAML front-matter reader — flat keys, quoted strings, `- ` lists. */
function parseFrontMatter(text) {
  const match = FRONT_MATTER.exec(text)
  if (!match) return { data: {}, body: text }
  const data = {}
  let currentList = null
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '')
    if (!line.trim()) continue
    const listItem = /^\s*-\s+(.*)$/.exec(line)
    if (listItem && currentList) {
      data[currentList].push(unquote(listItem[1]))
      continue
    }
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!kv) continue
    const [, key, rawValue] = kv
    if (rawValue === '') {
      currentList = key
      data[key] = []
      continue
    }
    currentList = null
    data[key] = unquote(rawValue)
  }
  return { data, body: text.slice(match[0].length) }
}

function unquote(value) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/** @type {any[]} */
const articles = []
for (const track of TRACKS) {
  const trackDir = join(CONTENT, track)
  if (!existsSync(trackDir)) continue
  for (const topic of readdirSync(trackDir)) {
    const topicDir = join(trackDir, topic)
    if (!statSync(topicDir).isDirectory()) continue
    for (const id of readdirSync(topicDir)) {
      const idDir = join(topicDir, id)
      if (!statSync(idDir).isDirectory()) continue
      for (const file of readdirSync(idDir)) {
        if (!file.endsWith('.md')) continue
        const locale = file.replace(/\.md$/, '')
        const raw = readFileSync(join(idDir, file), 'utf-8')
        const { data, body } = parseFrontMatter(raw)
        const entityId = data.entity_id || `${topic}:${id}`
        articles.push(
          articleRow({
            entityId,
            locale: data.locale || locale,
            title: data.title ?? '',
            summary: data.summary ?? '',
            body: body.trim(),
            status: data.status ?? 'draft',
            order: data.order !== undefined ? Number(data.order) : undefined,
            related: Array.isArray(data.related) ? data.related : undefined,
            sourceSha: sha1(raw)
          })
        )
      }
    }
  }
}
articles.sort((a, b) => a.entity_id.localeCompare(b.entity_id) || a.locale.localeCompare(b.locale))

// ── 5. topics.json — the structure layer ────────────────────────────────────
// Read from the sidebars so the sidebar can be queried instead of bundled.
// Sidebar shape: { id, names, sections: [ { code, names, topics: [ { code,
// names, layout, level, items } ] } ] }.

/** @type {any[]} */
const topics = []
const seenTopics = new Set()

/** Pick the English label out of a `names` map, falling back to the code. */
function labelOf(names, fallback) {
  if (!names) return fallback
  return names.en || names.ro || Object.values(names)[0] || fallback
}

function walkSidebarFile(file, track) {
  const data = readJson(file)
  const sections = data.sections ?? []
  sections.forEach((section, sectionIndex) => {
    const chapter = section.code ?? `CH${String(sectionIndex + 1).padStart(2, '0')}`
    const sectionTopics = section.topics ?? []
    sectionTopics.forEach((topic, topicIndex) => {
      const code = topic.code
      if (!code) return
      const key = `${track}/${code}`
      if (seenTopics.has(key)) return
      seenTopics.add(key)
      const records = byTopic.get(key) ?? []
      // `items` is the sidebar's own id list — the authoritative unit count.
      const words = Array.isArray(topic.items)
        ? topic.items.length
        : new Set(records.map((r) => r.entity_id ?? r.id)).size
      topics.push(
        topicRow({
          track,
          chapter,
          topic: code,
          title: labelOf(topic.names, code),
          order: sectionIndex * 1000 + topicIndex,
          level: topic.level ?? null,
          words
        })
      )
    })
  })
}

function walkSidebarDir(dir, track) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walkSidebarDir(full, track)
      continue
    }
    // topic-map.json is a lookup table, not structure.
    if (!entry.endsWith('.json') || entry === 'topic-map.json') continue
    walkSidebarFile(full, track)
  }
}

for (const track of TRACKS) walkSidebarDir(join(SIDEBARS, 'library', track), track)
topics.sort((a, b) => a.track.localeCompare(b.track) || a.order - b.order)

// ── 6. Write ────────────────────────────────────────────────────────────────

/** Deterministic JSON: 2-space indent, trailing newline, no BOM. */
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`

const files = new Map()
files.set('names.json', serialize({ schema: SEED_SCHEMA, names }))
for (const locale of SEED_LOCALES) {
  files.set(unitsFile(locale), serialize({ schema: SEED_SCHEMA, locale, units: unitsByLocale[locale] }))
}
files.set('articles.json', serialize({ schema: SEED_SCHEMA, articles }))
files.set('topics.json', serialize({ schema: SEED_SCHEMA, topics }))

let totalBytes = 0
let stale = 0
for (const [name, text] of files) {
  totalBytes += Buffer.byteLength(text)
  const target = join(OUT, name)
  const existing = existsSync(target) ? readFileSync(target, 'utf-8') : null
  if (existing !== text) stale += 1
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`
const unitTotal = SEED_LOCALES.reduce((sum, l) => sum + unitsByLocale[l].length, 0)

console.log(`seed-export: ${byEntity.size} entities · ${recordCount} records · ${unitTotal} unit rows`)
console.log(`seed-export: ${articles.length} articles · ${topics.length} topics · ${names && Object.keys(names).length} name maps`)
console.log(`seed-export: ${files.size} files · ${kb(totalBytes)} total`)

if (checkOnly) {
  if (stale) {
    console.error(`seed-export: STALE — ${stale} file(s) differ from seed/. Run: node scripts/seed-export.mjs`)
    process.exit(1)
  }
  console.log('seed-export: up to date ✓')
  process.exit(0)
}

if (dryRun) {
  console.log(`seed-export: dry run — ${stale} file(s) would change, nothing written`)
  process.exit(0)
}

mkdirSync(OUT, { recursive: true })
for (const [name, text] of files) {
  writeFileSync(join(OUT, name), text, 'utf-8')
}
console.log(`seed-export: wrote ${files.size} files to ${SEED_DIR}/ (${stale} changed)`)
