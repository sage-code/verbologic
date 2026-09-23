#!/usr/bin/env node
/**
 * media-index.mjs — build the public/data/media/** runtime payloads by
 * joining the three content layers:
 *
 *   1. src/data/sidebars/…/sidebar.json  structure: sections → topics → item ids
 *      (build-inlined in the app via useSidebars — never fetched)
 *   2. media/…/<ID>.mp3 + <ID>.json    the repository: every media file has
 *      its own sibling manifest carrying the item text (term/names/ipa) + file
 *      facts (key/mime/bytes/sha1)
 *   3. src/data/media.config.json      R2 root + section → path mapping;
 *      a sidebar entry's media URL = root + sectionPath + manifest.key
 *
 * Transitional legacy bridge: sidebar item ids WITHOUT a manifest resolve from
 * public/data/entities/*.json (the 532 legacy entities, audio at
 * media.verbologic.com/audio/<lang>/<id>.mp3). As TTS / media-native content
 * lands, manifests appear and the bridge stops applying to them.
 *
 *   node scripts/media-index.mjs              build (idempotent)
 *   node scripts/media-index.mjs --dry-run    print the plan, write nothing
 *
 * Outputs (public/data/media/):
 *   index.json                          counts[section][topic][lang] + progress {entity_id: topic}
 *   <section>/<TOPIC>.json              records for one topic (topics with items only)
 *   <section>/search.json               every record of one section in one payload
 *                                       (the dictionary-wide translation search)
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import grayMatter from 'gray-matter'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SIDEBARS = join(ROOT, 'src', 'data', 'sidebars')
const CONFIG = join(ROOT, 'src', 'data', 'media.config.json')
const MEDIA = join(ROOT, 'media')
const ENTITIES = join(ROOT, 'public', 'data', 'entities')
const OUT = join(ROOT, 'public', 'data', 'media')

const MIME_BY_EXT = {
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  webp: 'image/webp'
}

/** The 9 UI locales (mirrors useLocale's LOCALE_CODES) — content doc names. */
const LOCALES_ALL = ['en', 'ro', 'de', 'ru', 'it', 'es', 'fr', 'hu', 'pt']

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

/** Manifests indexed by bare id: media/<sectionPath>/…/<ID>.json (recursive). */
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
  walkManifests(join(MEDIA, sectionPath), sectionPath)
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
    source: 'media',
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

for (const sidebar of sidebars) {
  const sectionPath = config.sections[sidebar.id]
  if (!sectionPath) {
    errors.push(`config.sections is missing '${sidebar.id}'`)
    continue
  }
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
      if (records.length > 0) recordsBySectionTopic.set(`${sidebar.id}\n${topic.code}`, records)
    }
  }
}

/* ── content overlay (lectures / stories) ────────────────────────────────
 *
 * content/<lectures|stories>/<trackLang>/<TOPIC>/<ID>/<locale>.md — one
 * Markdown document per explanation locale (English canonical for lectures,
 * the track language for stories). The overlay joins each doc's FRONT MATTER
 * into the matching media record: localized titles → names, per-locale
 * review state → `content` meta, related ids → embedded rows. The prose
 * itself renders on the lecture's own prerendered route (Nuxt Content) —
 * it is never fetched or re-rendered here. */

/** Tracks whose canonical document is English — every other track's canonical
 *  document is the track language itself (stories: the story IS the material). */
const EN_CANONICAL = new Set(['library/lectures'])
const CONTENT_DIR = join(ROOT, 'content')

/** Runtime record → row shape (MediaRow) — shared by related strips + search. */
const toRow = (r) => ({
  id: r.id,
  entity_id: r.entity_id,
  topic: r.topic,
  lang: r.lang,
  term: r.term,
  names: r.names,
  ipa: r.ipa,
  context: r.context,
  media: { url: r.media.url }
})

/** Front-matter + review state joined onto one content-backed record. */
function applyContentMeta(record, group, recordsById) {
  const canonicalLocale = EN_CANONICAL.has(group.section) ? 'en' : group.trackLang
  const canonical = group.docs.get(canonicalLocale)
  if (!canonical) {
    errors.push(`content: '${record.id}' has no canonical '${canonicalLocale}' document`)
    return
  }
  const locales = {}
  for (const [locale, doc] of group.docs) {
    locales[locale] = {
      status: doc.status,
      // A translation is stale when the canonical doc changed after it was made.
      stale: doc.sourceSha !== null && doc.sourceSha !== canonical.sha
    }
    // Titles come from the docs — the authoring source of truth.
    if (doc.title) record.names[locale] = doc.title
  }
  // Keep the manifest invariant names[lang] === term when a track-language doc exists.
  if (group.docs.has(record.lang)) {
    record.term = record.names[record.lang]
  }
  record.content = {
    canonical: canonicalLocale,
    locales,
    summary: canonical.summary,
    order: canonical.order,
    minutes: canonical.minutes,
    video: canonical.video
  }
  record.related = canonical.related.map((id) => {
    const row = recordsById.get(id)
    if (!row) {
      errors.push(`content: '${record.id}' related id '${id}' resolves to no record`)
      return null
    }
    return toRow(row)
  }).filter(Boolean)
}

/** All content docs grouped by lecture id: id → { section, trackLang, topic, docs }. */
function loadContentGroups() {
  const groups = new Map()
  if (!existsSync(CONTENT_DIR)) return groups

  const files = []
  const walk = (dir, parts) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const next = [...parts, entry.name]
      if (entry.isDirectory()) walk(join(dir, entry.name), next)
      else if (entry.name.endsWith('.md')) files.push(next)
    }
  }
  walk(CONTENT_DIR, [])
  // Expected shape: [<lectures|stories>, <trackLang>, <TOPIC>, <ID>, <locale>.md]
  for (const parts of files) {
    if (parts.length !== 5) {
      errors.push(`content: '${parts.join('/')}' must live at <track>/<TOPIC>/<ID>/<locale>.md`)
      continue
    }
    const [sectionLeaf, trackLang, topic, lectureId, docName] = parts
    const locale = docName.replace(/\.md$/, '')
    const section = `library/${sectionLeaf}`
    if (!config.sections[section]) {
      errors.push(`content: '${parts.join('/')}' unknown track '${sectionLeaf}' (expected one of ${Object.keys(config.sections).join(', ')})`)
    }
    const file = join(CONTENT_DIR, ...parts)
    const { data } = grayMatter(readFileSync(file, 'utf8'))
    if (!data.title) errors.push(`content: '${parts.join('/')}' is missing a title`)
    if (!LOCALES_ALL.includes(locale)) errors.push(`content: '${parts.join('/')}' bad doc locale '${locale}'`)

    const group = groups.get(lectureId) ?? { section, trackLang, topic, docs: new Map() }
    if (group.topic !== topic || group.trackLang !== trackLang || group.section !== section) {
      errors.push(`content: '${parts.join('/')}' conflicts with another doc of '${lectureId}'`)
      continue
    }
    group.docs.set(locale, {
      title: data.title ?? null,
      summary: data.summary ?? null,
      status: data.status ?? 'draft',
      sourceSha: data.sourceSha ?? null,
      reviewedAt: data.reviewedAt ?? null,
      related: Array.isArray(data.related) ? data.related : [],
      order: data.order ?? 0,
      minutes: data.minutes ?? null,
      sha: createHash('sha1').update(readFileSync(file)).digest('hex')
    })
    groups.set(lectureId, group)
  }
  return groups
}

const contentGroups = loadContentGroups()
const recordsById = new Map()
for (const records of recordsBySectionTopic.values()) {
  for (const record of records) recordsById.set(record.entity_id, record)
}

/**
 * Prose-only article record — the doc id has NO media manifest, so the first
 * pass never produced a record for it and the topic would count zero records
 * (disappearing from every list). Synthesize one from the docs themselves;
 * applyContentMeta then joins the front matter like for any content record.
 */
function contentRecord(contentId, group) {
  const sidebar = sidebars.find((s) => s.id === group.section)
  const topicEntry = sidebar?.sections.flatMap((s) => s.topics).find((t) => t.code === group.topic)
  if (!topicEntry) {
    errors.push(`content: '${contentId}' topic '${group.topic}' missing in ${group.section}`)
    return null
  }
  const names = {}
  for (const [locale, doc] of group.docs) {
    if (doc.title) names[locale] = doc.title
  }
  const term = names[group.trackLang] ?? Object.values(names)[0] ?? contentId
  // A declared video renders as "coming soon" until its manifest is published.
  const hasVideo = [...group.docs.values()].some((doc) => doc.video)
  return {
    id: contentId,
    section: group.section,
    kind: 'article',
    lang: group.trackLang,
    source: 'content',
    term,
    names,
    ipa: null,
    media: { url: null, mime: hasVideo ? 'video/mp4' : '', bytes: 0, sha1: null },
    tags: [],
    context: null,
    example: null,
    topic: group.topic,
    entity_id: contentId
  }
}

for (const [contentId, group] of contentGroups) {
  let record = recordsById.get(contentId)
  if (!record) {
    record = contentRecord(contentId, group)
    if (!record) continue
    recordsById.set(contentId, record)
    const key = `${group.section}\n${group.topic}`
    if (!recordsBySectionTopic.has(key)) recordsBySectionTopic.set(key, [])
    recordsBySectionTopic.get(key).push(record)
  }
  applyContentMeta(record, group, recordsById)
}

/* ── counts (second pass — includes the synthesized content-only records) ── */

const counts = {} // section -> topic -> lang -> n
const ids = {} // section -> topic -> lang -> [entity_id]
for (const sidebar of sidebars) {
  counts[sidebar.id] = {}
  ids[sidebar.id] = {}
  for (const section of sidebar.sections) {
    for (const topic of section.topics) {
      counts[sidebar.id][topic.code] = {}
      ids[sidebar.id][topic.code] = {}
    }
  }
}
for (const [key, records] of recordsBySectionTopic) {
  const [section, topic] = key.split('\n')
  for (const record of records) {
    counts[section][topic][record.lang] = (counts[section][topic][record.lang] ?? 0) + 1
    ;(ids[section][topic][record.lang] ??= []).push(record.entity_id)
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

/* ── section search index ─────────────────────────────────────────────────
 *
 * One payload per section holding EVERY record — the dictionary-wide
 * translation search loads it lazily (one fetch) instead of walking all
 * topic files. Trimmed to exactly the fields the dictionary table renders
 * (no tags/example/source/mime/bytes/sha1); both target languages stay in
 * one file — the store filters by the track language at runtime. */

const recordsBySection = new Map() // section -> search rows[]
for (const records of recordsBySectionTopic.values()) {
  for (const record of records) {
    if (!recordsBySection.has(record.section)) recordsBySection.set(record.section, [])
    recordsBySection.get(record.section).push(toRow(record))
  }
}
const searchStats = []
for (const [section, records] of recordsBySection) {
  emit(`${section}/search.json`, {
    schema: 1,
    generated: new Date().toISOString(),
    section,
    records: [...records].sort(byId)
  })
  searchStats.push(`  ${section}: ${records.length} searchable records`)
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

console.log(`media-index: ${dryRun ? 'DRY RUN — ' : ''}${written.size} files -> ${rel(OUT)}`)
for (const line of perSection) console.log(line)
for (const line of searchStats) console.log(line)
if (errors.length) {
  for (const e of errors) console.error(`ERROR: ${e}`)
  console.error(`media-index FAILED (${errors.length} errors)`)
  process.exit(1)
}
console.log('media-index OK ✓')

