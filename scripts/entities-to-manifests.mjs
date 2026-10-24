#!/usr/bin/env node
/**
 * entities-to-manifests.mjs — give the legacy entity orphans real manifests.
 *
 * Phase 8 cannot remove the `entities/` bridge while 268 sidebar items exist
 * ONLY there: they have no manifest and no `legacy_entity_id` alias, so
 * `media-index.mjs` falls back to `legacyRecord()` to render them. Deleting the
 * bridge would blank 14 topics (all of LT02, LT03T01, and 15 dictionary rows).
 *
 * This script converts each orphan into a proper `media/<track>/<chapter>/
 * <topic>/<code>/item.json` in the Phase 4 shape (`locales` + `files`), so the
 * normal pipeline (generate-audio → media manifest → media upload) can take
 * over and the bridge can go.
 *
 *   node scripts/entities-to-manifests.mjs --dry-run
 *   node scripts/entities-to-manifests.mjs
 *
 * What it carries over from the entity record:
 *   term        → locales[lang].name
 *   translations→ locales[<locale>].name   (only the locales the entity has)
 *   ipa         → locales[lang].ipa        (null for all 405 today — see below)
 *   context     → locales[lang].description
 *
 * What it deliberately does NOT invent:
 *   - Missing translations. An entity with 4 of 9 locales gets 4 locale rows;
 *     the rest stay absent so `generate-audio.py --translate` can fill them and
 *     the UI keeps showing them as "no gloss yet" rather than a wrong one.
 *   - IPA. Every one of the 405 entities has `ipa: null`; transcribing 405
 *     Romanian terms is a separate job (`generate-ipa.py`), not a migration.
 *
 * Idempotent: an item.json that already exists is left untouched.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOCALES } from './lib/locales.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ENTITIES = join(ROOT, 'public', 'data', 'entities')
const MEDIA = join(ROOT, 'media')
const SIDEBARS = join(ROOT, 'src', 'data', 'sidebars')
const dryRun = process.argv.includes('--dry-run')

const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'))

/** Every entity record, keyed by id. */
const entities = new Map()
for (const file of readdirSync(ENTITIES)) {
  if (!file.endsWith('.json')) continue
  const data = readJson(join(ENTITIES, file))
  const rows = Array.isArray(data) ? data : (data.entities ?? data.items ?? [])
  for (const row of rows) if (row.id) entities.set(row.id, row)
}

/** Every entity_id / legacy_entity_id a manifest already covers. */
const covered = new Set()
function walkManifests(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walkManifests(full)
      continue
    }
    if (entry !== 'item.json') continue
    const manifest = readJson(full)
    if (manifest.entity_id) covered.add(manifest.entity_id)
    if (manifest.legacy_entity_id) covered.add(manifest.legacy_entity_id)
  }
}
walkManifests(MEDIA)

/** Sidebar item ids, with the topic/section/track they belong to. */
const wanted = []
function walkSidebars(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walkSidebars(full)
      continue
    }
    if (entry !== 'sidebar.json') continue
    const sidebar = readJson(full)
    const track = sidebar.id.includes('/') ? sidebar.id.split('/').pop() : sidebar.id
    for (const section of sidebar.sections ?? []) {
      for (const topic of section.topics ?? []) {
        for (const id of topic.items ?? []) {
          wanted.push({ id, track, chapter: section.code, topic: topic.code })
        }
      }
    }
  }
}
walkSidebars(SIDEBARS)

/** The orphans: in a sidebar, in entities, and not covered by any manifest. */
const orphans = wanted.filter((w) => entities.has(w.id) && !covered.has(w.id))

/** Entity `type` → manifest `kind`. */
const KIND_BY_TYPE = {
  word: 'word',
  sentence: 'sentence',
  question: 'question',
  imperative: 'imperative',
  greeting: 'greeting',
  letter: 'letter',
  group: 'group'
}

/** Entity `type` → the media-code prefix the validator requires. */
const PREFIX_BY_TYPE = {
  word: 'W',
  sentence: 'S',
  question: 'A',
  imperative: 'V',
  greeting: 'P',
  letter: 'L',
  group: 'L'
}

/**
 * Allocate the next free media code for a topic.
 *
 * The validator requires `code` to be a media code (`W001`, `L001`, …), and the
 * sidebar references items by their LEGACY id — so the manifest carries both:
 * `code`/`entity_id` are the new media identity, `legacy_entity_id` keeps the
 * old id resolvable. That is exactly the pattern the 74 pre-existing aliased
 * manifests already use (`code: L553`, `entity_id: LT01T07:L553`,
 * `legacy_entity_id: letter_a-2`).
 */
function nextCode(topic, prefix, taken) {
  let max = 0
  for (const code of taken.get(topic) ?? []) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(code)
    if (m) max = Math.max(max, Number(m[1]))
  }
  const next = `${prefix}${String(max + 1).padStart(3, '0')}`
  if (!taken.has(topic)) taken.set(topic, new Set())
  taken.get(topic).add(next)
  return next
}

/** Build the Phase 4 manifest for one orphan. */
function buildManifest(orphan, entity, code) {
  const lang = entity.lang ?? 'ro'
  const locales = {}

  // The target language's own row.
  locales[lang] = { name: entity.term }
  if (entity.ipa) locales[lang].ipa = entity.ipa
  if (entity.context) locales[lang].description = entity.context

  // Every translation the entity actually has. Missing locales stay absent on
  // purpose — `generate-audio.py --translate` fills them, and the UI shows
  // "no gloss yet" rather than a fabricated one.
  for (const [locale, name] of Object.entries(entity.translations ?? {})) {
    if (!LOCALES.includes(locale) || !name) continue
    locales[locale] = { ...(locales[locale] ?? {}), name }
  }

  return {
    code,
    track: orphan.track,
    chapter: orphan.chapter,
    topic: orphan.topic,
    kind: KIND_BY_TYPE[entity.type] ?? 'word',
    entity_id: `${orphan.topic}:${code}`,
    // The old id stays resolvable: progress rows written against it keep
    // working, and the sidebar's item list keeps pointing at it.
    legacy_entity_id: orphan.id,
    locales
  }
}

/** Where the manifest goes: media/<track>/<chapter>/<topic>/<code>/item.json. */
function manifestPath(orphan, code) {
  return join(MEDIA, orphan.track, orphan.chapter, orphan.topic, code, 'item.json')
}

/** Media codes already used per topic, so allocation never collides. */
const takenCodes = new Map()
function collectCodes(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectCodes(full)
      continue
    }
    if (entry !== 'item.json') continue
    const manifest = readJson(full)
    if (!manifest.topic || !manifest.code) continue
    if (!takenCodes.has(manifest.topic)) takenCodes.set(manifest.topic, new Set())
    takenCodes.get(manifest.topic).add(manifest.code)
  }
}
collectCodes(MEDIA)

let written = 0
let skipped = 0
const byTopic = new Map()
const missingLocales = new Map()

for (const orphan of orphans) {
  const entity = entities.get(orphan.id)
  const prefix = PREFIX_BY_TYPE[entity.type] ?? 'W'
  const code = nextCode(orphan.topic, prefix, takenCodes)
  const target = manifestPath(orphan, code)
  if (existsSync(target)) {
    skipped += 1
    continue
  }
  const manifest = buildManifest(orphan, entity, code)
  const localeCount = Object.keys(manifest.locales).length
  missingLocales.set(localeCount, (missingLocales.get(localeCount) ?? 0) + 1)
  byTopic.set(orphan.topic, (byTopic.get(orphan.topic) ?? 0) + 1)
  if (!dryRun) {
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
  }
  written += 1
}

console.log(`entities-to-manifests: ${orphans.length} orphan(s) · ${written} written · ${skipped} already present`)
console.log('  by topic:', [...byTopic.entries()].map(([t, n]) => `${t}:${n}`).join(' '))
console.log(
  '  locale coverage:',
  [...missingLocales.entries()].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n} locales × ${c}`).join(' · ')
)
if (dryRun) console.log('  dry run — nothing written')
