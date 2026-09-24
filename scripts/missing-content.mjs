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
 *   - pinned ids without a manifest
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
const ENTITIES = join(ROOT, 'public', 'data', 'entities')
const CONTENT = join(ROOT, 'content')
const SIDEBARS = join(ROOT, 'src', 'data', 'sidebars')
const CONFIG = join(ROOT, 'src', 'data', 'media.config.json')
const TOPIC_MAP = join(ROOT, 'src', 'data', 'sidebars', 'library', 'dictionary', 'topic-map.json')
const PINS = join(ROOT, 'src', 'data', 'sidebars', 'library', 'dictionary', 'pins.json')
const OUT = join(ROOT, 'temp', 'missing-content.md')

/** Canonical locale per track (mirrors validate-data / media-index). */
const CANONICAL_BY_TRACK = { lectures: 'en' } // stories: the track language

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

/** Manifest ids under every configured section path (media/<sectionPath>/**.json). */
const manifestIds = new Set()
for (const sectionPath of new Set(Object.values(config.sections ?? {}))) {
  for (const file of walk(join(MEDIA, sectionPath), '.json')) {
    const m = readJson(file)
    if (m.id) manifestIds.add(m.id)
  }
}

/** Legacy entity ids — the transitional bridge. */
const entityIds = new Set()
if (existsSync(ENTITIES)) {
  for (const file of readdirSync(ENTITIES).filter((f) => f.endsWith('.json'))) {
    for (const e of readJson(join(ENTITIES, file))) if (e.id) entityIds.add(e.id)
  }
}

/** Content docs grouped by lecture id: content/<track>/<trackLang>/<TOPIC>/<ID>/<locale>.md */
const docsByLecture = new Map() // id → { section, trackLang, topic, locales: Set<string> }
for (const file of walk(CONTENT, '.md')) {
  const parts = file.slice(CONTENT.length + 1).split(/[\\/]/)
  if (parts.length !== 5) continue
  const [track, trackLang, topic, id, docName] = parts
  const group = docsByLecture.get(id) ?? { section: `library/${track}`, trackLang, topic, locales: new Set() }
  group.locales.add(docName.replace(/\.md$/, ''))
  docsByLecture.set(id, group)
}

/** The dictionary's planned-topic registry (archive source per blank topic). */
const plannedSources = existsSync(TOPIC_MAP) ? readJson(TOPIC_MAP).planned ?? {} : {}

/** Pinned ids (restructured items that must live in another section's sidebar). */
const pins = existsSync(PINS) ? readJson(PINS) : {}

const isResolved = (id) => manifestIds.has(id) || entityIds.has(id) || docsByLecture.has(id)

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
      const plannedItems = items.filter((id) => !isResolved(id))
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

/* ── pins without a manifest ─────────────────────────────────────────────── */

const pinsWithoutManifest = Object.entries(pins)
  .filter(([id]) => !manifestIds.has(id))
  .map(([id, pin]) => `- \`${id}\` → ${pin.section} · ${pin.topic}`)
push(`## Pinned ids without a manifest — ${pinsWithoutManifest.length}`, '')
if (pinsWithoutManifest.length === 0) push('_None._', '')
for (const p of pinsWithoutManifest) push(p)
push('')

/* ── content docs missing their canonical locale ─────────────────────────── */

const missingCanonical = []
for (const [id, group] of docsByLecture) {
  const canonical = CANONICAL_BY_TRACK[group.track] ?? group.trackLang
  if (!group.locales.has(canonical)) missingCanonical.push({ id, group, canonical })
}
push(`## Content docs missing their canonical locale — ${missingCanonical.length}`, '')
if (missingCanonical.length === 0) push('_None._', '')
for (const { id, group, canonical } of missingCanonical) {
  push(`- \`${id}\` (${group.section} · ${group.topic}): has ${[...group.locales].join(', ')} — missing **${canonical}**`)
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
  `- pinned ids without a manifest: ${pinsWithoutManifest.length}`,
  `- content docs missing their canonical locale: ${missingCanonical.length}`,
  '',
  ...lines
].join('\n')

mkdirSync(join(OUT, '..'), { recursive: true })
writeFileSync(OUT, report + '\n')

console.log(
  `missing-content: ${totals.planned} planned id(s) · ${totals.empty} empty topic(s) → ${OUT.replace(ROOT, '')}`
)
console.log('missing-content OK ✓ (informational only — a missing finding is never a failure)')
if (stdout) console.log('\n' + report)
