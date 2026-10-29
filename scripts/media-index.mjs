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
 * Structure-first policy (manual/architecture.md): the sidebars — the design
 * layer — MAY reference ids whose content has not been created yet. Such a
 * PLANNED id produces no record (the topic counts only what exists) and is
 * reported, never fatal. The full inventory: `run missing`.
 *
 *   node scripts/media-index.mjs              build (idempotent)
 *   node scripts/media-index.mjs --dry-run    print the plan, write nothing
 *
 * Outputs (public/data/media/):
 *   index.json                          counts, progress ids + legacy progress aliases
 *   <section>/<TOPIC>.json              records for one topic (topics with items only)
 *   <section>/search.json               every record of one section in one payload
 *                                       (the dictionary-wide translation search)
 *
 * Payloads are MINIFIED and DETERMINISTIC (no build timestamp), and carry only
 * the fields the client reads — see `toPayload` below and
 * planning/performance-and-content-refactor.md §3 phase 1.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOCALES } from './lib/locales.mjs'
import { descriptor, filePath, localeRow, localesOf, nameOf } from './lib/manifest.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SIDEBARS = join(ROOT, 'src', 'data', 'sidebars')
const CONFIG = join(ROOT, 'src', 'data', 'media.config.json')
const MEDIA = join(ROOT, 'media')
const OUT = join(ROOT, 'public', 'data', 'media')

const MIME_BY_EXT = {
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  webp: 'image/webp'
}

/** The registered UI locales (src/data/locales.ts) — content doc names. */
const LOCALES_ALL = LOCALES

const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'))
// ROOT-relative, forward-slash; tolerates a trailing separator in ROOT.
const rel = (p) => p.slice(ROOT.length).replaceAll('\\', '/').replace(/^\//, '')
const OUT_REL = rel(OUT)

const dryRun = process.argv.includes('--dry-run')
/** Debug aid: write indented JSON so a payload can be read by hand. */
const pretty = process.argv.includes('--pretty')

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

/** Title manifests use chapter/topic codes; learning items use topic-scoped codes. */
const manifestsById = new Map() // title id -> [{ manifest, sectionPath }]
const manifestsByTopicId = new Map() // `${topic}\n${id}` -> [{ manifest, sectionPath }]
/** `${topic}\n${legacy_entity_id}` -> same entries. Sidebars still reference the
 *  pre-migration ids for content that was converted from the retired
 *  `public/data/entities/` bridge, so the old id has to keep resolving. */
const manifestsByLegacyId = new Map()

/**
 * Manifest kinds that describe a chapter or topic title rather than a learning
 * item. Dictionary/lectures use `chapter-title`/`topic-title`; the stories
 * track names its own `story-chapter`/`story-topic`. All four carry the
 * chapter/topic code as `code` and sit one level above the items.
 */
const CHAPTER_TITLE_KINDS = new Set(['chapter-title', 'story-chapter'])
const TOPIC_TITLE_KINDS = new Set(['topic-title', 'story-topic'])
const isTitleKind = (kind) => CHAPTER_TITLE_KINDS.has(kind) || TOPIC_TITLE_KINDS.has(kind)
/**
 * One locale's media descriptor resolved against the files on disk.
 * `field` is the manifest map ('audio' = the short title/term recording,
 * 'read' = the full article read). A descriptor whose file has not landed yet
 * keeps `key: null`, so the runtime URL stays null and the UI disables it.
 */
function resolveDescriptor(item, path, locale, field) {
  const facts = item.files?.[filePath(field, locale)]
  const filePathOnDisk = facts ? join(dirname(path), ...filePath(field, locale).split('/')) : null
  const key = filePathOnDisk && existsSync(filePathOnDisk)
    ? relative(MEDIA, filePathOnDisk).replaceAll('\\', '/')
    : null
  return {
    key,
    mime: 'audio/mpeg',
    bytes: key ? facts.bytes ?? 0 : 0,
    sha1: key ? facts.sha1 ?? null : null,
    status: key ? 'published' : 'pending'
  }
}

function localizeItem(item, path, locale) {
  const audio = resolveDescriptor(item, path, locale, 'audio')
  const read = item.files?.[filePath('read', locale)] ? resolveDescriptor(item, path, locale, 'read') : null
  // Every locale's read recording, not just this row's.
  //
  // A directional topic (the Romanian alphabet) emits ONE record — the target
  // language's — but its article is explained in all nine locales, and each
  // explanation has its own recording. Without this map the English panel of a
  // Romanian letter had no Read button, because no `en` record exists to carry
  // `read/en.mp3`.
  const reads = {}
  for (const candidate of LOCALES_ALL) {
    if (!item.files?.[filePath('read', candidate)]) continue
    const descriptor = resolveDescriptor(item, path, candidate, 'read')
    if (descriptor.key) reads[candidate] = `${config.root}${descriptor.key}`
  }
  // Where each reading page starts in that locale's recording. The article is
  // paginated one `##` section per page, so the player seeks here instead of
  // replaying pages 1..N-1 when Play is pressed on page N.
  const readSections = item.readSections ?? null
  // The story's illustrations, shared by every locale. `page` is the reading
  // page each picture first appears on, so the reader can show the right one.
  const images = (item.images ?? [])
    .map((image) => {
      const onDisk = join(dirname(path), ...image.file.split('/'))
      if (!existsSync(onDisk)) return null
      return {
        url: `${config.root}${relative(MEDIA, onDisk).replaceAll('\\', '/')}`,
        page: image.page ?? 0
      }
    })
    .filter(Boolean)
  const row = localeRow(item, locale)
  return {
    id: item.code,
    lang: locale,
    kind: item.kind,
    term: row.name ?? null,
    names: namesOf(item),
    ipa: row.ipa ?? null,
    key: audio.key,
    mime: audio.mime,
    bytes: audio.bytes,
    sha1: audio.sha1,
    status: audio.status,
    read,
    reads: Object.keys(reads).length ? reads : null,
    readSections,
    images: images.length ? images : null,
    tags: item.tags ?? [],
    topic: item.topic,
    // The ONE language a directional item teaches (letters, article lessons):
    // its manifest names every locale, but only `target` gets a record.
    target: item.target ?? null,
    entity_id: `${item.topic}:${item.code}`,
    description: row.description ?? null,
    context: row.context ?? null,
    example: row.example ?? null
  }
}

/**
 * The old `names` map, rebuilt from `locales` — the runtime still reads it.
 *
 * Every registered locale is emitted, with `null` for the ones that have no
 * name yet. That is what the pre-migration manifests carried, and the payloads
 * are the contract: keeping the nulls means `media index` output stays
 * byte-identical, so the migration is provably zero-impact. Dropping them
 * would shrink `search.json` further, but that is a separate change with its
 * own measurement (planning/performance-and-content-refactor.md §25).
 */
function namesOf(item) {
  const out = {}
  for (const locale of LOCALES_ALL) out[locale] = nameOf(item, locale) ?? null
  return out
}

const walkManifests = (dir, sectionPath) => {
  if (!existsSync(dir)) return
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walkManifests(p, sectionPath)
    else if (e.name === 'item.json') {
      const item = readJson(p)
      if (!item.code) continue
      const map = isTitleKind(item.kind) ? manifestsById : manifestsByTopicId
      const manifestKey = map === manifestsById
        ? item.code
        : `${item.topic}\n${item.code}`
      if (!map.has(manifestKey)) map.set(manifestKey, [])
      const legacyKey = item.legacy_entity_id
        ? `${item.topic}\n${item.legacy_entity_id}`
        : null
      if (legacyKey && !manifestsByLegacyId.has(legacyKey)) manifestsByLegacyId.set(legacyKey, [])
      for (const locale of LOCALES_ALL) {
        if (!nameOf(item, locale)) continue
        const entry = {
          manifest: localizeItem(item, p, locale),
          sectionPath
        }
        map.get(manifestKey).push(entry)
        if (legacyKey) manifestsByLegacyId.get(legacyKey).push(entry)
      }
    }
  }
}
for (const sectionPath of new Set(Object.values(config.sections))) {
  walkManifests(join(MEDIA, sectionPath), sectionPath)
}

/** A manifest's media descriptor (URL null while pending) — shared shape for
 *  both topic records and title media (public/data/media/media.ts MediaMedia). */
function mediaDescriptor(manifest) {
  const key = manifest.key ?? manifest.file ?? null
  return {
    url: key ? `${config.root}${key}` : null,
    mime: manifest.mime ?? MIME_BY_EXT[key?.split('.').pop()] ?? 'application/octet-stream',
    bytes: manifest.bytes ?? 0,
    sha1: manifest.sha1 ?? null
  }
}

/** Chapter/topic title audio (src/composables/useTitles.ts): item records with
 *  a title kind, code = the chapter/topic code itself
 *  (media/<track>/<chapter>/<topic>/<code>/item.json) — swept into manifestsById
 *  above, independent of any sidebar's items[] (titles are never referenced
 *  there). Emitted per track as <section>/titles.json, the payload useTitles
 *  fetches for the active track; absent codes just keep the "coming soon"
 *  button. Title codes are globally unique across tracks, so one lookup table
 *  per track is enough and no code can collide. */
const titlesByTrack = new Map() // section id -> { chapters, topics }
/** config.sections values are media-relative paths ('stories/'); the payload
 *  lives under the section id ('library/stories'). Map one to the other. */
const sectionIdByPath = new Map(Object.entries(config.sections).map(([id, p]) => [p, id]))
for (const [id, entries] of manifestsById) {
  for (const { manifest, sectionPath } of entries) {
    const sectionId = sectionIdByPath.get(sectionPath) ?? sectionPath
    const bucket = titlesByTrack.get(sectionId) ?? { chapters: {}, topics: {} }
    titlesByTrack.set(sectionId, bucket)
    if (CHAPTER_TITLE_KINDS.has(manifest.kind)) (bucket.chapters[id] ??= {})[manifest.lang] = mediaDescriptor(manifest)
    else if (TOPIC_TITLE_KINDS.has(manifest.kind)) (bucket.topics[id] ??= {})[manifest.lang] = mediaDescriptor(manifest)
  }
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
    description: manifest.description ?? null,
    ipa: manifest.ipa ?? null,
    media: {
      // Pending manifests (status 'pending', key null) have no URL yet —
      // the UI renders those rows as a disabled "audio coming soon" button.
      url: key ? `${config.root}${key}` : null,
      mime: manifest.mime ?? MIME_BY_EXT[key?.split('.').pop()] ?? 'application/octet-stream',
      bytes: manifest.bytes ?? 0,
      sha1: manifest.sha1 ?? null
    },
    // Full-article read (media/<track>/…/read/<locale>.mp3) — null when the
    // manifest has no read map or the recording has not been generated yet.
    read: manifest.read ? mediaDescriptor(manifest.read) : null,
    // Every locale's read recording — a directional topic emits one record but
    // explains its article in all nine, each with its own recording.
    reads: manifest.reads ?? null,
    // Per-locale start offset of each reading page in that recording.
    readSections: manifest.readSections ?? null,
    // A story's illustrations, shared by every locale. `page` is the reading
    // page each picture first appears on.
    images: manifest.images ?? null,
    tags: manifest.tags ?? [],
    context: manifest.context ?? null,
    example: manifest.example ?? null,
    topic: manifest.topic,
    entity_id: manifest.entity_id ?? manifest.id
  }
}

const errors = []
let planned = 0 // ids referenced by a sidebar whose content does not exist yet
const recordsBySectionTopic = new Map() // `${section}\n${topic}` -> records[]
const progressAliases = {}
for (const entries of manifestsByTopicId.values()) {
  for (const { manifest } of entries) {
    const legacyId = manifest.legacy_entity_id
    if (!legacyId || legacyId === manifest.entity_id) continue
    const existing = progressAliases[legacyId]
    if (existing && existing !== manifest.entity_id) {
      errors.push(`legacy progress id '${legacyId}' maps to multiple content ids`)
      continue
    }
    progressAliases[legacyId] = manifest.entity_id
  }
}

for (const sidebar of sidebars) {
  const sectionPath = config.sections[sidebar.id]
  if (!sectionPath) {
    errors.push(`config.sections is missing '${sidebar.id}'`)
    continue
  }
  for (const section of sidebar.sections) {
    for (const topic of section.topics) {
      const records = []
      // Direction (Phase 7): a `directional` topic is about ONE language, so its
      // items belong to that language only. Records of any other language are
      // dropped here, so the runtime counts, ids and search index never offer it
      // to a language it does not exist for. A `reversible` topic (the default)
      // is available in every language.
      //
      // This replaces the old `sourceLang` / `langs` pair: both meant "about one
      // language", which is exactly what `mode: 'directional'` + `target` says.
      //
      // A directional topic normally has NO `target` of its own: one topic list
      // serves every language (the same chapter, the same topics) and each item
      // names the language it teaches in its manifest's `target`. A topic-level
      // `target` still wins when present.
      const topicScope =
        topic.mode === 'directional' && topic.target ? topic.target : null
      for (const id of topic.items) {
        const manifests =
          manifestsByTopicId.get(`${topic.code}\n${id}`) ??
          manifestsByLegacyId.get(`${topic.code}\n${id}`)
        if (manifests?.length) {
          for (const { manifest } of manifests) {
            const only = topicScope ?? (topic.mode === 'directional' ? manifest.target : null)
            if (only && manifest.lang !== only) continue
            records.push(manifestRecord({ ...manifest, topic: topic.code }, sidebar.id))
          }
          continue
        }
        // PLANNED item — content not created yet; no record, never fatal.
        planned++
      }
      if (records.length > 0) recordsBySectionTopic.set(`${sidebar.id}\n${topic.code}`, records)
    }
  }
}

/* ── content overlay (dictionary / lectures / stories) ──────────────────
 *
 * Dictionary, lecture, and story prose is shared by every target language:
 * content/<track>/<TOPIC>/<ID>/<locale>.md. Legacy story docs may still be
 * language-specific. Front matter joins per-locale review state onto records;
 * prose renders on prerendered Nuxt Content routes. */

/** Legacy groups without an explicit canonical locale use these defaults. */
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
  example: r.example ?? null,
  media: { url: r.media.url },
  read: r.read ? { url: r.read.url } : null
})

/**
 * Runtime payload projection (planning/performance-and-content-refactor.md §3
 * phase 1). Drops the fields no client reads — `sha1`, `bytes`, `source`,
 * `section` — collapses `content.locales` from `{locale: {status, stale}}` to
 * the list of locales that exist, and omits null/empty values. `mime` stays:
 * MediaViewer switches on it for video/image rows.
 */
function toPayload(record) {
  const out = {}
  for (const [key, value] of Object.entries(record)) {
    if (value === null || value === undefined) continue
    if (key === 'sha1' || key === 'bytes' || key === 'source' || key === 'section') continue
    if (key === 'media' || key === 'read') {
      const descriptor = { url: value.url ?? null }
      if (value.mime) descriptor.mime = value.mime
      out[key] = descriptor
      continue
    }
    if (key === 'content') {
      const content = {
        canonical: value.canonical,
        // Already a locale list (phonetic articles) or a {locale: state} map
        // (Markdown-backed articles) — normalize to the list the client reads.
        locales: Array.isArray(value.locales) ? value.locales : Object.keys(value.locales ?? {}),
        summary: value.summary,
        order: value.order,
        minutes: value.minutes,
        video: value.video
      }
      for (const [field, fieldValue] of Object.entries(content)) {
        if (fieldValue === null || fieldValue === undefined) delete content[field]
      }
      out.content = content
      continue
    }
    if (Array.isArray(value) && value.length === 0) continue
    out[key] = value
  }
  return out
}

/** Front-matter + review state joined onto one content-backed record. */
function applyContentMeta(record, group, recordsById, recordsByTopicContentId) {
  const canonicalLocale = group.canonical ?? (EN_CANONICAL.has(group.section) ? 'en' : group.trackLang)
  const canonical = group.docs.get(canonicalLocale)
  if (!canonical) {
    errors.push(`content: '${record.id}' has no canonical '${canonicalLocale}' document`)
    return
  }
  if (group.shared) {
    const term = canonical.terms?.[record.lang]
    if (!term) {
      errors.push(`content: '${group.topic}/${group.articleId}' has no target term for '${record.lang}'`)
    } else if (term !== record.term) {
      errors.push(`content: '${group.topic}/${group.articleId}' term for '${record.lang}' does not match its media manifest`)
    }
  }
  const locales = {}
  for (const [locale, doc] of group.docs) {
    locales[locale] = {
      status: doc.status,
      // A translation is stale when the canonical doc changed after it was made.
      stale: doc.sourceSha !== null && doc.sourceSha !== canonical.sha
    }
    // Titles come from the docs — the authoring source of truth.
    if (group.useTitlesAsNames !== false && doc.title) record.names[locale] = doc.title
  }
  // Keep the manifest invariant names[lang] === term when a track-language doc exists.
  if (group.useTitlesAsNames !== false && group.docs.has(record.lang)) {
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
    const row =
      recordsByTopicContentId
        .get(`${record.topic}\n${id}`)
        ?.find((candidate) => candidate.section === record.section && candidate.lang === record.lang) ??
      recordsById.get(id)
    // A related id whose record does not exist yet is a planned item — drop
    // the embed, never fail (structure-first policy).
    if (!row) return null
    return toRow(row)
  }).filter(Boolean)
}

/** Content docs grouped by track, topic, and topic-scoped content code. */
function loadContentGroups() {
  const groups = new Map()
  if (!existsSync(CONTENT_DIR)) return groups

  // content/<track>/<TOPIC>/<ID>.json — one file per article, every language
  // inside (scripts/lib/articles.mjs, planning/content-in-database.md §5).
  for (const sectionLeaf of ['dictionary', 'lectures', 'stories']) {
    const trackDir = join(CONTENT_DIR, sectionLeaf)
    if (!existsSync(trackDir)) continue
    for (const topic of readdirSync(trackDir)) {
      const topicDir = join(trackDir, topic)
      if (!statSync(topicDir).isDirectory()) continue
      for (const name of readdirSync(topicDir)) {
        if (!name.endsWith('.json')) continue
        const articleId = name.slice(0, -'.json'.length)
        const where = `${sectionLeaf}/${topic}/${name}`
        const section = `library/${sectionLeaf}`
        if (!config.sections[section]) {
          errors.push(`content: '${where}' unknown track '${sectionLeaf}' (expected one of ${Object.keys(config.sections).join(', ')})`)
        }
        let article
        try {
          article = JSON.parse(readFileSync(join(topicDir, name), 'utf8'))
        } catch (error) {
          errors.push(`content: '${where}' is not valid JSON (${error.message})`)
          continue
        }
        if (article.entity_id !== `${topic}:${articleId}`) {
          errors.push(`content: '${where}' entity_id '${article.entity_id}' does not match its path`)
        }
        const group = {
          articleId,
          section,
          trackLang: null,
          topic,
          entityId: article.entity_id ?? null,
          canonical: 'en',
          shared: ['dictionary', 'lectures'].includes(sectionLeaf),
          broadcast: sectionLeaf === 'stories',
          useTitlesAsNames: sectionLeaf === 'stories',
          docs: new Map()
        }
        for (const [locale, doc] of Object.entries(article.locales ?? {})) {
          if (!LOCALES_ALL.includes(locale)) errors.push(`content: '${where}' bad doc locale '${locale}'`)
          if (!doc.title) errors.push(`content: '${where}' (${locale}) is missing a title`)
          group.docs.set(locale, {
            title: doc.title ?? null,
            summary: doc.summary ?? null,
            terms: article.terms ?? null,
            status: doc.status ?? 'draft',
            sourceSha: doc.sourceSha ?? null,
            reviewedAt: doc.reviewedAt ?? null,
            related: Array.isArray(article.related) ? article.related : [],
            order: article.order ?? 0,
            minutes: article.minutes ?? null,
            sha: createHash('sha1').update(JSON.stringify(doc)).digest('hex')
          })
        }
        groups.set(`${section}\n\n${topic}\n${articleId}`, group)
      }
    }
  }
  return groups
}

const contentGroups = loadContentGroups()
const recordsById = new Map() // stable entity_id -> record
const recordsByTopicContentId = new Map() // `${topic}\n${content id}` -> language variants
for (const records of recordsBySectionTopic.values()) {
  for (const record of records) {
    recordsById.set(record.entity_id, record)
    const contentKey = `${record.topic}\n${record.id}`
    const variants = recordsByTopicContentId.get(contentKey) ?? []
    variants.push(record)
    recordsByTopicContentId.set(contentKey, variants)
  }
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
  // The sidebar topic may not exist yet (structure authored ahead of the
  // sidebar entry) — skip the record silently rather than failing the build.
  if (!topicEntry) return null
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
    entity_id: group.entityId ?? `${group.topic}:${contentId}`
  }
}

for (const group of contentGroups.values()) {
  const contentId = group.articleId
  if (
    group.broadcast ||
    group.section === 'library/dictionary' ||
    (group.section === 'library/lectures' && group.trackLang === null)
  ) {
    const matches = (recordsBySectionTopic.get(`${group.section}\n${group.topic}`) ?? []).filter(
      (record) => record.id === contentId
    )
    if (matches.length === 0) {
      errors.push(`shared article: '${group.topic}/${contentId}' has no matching target-language manifest`)
      continue
    }
    for (const record of matches) applyContentMeta(record, group, recordsById, recordsByTopicContentId)
    continue
  }

  let record = recordsByTopicContentId
    .get(`${group.topic}\n${contentId}`)
    ?.find((candidate) => candidate.section === group.section && candidate.lang === group.trackLang)
  if (!record) {
    record = contentRecord(contentId, group)
    if (!record) continue
    recordsById.set(record.entity_id, record)
    const contentKey = `${group.topic}\n${contentId}`
    const variants = recordsByTopicContentId.get(contentKey) ?? []
    variants.push(record)
    recordsByTopicContentId.set(contentKey, variants)
    const key = `${group.section}\n${group.topic}`
    if (!recordsBySectionTopic.has(key)) recordsBySectionTopic.set(key, [])
    recordsBySectionTopic.get(key).push(record)
  }
  applyContentMeta(record, group, recordsById, recordsByTopicContentId)
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
  // Minified + no build timestamp: two builds of the same content are
  // byte-identical, so a no-op rebuild is a true no-op (§3 phase 1).
  //
  // `--pretty` writes 2-space-indented JSON instead, for reading a payload by
  // hand. It is a DEBUG aid only — never commit or deploy pretty output, it is
  // ~74% larger and this is what the browser downloads.
  writeFileSync(path, (pretty ? JSON.stringify(payload, null, 2) : JSON.stringify(payload)) + '\n')
}

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

// Topic files keep the sidebar's item order — it is the teaching order
// (e.g. a question row is followed by its answers).
for (const [key, records] of recordsBySectionTopic) {
  const [section, topic] = key.split('\n')
  emit(`${section}/${topic}.json`, records.map(toPayload))
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
    section,
    records: [...records].sort(byId).map(toPayload)
  })
  searchStats.push(`  ${section}: ${records.length} searchable records`)
}

for (const [sectionPath, bucket] of titlesByTrack) {
  emit(`${sectionPath}/titles.json`, {
    schema: 1,
    chapters: bucket.chapters,
    topics: bucket.topics
  })
}

const progress = {}
for (const records of recordsBySectionTopic.values()) {
  for (const record of records) progress[record.entity_id] = record.topic
}

emit('index.json', {
  schema: 1,
  counts,
  ids,
  progress,
  progressAliases
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
if (planned)
  console.log(
    `planned (no content yet): ${planned} item id(s) — structure-first policy, never fatal ('run missing' lists them)`
  )
if (errors.length) {
  for (const e of errors) console.error(`ERROR: ${e}`)
  console.error(`media-index FAILED (${errors.length} errors)`)
  process.exit(1)
}
console.log('media-index OK ✓')
