#!/usr/bin/env node
/**
 * missing-content.mjs — the missing-content inventory (structure-first policy).
 *
 * The sidebars are the DESIGN layer: they may reference ids whose content has
 * not been created yet. Those are PLANNED items — expected, never fatal. This
 * script inventories them so the next content batch is a mechanical choice,
 * not an archaeology dig:
 *
 *   - per sidebar → chapter → topic: resolved vs planned item counts
 *   - every referenced id with no manifest, no legacy entity and no content doc
 *   - empty topics (no items at all) and their `topic-map.json.planned` source
 *   - content docs missing their canonical locale
 *
 *   node scripts/missing-content.mjs            report → temp/missing-content.md
 *   node scripts/missing-content.mjs --stdout   also print the full markdown
 *
 * Read-only; ALWAYS exits 0 — a missing-content finding is information, not a
 * failure. See manual/architecture.md ("Structure-First Design").
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MEDIA = join(ROOT, 'media')
const CONTENT = join(ROOT, 'content')
const SIDEBARS = join(ROOT, 'src', 'data', 'sidebars')
const CONFIG = join(ROOT, 'src', 'data', 'media.config.json')
const TOPIC_MAP = join(ROOT, 'src', 'data', 'sidebars', 'library', 'dictionary', 'topic-map.json')
const OUT = join(ROOT, 'temp', 'missing-content.md')

/** Canonical locale per track (mirrors validate-data / media-index). */
const CANONICAL_BY_TRACK = { dictionary: 'en', lectures: 'en' } // stories: the track language

const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'))
const stdout = process.argv.includes('--stdout')
const config = readJson(CONFIG)

const walk = (dir, ext, acc = []) => {
  if (!existsSync(dir)) return acc
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, ext, acc)
    else if (e.name.endsWith(ext)) acc.push(p)
  }
  return acc
}

/* ── content sources ─────────────────────────────────────────────────────── */

/** Manifest ids under each topic (codes are intentionally topic-scoped).
 *  Shared manifests (media/<track>/<chapter>/<topic>/<code>/item.json) carry
 *  `code` + `topic`; only the retired per-language manifests carry `id`. */
const manifestIds = new Set()
for (const sectionPath of new Set(Object.values(config.sections ?? {}))) {
  for (const file of walk(join(MEDIA, sectionPath), '.json')) {
    const m = readJson(file)
    if (m.code && m.topic) {
      manifestIds.add(`${m.topic}\n${m.code}`)
      // Sidebars still reference the pre-migration id for content converted
      // from the retired entities bridge.
      if (m.legacy_entity_id) manifestIds.add(`${m.topic}\n${m.legacy_entity_id}`)
    } else if (m.id) {
      const topic = file.split(/[\\/]/).at(-2)
      manifestIds.add(`${topic}\n${m.id}`)
    }
  }
}

/** Content docs grouped by article id; dictionary prose is shared across target languages. */
const docsByLecture = new Map() // source key → { id, track, section, trackLang, topic, locales }
const docsById = new Set()
for (const file of walk(CONTENT, '.md')) {
  const parts = file.slice(CONTENT.length + 1).split(/[\\/]/)
  const isDictionary = parts[0] === 'dictionary' && parts.length === 4
  if (!isDictionary && parts.length !== 5) continue
  const [track, trackLang, topic, id, docName] = isDictionary
    ? [parts[0], null, parts[1], parts[2], parts[3]]
    : parts
  const groupKey = `${track}\n${trackLang ?? ''}\n${topic}\n${id}`
  const group = docsByLecture.get(groupKey) ?? {
    id,
    track,
    section: `library/${track}`,
    trackLang,
    topic,
    locales: new Set()
  }
  group.locales.add(docName.replace(/\.md$/, ''))
  docsByLecture.set(groupKey, group)
  docsById.add(`${topic}\n${id}`)
}

/** The dictionary's planned-topic registry (archive source per blank topic). */
const plannedSources = existsSync(TOPIC_MAP) ? readJson(TOPIC_MAP).planned ?? {} : {}

const isResolved = (topic, id) =>
  manifestIds.has(`${topic}\n${id}`) || docsById.has(`${topic}\n${id}`)

/* ── walk the structure layer ────────────────────────────────────────────── */

const sidebars = walk(SIDEBARS, '.json')
  .filter((f) => f.endsWith('sidebar.json'))
  .map((f) => readJson(f))

const topicName = (t) => t.names?.en?.trim() || t.code
const chapterName = (c) => c.names?.en?.trim() || c.code

const lines = []
const push = (s = '') => lines.push(s)
const totals = { ids: 0, planned: 0, empty: 0 }
const emptyTopicsBySection = []
const plannedByTopic = [] // { section, chapter, topic, ids[] }

for (const sidebar of sidebars) {
  const rows = []
  const emptyTopics = []
  for (const chapter of sidebar.sections ?? []) {
    for (const topic of chapter.topics ?? []) {
      const items = topic.items ?? []
      totals.ids += items.length
      const plannedItems = items.filter((id) => !isResolved(topic.code, id))
      totals.planned += plannedItems.length
      if (items.length === 0) {
        totals.empty++
        emptyTopics.push(topic)
      }
      if (plannedItems.length) plannedByTopic.push({ section: sidebar.id, chapter, topic, ids: plannedItems })
      const note = items.length === 0 ? '**EMPTY**' : plannedItems.length ? 'partial' : ''
      rows.push(
        `| ${chapter.code} ${chapterName(chapter)} | ${topic.code} ${topicName(topic)} | ${topic.layout ?? '—'} | ${items.length - plannedItems.length} | ${plannedItems.length} | ${note} |`
      )
    }
  }
  if (emptyTopics.length) emptyTopicsBySection.push({ sidebar, topics: emptyTopics })
  push(`## ${sidebar.id} — ${sidebar.names?.en ?? sidebar.id}`, '')
  push('| chapter | topic | layout | resolved | planned | note |')
  push('| --- | --- | --- | --- | --- | --- |')
  for (const r of rows) push(r)
  push('')
}

/* ── empty topics + their planned source ─────────────────────────────────── */

push('## Empty topics (structure exists, no content yet)', '')
for (const { sidebar, topics } of emptyTopicsBySection) {
  push(`### ${sidebar.id} — ${topics.length}`, '')
  push('| topic | name | layout | planned source (topic-map.json) |')
  push('| --- | --- | --- | --- |')
  for (const t of topics) {
    const sources = plannedSources[t.code]
    const source = sources
      ? sources
          .map((s) => `\`${s}\`${existsSync(join(ROOT, 'archive', s)) ? ' (in archive/)' : ' (MISSING from archive/)'}`)
          .join('<br>')
      : '—'
    push(`| ${t.code} | ${topicName(t)} | ${t.layout ?? '—'} | ${source} |`)
  }
  push('')
}

/* ── referenced ids with no content yet ──────────────────────────────────── */

push(`## Referenced ids with no content yet — ${totals.planned}`, '')
if (plannedByTopic.length === 0) push('_None — every referenced id resolves._', '')
for (const { section, chapter, topic, ids } of plannedByTopic) {
  push(`### ${section} · ${chapter.code} → ${topic.code} ${topicName(topic)} (${ids.length})`, '')
  for (const id of ids) push(`- \`${id}\``)
  push('')
}

/* ── content docs missing their canonical locale ─────────────────────────── */

const missingCanonical = []
for (const group of docsByLecture.values()) {
  const canonical = CANONICAL_BY_TRACK[group.track] ?? group.trackLang
  if (!group.locales.has(canonical)) missingCanonical.push({ id: group.id, group, canonical })
}
push(`## Content docs missing their canonical locale — ${missingCanonical.length}`, '')
if (missingCanonical.length === 0) push('_None._', '')
for (const { id, group, canonical } of missingCanonical) {
  push(`- \`${id}\` (${group.section} · ${group.topic}): has ${[...group.locales].join(', ')} — missing **${canonical}**`)
}
push('')

/* ── orphan manifests (content no sidebar references) ───────────────────── */

/** Every id a sidebar references, keyed `topic\nid` — the resolution set. */
const referencedIds = new Set()
for (const sidebar of sidebars) {
  for (const chapter of sidebar.sections ?? []) {
    for (const topic of chapter.topics ?? []) {
      for (const id of topic.items ?? []) referencedIds.add(`${topic.code}\n${id}`)
    }
  }
}

/** Title manifests (chapter/topic audio) are never listed in `items` — they
 *  are addressed by their own code, so they are not orphans. */
const TITLE_KINDS = new Set(['chapter-title', 'topic-title', 'story-chapter', 'story-topic'])

const orphans = []
for (const sectionPath of new Set(Object.values(config.sections ?? {}))) {
  for (const file of walk(join(MEDIA, sectionPath), '.json')) {
    if (file.split(/[\\/]/).at(-1) !== 'item.json') continue
    const m = readJson(file)
    if (!m.code || !m.topic) continue
    if (TITLE_KINDS.has(m.kind)) continue
    if (!referencedIds.has(`${m.topic}\n${m.code}`)) {
      orphans.push({ section: sectionPath, topic: m.topic, code: m.code, kind: m.kind ?? '—', file })
    }
  }
}
orphans.sort((a, b) => (a.section + a.topic + a.code).localeCompare(b.section + b.topic + b.code))

push(`## Orphan manifests (content no sidebar references) — ${orphans.length}`, '')
push('> These manifests exist on disk and may be published to R2, but no sidebar `items[]`')
push('> lists them, so the site never renders them. Either add the id to its topic or retire')
push('> the manifest. Title manifests (`chapter-title` / `topic-title` / story titles) are')
push('> excluded — they are addressed by their own code, never by `items[]`.', '')
if (orphans.length === 0) push('_None._', '')
else {
  push('| section | topic | code | kind |')
  push('| --- | --- | --- | --- |')
  for (const o of orphans) push(`| ${o.section} | ${o.topic} | \`${o.code}\` | ${o.kind} |`)
}
push('')

/* ── report ──────────────────────────────────────────────────────────────── */

const report = [
  `# Missing-content inventory — ${new Date().toISOString()}`,
  '',
  '> Structure-first policy (manual/architecture.md): planned items are expected and never fail a',
  '> build. Fill them on the go: author a seed → `run scaffold <lang> <TOPIC> <seed.json>` → drop the',
  '> mp3s into `media/audio/<lang>/<TOPIC>/` → `run media manifest` → `run media upload --apply`.',
  '',
  '## Summary',
  '',
  `- sidebars: ${sidebars.length} · referenced item ids: ${totals.ids}`,
  `- planned ids (no manifest / entity / doc): **${totals.planned}**`,
  `- empty topics (no items): **${totals.empty}**`,
  `- orphan manifests (no sidebar reference): ${orphans.length}`,
  `- content docs missing their canonical locale: ${missingCanonical.length}`,
  '',
  ...lines
].join('\n')

mkdirSync(join(OUT, '..'), { recursive: true })
writeFileSync(OUT, report + '\n')

console.log(
  `missing-content: ${totals.planned} planned id(s) · ${totals.empty} empty topic(s) · ${orphans.length} orphan manifest(s) → ${OUT.replace(ROOT, '')}`
)
console.log('missing-content OK ✓ (informational only — a missing finding is never a failure)')
if (stdout) console.log('\n' + report)
