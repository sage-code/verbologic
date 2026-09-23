#!/usr/bin/env node
/**
 * gallery-index.mjs — build the public/data/gallery/** runtime payloads by
 * joining the three content layers:
 *
 *   1. src/data/sidebars/…/sidebar.json  structure: sections → topics → item ids
 *      (build-inlined in the app via useSidebars — never fetched)
 *   2. gallery/…/<ID>.mp3 + <ID>.json    the repository: every media file has
 *      its own sibling manifest carrying the item text (term/names/ipa) + file
 *      facts (key/mime/bytes/sha1)
 *   3. src/data/gallery.config.json      R2 root + section → path mapping;
 *      a sidebar entry's media URL = root + sectionPath + manifest.key
 *
 * Transitional legacy bridge: sidebar item ids WITHOUT a manifest resolve from
 * public/data/entities/*.json (the 532 legacy entities, audio at
 * media.verbologic.com/audio/<lang>/<id>.mp3). As TTS / gallery-native content
 * lands, manifests appear and the bridge stops applying to them.
 *
 *   node scripts/gallery-index.mjs              build (idempotent)
 *   node scripts/gallery-index.mjs --dry-run    print the plan, write nothing
 *
 * Outputs (public/data/gallery/):
 *   index.json                          counts[section][topic][lang] + progress {entity_id: topic}
 *   <section>/<TOPIC>.json              records for one topic (topics with items only)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SIDEBARS = join(ROOT, 'src', 'data', 'sidebars')
const CONFIG = join(ROOT, 'src', 'data', 'gallery.config.json')
const GALLERY = join(ROOT, 'gallery')
const ENTITIES = join(ROOT, 'public', 'data', 'entities')
const OUT = join(ROOT, 'public', 'data', 'gallery')

const MIME_BY_EXT = {
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  webp: 'image/webp'
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'))
// ROOT-relative, forward-slash; tolerates a trailing separator in ROOT.
const rel = (p) => p.slice(ROOT.length).replaceAll('\\', '/').replace(/^\//, '')
const OUT_REL = rel(OUT)

const dryRun = process.argv.includes('--dry-run')

/* ── inputs ────────────────────────────────────────────────────────────── */

const config = readJson(CONFIG)

const sidebars = []
const walkSidebars = (dir) =>
  readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) walkSidebars(p)
    else if (e.name === 'sidebar.json') sidebars.push(readJson(p))
  })
walkSidebars(SIDEBARS)

/** Manifests indexed by bare id: gallery/<sectionPath>/…/<ID>.json (recursive). */
const manifestsById = new Map() // id -> [{ manifest, sectionPath }]
const walkManifests = (dir, sectionPath) => {
  if (!existsSync(dir)) return
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walkManifests(p, sectionPath)
    else if (e.name.endsWith('.json')) {
      const manifest = readJson(p)
      if (!manifestsById.has(manifest.id)) manifestsById.set(manifest.id, [])
      manifestsById.get(manifest.id).push({ manifest, sectionPath })
    }
  }
}
for (const sectionPath of new Set(Object.values(config.sections))) {
  walkManifests(join(GALLERY, sectionPath), sectionPath)
}

/** Legacy entities by id — the transitional bridge for ids without a manifest. */
const entitiesById = new Map()
for (const file of readdirSync(ENTITIES).filter((f) => f.endsWith('.json'))) {
  for (const entity of readJson(join(ENTITIES, file))) entitiesById.set(entity.id, entity)
}

/* ── record assembly ───────────────────────────────────────────────────── */

/** Repository manifest -> runtime record (URL built from the config root). */
function manifestRecord(manifest, section) {
  const key = manifest.key ?? manifest.file ?? null
  return {
    id: manifest.id,
    section,
    kind: manifest.kind ?? null,
    lang: manifest.lang,
    source: 'gallery',
    term: manifest.term,
    names: { ...manifest.names, [manifest.lang]: manifest.term },
    ipa: manifest.ipa ?? null,
    media: {
      // Pending manifests (status 'pending', key null) have no URL yet —
      // the UI renders those rows as a disabled "audio coming soon" button.
      url: key ? `${config.root}${key}` : null,
      mime: manifest.mime ?? MIME_BY_EXT[key?.split('.').pop()] ?? 'application/octet-stream',
      bytes: manifest.bytes ?? 0,
      sha1: manifest.sha1 ?? null
    },
    tags: manifest.tags ?? [],
    context: manifest.context ?? null,
    example: manifest.example ?? null,
    topic: manifest.topic,
    entity_id: manifest.entity_id ?? manifest.id
  }
}

/** Legacy entity -> runtime record (all legacy media is audio). */
function legacyRecord(entity, section, topic) {
  return {
    id: entity.id,
    section,
    kind: entity.type,
    lang: entity.lang,
    source: 'legacy',
    term: entity.term,
    names: { ...(entity.translations ?? {}), [entity.lang]: entity.term },
    ipa: entity.ipa ?? null,
    media: {
      url: entity.audio,
      mime: 'audio/mpeg',
      bytes: 0,
      sha1: null
    },
    tags: [],
    context: entity.context ?? null,
    example: entity.example ?? null,
    topic,
    entity_id: entity.id
  }
}

const errors = []
const recordsBySectionTopic = new Map() // `${section}\n${topic}` -> records[]
const counts = {} // section -> topic -> lang -> n
const ids = {} // section -> topic -> lang -> [entity_id]

for (const sidebar of sidebars) {
  const sectionPath = config.sections[sidebar.id]
  if (!sectionPath) {
    errors.push(`config.sections is missing '${sidebar.id}'`)
    continue
  }
  counts[sidebar.id] = {}
  ids[sidebar.id] = {}
  for (const section of sidebar.sections) {
    for (const topic of section.topics) {
      const records = []
      for (const id of topic.items) {
        const manifests = manifestsById.get(id)
        if (manifests?.length) {
          for (const { manifest } of manifests) {
            records.push(manifestRecord({ ...manifest, topic: topic.code }, sidebar.id))
          }
          continue
        }
        const entity = entitiesById.get(id)
        if (entity) {
          records.push(legacyRecord(entity, sidebar.id, topic.code))
          continue
        }
        errors.push(`${sidebar.id} · ${topic.code}: item '${id}' has no manifest and no legacy entity`)
      }
      counts[sidebar.id][topic.code] = {}
      ids[sidebar.id][topic.code] = {}
      for (const record of records) {
        counts[sidebar.id][topic.code][record.lang] = (counts[sidebar.id][topic.code][record.lang] ?? 0) + 1
        ;(ids[sidebar.id][topic.code][record.lang] ??= []).push(record.entity_id)
      }
      if (records.length > 0) recordsBySectionTopic.set(`${sidebar.id}\n${topic.code}`, records)
    }
  }
}

/* ── emit ──────────────────────────────────────────────────────────────── */

const written = new Set()
function emit(relPath, payload) {
  written.add(`${OUT_REL}/${relPath}`)
  if (dryRun) return
  const path = join(OUT, relPath)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(payload, null, 2) + '\n')
}

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

for (const [key, records] of recordsBySectionTopic) {
  const [section, topic] = key.split('\n')
  emit(`${section}/${topic}.json`, [...records].sort(byId))
}

const progress = {}
for (const records of recordsBySectionTopic.values()) {
  for (const record of records) progress[record.entity_id] = record.topic
}

emit('index.json', {
  schema: 1,
  generated: new Date().toISOString(),
  counts,
  ids,
  progress
})

/* ── stale cleanup + report ────────────────────────────────────────────── */

if (!dryRun && existsSync(OUT)) {
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name)
      return e.isDirectory() ? walk(p) : [p]
    })
  let removed = 0
  for (const file of walk(OUT)) {
    if (!written.has(rel(file)) && existsSync(file)) {
      rmSync(file, { force: true })
      removed++
    }
  }
  // Drop directories the cleanup emptied (old-layout leftovers).
  const walkDirs = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name)
      return e.isDirectory() ? [...walkDirs(p), p] : []
    })
  for (const dir of walkDirs(OUT)) {
    if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true, force: true })
  }
  if (removed) console.log(`cleanup: removed ${removed} stale file(s) + empty dirs`)
}

const perSection = sidebars.map((s) => {
  const topics = Object.keys(counts[s.id] ?? {})
  const total = topics.reduce((n, t) => n + Object.values(counts[s.id][t]).reduce((a, b) => a + b, 0), 0)
  return `  ${s.id}: ${total} records in ${topics.length} topics`
})

console.log(`gallery-index: ${dryRun ? 'DRY RUN — ' : ''}${written.size} files -> ${rel(OUT)}`)
for (const line of perSection) console.log(line)
if (errors.length) {
  for (const e of errors) console.error(`ERROR: ${e}`)
  console.error(`gallery-index FAILED (${errors.length} errors)`)
  process.exit(1)
}
console.log('gallery-index OK ✓')

