#!/usr/bin/env node
/**
 * reid-content.mjs — one-time re-identification of chapters, topics and items.
 *
 * Goals (see manual/curriculum.md):
 *   1. Chapter codes become CH01…CH12 (dictionary), LH01…LH12 (lectures),
 *      SH01…SH12 (stories) — no longer confusable with CEFR levels.
 *   2. Topic codes follow their chapter: CH01T01, LH01T01, SH01T01.
 *   3. Item codes restart per topic folder: W001 (word), L001 (lecture),
 *      S001 (story) — assigned in the sidebar's teaching order.
 *   4. Every item manifest gains a `cefr` attribute (A1…C2), inherited from
 *      its topic's `level` unless the manifest already declares one.
 *
 * What is rewritten:
 *   - src/data/sidebars/library/<track>/sidebar.json  (chapter/topic/item codes)
 *   - media/<track>/<CH>/<TOPIC>/<CODE>/item.json     (code, topic, chapter,
 *                                                      entity_id, cefr)
 *   - media/<track>/<CH>/<TOPIC>/<CODE>/              (folder renamed to CODE)
 *   - content/<track>/<TOPIC>/<CODE>/<locale>.md      (folder renamed, front
 *                                                      matter topic/article)
 *   - public/data/entities/*.json                     (legacy bridge ids)
 *
 * Physical media filenames (sound/en.mp3, read/en.mp3) and R2 keys are NOT
 * touched — only the manifest's identity fields and its folder name.
 *
 * Progress is keyed by entity_id in Supabase; this script RESETS it by design
 * (the old keys no longer exist). Run with --apply to write.
 *
 *   node scripts/reid-content.mjs            # dry run — print the plan
 *   node scripts/reid-content.mjs --apply    # rewrite sidebars, manifests, folders
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import grayMatter from 'gray-matter'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MEDIA = join(ROOT, 'media')
const CONTENT = join(ROOT, 'content')
const SIDEBARS = join(ROOT, 'src', 'data', 'sidebars', 'library')
const ENTITIES = join(ROOT, 'public', 'data', 'entities')
const apply = process.argv.includes('--apply')

/** Track → chapter prefix and item prefix. */
const TRACKS = {
  dictionary: { chapter: 'CH', item: 'W' },
  lectures: { chapter: 'LH', item: 'L' },
  stories: { chapter: 'SH', item: 'S' }
}

const CEFR = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])

const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'))
const writeJson = (p, data) => writeFileSync(p, JSON.stringify(data, null, 2) + '\n')
const pad = (n) => String(n).padStart(2, '0')
const itemCode = (prefix, n) => `${prefix}${String(n).padStart(3, '0')}`

const plan = []
const warnings = []
const errors = []

function note(kind, from, to) {
  plan.push({ kind, from, to })
}

/** Recursively delete a directory tree if every leaf has been moved out. */
function pruneEmpty(dir) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmpty(join(dir, entry.name))
  }
  if (readdirSync(dir).length === 0) rmdirSync(dir)
}

/* ── 1. Build the code map from the sidebars ───────────────────────────── */

/** track → { chapters: Map(old→new), topics: Map(old→new), items: Map(`${topic}\n${old}`→new) } */
const maps = {}

for (const [track, cfg] of Object.entries(TRACKS)) {
  const sidebarPath = join(SIDEBARS, track, 'sidebar.json')
  if (!existsSync(sidebarPath)) {
    errors.push(`missing sidebar: ${relative(ROOT, sidebarPath)}`)
    continue
  }
  const sidebar = readJson(sidebarPath)
  const chapters = new Map()
  const topics = new Map()
  const items = new Map()

  sidebar.sections.forEach((section, chapterIndex) => {
    const newChapter = `${cfg.chapter}${pad(chapterIndex + 1)}`
    chapters.set(section.code, newChapter)

    section.topics.forEach((topic, topicIndex) => {
      const newTopic = `${newChapter}T${pad(topicIndex + 1)}`
      topics.set(topic.code, newTopic)

      // Only items that have a manifest on disk get a new sequential code.
      // Legacy semantic ids (resolved through the public/data/entities bridge)
      // keep their id — renumbering them would break that lookup.
      const topicDir = join(MEDIA, track, section.code, topic.code)
      let n = 0
      topic.items.forEach((oldItem) => {
        const hasManifest = existsSync(join(topicDir, oldItem, 'item.json'))
        if (!hasManifest) {
          items.set(`${topic.code}\n${oldItem}`, oldItem)
          return
        }
        n += 1
        items.set(`${topic.code}\n${oldItem}`, itemCode(cfg.item, n))
      })
    })
  })

  maps[track] = { sidebar, sidebarPath, chapters, topics, items, cfg }
}

if (errors.length) {
  for (const e of errors) console.error(`ERROR: ${e}`)
  process.exit(1)
}

/* ── 2. Rewrite the sidebars ───────────────────────────────────────────── */

for (const [track, m] of Object.entries(maps)) {
  const { sidebar, cfg } = m
  /** Old topic code for a topic that has already been renamed in this pass. */
  const oldTopicFor = (newTopic) => [...m.topics.entries()].find(([, v]) => v === newTopic)?.[0] ?? newTopic

  sidebar.sections.forEach((section, chapterIndex) => {
    const newChapter = `${cfg.chapter}${pad(chapterIndex + 1)}`
    note('chapter', section.code, newChapter)
    section.code = newChapter

    section.topics.forEach((topic, topicIndex) => {
      const newTopic = `${newChapter}T${pad(topicIndex + 1)}`
      const oldTopic = topic.code
      note('topic', oldTopic, newTopic)
      topic.code = newTopic

      topic.items = topic.items.map((oldItem) => {
        const next = m.items.get(`${oldTopic}\n${oldItem}`) ?? oldItem
        if (next !== oldItem) note('item', `${oldTopic}:${oldItem}`, next)
        return next
      })

      // CEFR lives on the topic; keep it valid.
      if (topic.level && !CEFR.has(topic.level)) {
        warnings.push(`${track} ${newTopic}: non-CEFR level '${topic.level}'`)
      }
    })
  })
}

/* ── 3. Rewrite media manifests + rename their folders ─────────────────── */

/** Old topic code → { track, newTopic, newChapter, level } for manifest lookup. */
const topicInfo = new Map()
for (const [track, m] of Object.entries(maps)) {
  for (const section of m.sidebar.sections) {
    for (const topic of section.topics) {
      topicInfo.set(topic.code, { track, level: topic.level ?? null })
    }
  }
}

/** Reverse maps: new topic → old topic (to find the on-disk folder). */
const oldTopicByNew = new Map()
for (const [track, m] of Object.entries(maps)) {
  for (const [oldTopic, newTopic] of m.topics) oldTopicByNew.set(`${track}\n${newTopic}`, oldTopic)
}

const manifestJobs = []

for (const [track, m] of Object.entries(maps)) {
  const trackRoot = join(MEDIA, track)
  const cfg = m.cfg
  if (!existsSync(trackRoot)) continue

  for (const section of m.sidebar.sections) {
    for (const topic of section.topics) {
      const oldTopic = oldTopicByNew.get(`${track}\n${topic.code}`)
      if (!oldTopic) continue
      const oldChapter = [...m.chapters.entries()].find(([, v]) => v === section.code)?.[0]
      if (!oldChapter) continue

      const oldTopicDir = join(trackRoot, oldChapter, oldTopic)
      const newTopicDir = join(trackRoot, section.code, topic.code)
      if (!existsSync(oldTopicDir)) continue

      for (const entry of readdirSync(oldTopicDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const oldCode = entry.name
        const newCode = m.items.get(`${oldTopic}\n${oldCode}`)
        if (!newCode) {
          // Orphan manifest: on disk but not referenced by the sidebar (e.g.
          // retired phonics examples). Preserve it — move it with its topic and
          // give it the next free code in this topic's sequence, so it never
          // collides with a sidebar item.
          const orphanManifest = join(oldTopicDir, oldCode, 'item.json')
          if (!existsSync(orphanManifest)) continue
          const used = new Set(
            [...m.items.entries()]
              .filter(([k]) => k.startsWith(`${oldTopic}\n`))
              .map(([, v]) => v)
          )
          let n = used.size + 1
          let orphanCode = itemCode(cfg.item, n)
          while (used.has(orphanCode)) orphanCode = itemCode(cfg.item, ++n)
          used.add(orphanCode)
          m.items.set(`${oldTopic}\n${oldCode}`, orphanCode)
          manifestJobs.push({
            track,
            manifestPath: orphanManifest,
            oldDir: join(oldTopicDir, oldCode),
            newDir: join(newTopicDir, orphanCode),
            oldCode,
            newCode: orphanCode,
            oldTopic,
            newTopic: topic.code,
            oldChapter,
            newChapter: section.code,
            level: topic.level ?? null,
            orphan: true
          })
          continue
        }
        const manifestPath = join(oldTopicDir, oldCode, 'item.json')
        if (!existsSync(manifestPath)) {
          warnings.push(`${track} ${oldTopic}/${oldCode}: no item.json`)
          continue
        }
        manifestJobs.push({
          track,
          manifestPath,
          oldDir: join(oldTopicDir, oldCode),
          newDir: join(newTopicDir, newCode),
          oldCode,
          newCode,
          oldTopic,
          newTopic: topic.code,
          oldChapter,
          newChapter: section.code,
          level: topic.level ?? null
        })
      }
    }
  }
}

for (const job of manifestJobs) {
  const manifest = readJson(job.manifestPath)
  const isTitle = ['chapter-title', 'topic-title'].includes(manifest.kind)

  manifest.code = job.newCode
  manifest.topic = job.newTopic
  manifest.chapter = job.newChapter
  manifest.entity_id = `${job.newTopic}:${job.newCode}`

  // CEFR: inherit the topic level unless the manifest already declares one.
  if (!manifest.cefr) {
    if (job.level && CEFR.has(job.level)) manifest.cefr = job.level
    else warnings.push(`${job.track} ${job.newTopic}/${job.newCode}: no CEFR level to inherit`)
  } else if (!CEFR.has(manifest.cefr)) {
    warnings.push(`${job.track} ${job.newTopic}/${job.newCode}: invalid cefr '${manifest.cefr}'`)
  }

  if (isTitle) {
    // Title manifests are keyed by the chapter/topic code itself.
    manifest.code = job.newChapter
    manifest.entity_id = job.newChapter
  }

  job.manifest = manifest
  if (!job.orphan) note('manifest', `${job.oldTopic}/${job.oldCode}`, `${job.newTopic}/${job.newCode}`)
}

/* ── 3b. Title manifests (chapter-title / topic-title) ────────────────────
 *
 * These live at media/<track>/<CH>/item.json and media/<track>/<CH>/<TOPIC>/
 * item.json — one level above the item folders, so the item sweep above never
 * sees them. They are keyed by the chapter/topic code itself.
 */

const titleJobs = []
for (const [track, m] of Object.entries(maps)) {
  const trackRoot = join(MEDIA, track)
  if (!existsSync(trackRoot)) continue

  for (const [oldChapter, newChapter] of m.chapters) {
    const oldChapterDir = join(trackRoot, oldChapter)
    if (!existsSync(oldChapterDir)) continue

    const chapterManifest = join(oldChapterDir, 'item.json')
    if (existsSync(chapterManifest)) {
      titleJobs.push({
        track,
        manifestPath: chapterManifest,
        oldDir: oldChapterDir,
        newDir: join(trackRoot, newChapter),
        oldCode: oldChapter,
        newCode: newChapter,
        kind: 'chapter-title'
      })
    }

    for (const [oldTopic, newTopic] of m.topics) {
      if (!oldTopic.startsWith(oldChapter)) continue
      const topicManifest = join(oldChapterDir, oldTopic, 'item.json')
      if (!existsSync(topicManifest)) continue
      titleJobs.push({
        track,
        manifestPath: topicManifest,
        oldDir: join(oldChapterDir, oldTopic),
        newDir: join(trackRoot, newChapter, newTopic),
        oldCode: oldTopic,
        newCode: newTopic,
        kind: 'topic-title'
      })
    }
  }
}

for (const job of titleJobs) {
  const manifest = readJson(job.manifestPath)
  manifest.code = job.newCode
  // Chapter-title manifests sit at the chapter root; topic-title manifests sit
  // one level down. Derive `chapter` from the target path, not the code.
  const parts = job.newDir.split(/[\\/]/)
  manifest.chapter = parts.at(-1) === job.newCode && job.kind === 'chapter-title' ? job.newCode : parts.at(-2)
  manifest.topic = job.newCode
  manifest.entity_id = job.newCode
  job.manifest = manifest
  note('title', `${job.track}/${job.oldCode}`, `${job.track}/${job.newCode}`)
}

/* ── 4. Rewrite content article folders + front matter ─────────────────── */

const contentJobs = []
for (const [track, m] of Object.entries(maps)) {
  const trackRoot = join(CONTENT, track)
  if (!existsSync(trackRoot)) continue

  for (const section of m.sidebar.sections) {
    for (const topic of section.topics) {
      const oldTopic = oldTopicByNew.get(`${track}\n${topic.code}`)
      if (!oldTopic) continue
      const oldTopicDir = join(trackRoot, oldTopic)
      if (!existsSync(oldTopicDir)) continue

      for (const entry of readdirSync(oldTopicDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const oldCode = entry.name
        const newCode = m.items.get(`${oldTopic}\n${oldCode}`)
        if (!newCode) {
          warnings.push(`content ${track}/${oldTopic}/${oldCode}: no sidebar item — left in place`)
          continue
        }
        contentJobs.push({
          track,
          oldDir: join(oldTopicDir, oldCode),
          newDir: join(trackRoot, topic.code, newCode),
          oldTopic,
          newTopic: topic.code,
          oldCode,
          newCode
        })
      }
    }
  }
}

for (const job of contentJobs) {
  note('content', `${job.track}/${job.oldTopic}/${job.oldCode}`, `${job.track}/${job.newTopic}/${job.newCode}`)
}

/* ── 5. Legacy entity bridge ids ───────────────────────────────────────── */

const entityJobs = []
if (existsSync(ENTITIES)) {
  for (const file of readdirSync(ENTITIES).filter((f) => f.endsWith('.json'))) {
    const path = join(ENTITIES, file)
    const entities = readJson(path)
    let changed = false
    for (const entity of entities) {
      // Legacy ids look like word_salut / letter_a — they carry no topic code,
      // so only the progress alias map needs them. Nothing to rewrite here.
      if (entity.id && /^[CLS]\d+T\d+:/.test(entity.id)) changed = true
    }
    if (changed) entityJobs.push(path)
  }
}

/* ── 6. Report / apply ─────────────────────────────────────────────────── */

const counts = plan.reduce((acc, p) => ((acc[p.kind] = (acc[p.kind] ?? 0) + 1), acc), {})
console.log(`reid-content: ${apply ? 'APPLY' : 'DRY RUN'}`)
console.log(`  chapters: ${counts.chapter ?? 0} · topics: ${counts.topic ?? 0} · items: ${counts.item ?? 0}`)
console.log(`  manifests: ${manifestJobs.length} · content folders: ${contentJobs.length}`)
if (warnings.length) {
  console.log(`  warnings: ${warnings.length}`)
  for (const w of warnings.slice(0, 20)) console.log(`    ! ${w}`)
  if (warnings.length > 20) console.log(`    … and ${warnings.length - 20} more`)
}

if (!apply) {
  console.log('\nSample mapping:')
  for (const p of plan.filter((x) => x.kind === 'chapter').slice(0, 4)) console.log(`  chapter ${p.from} → ${p.to}`)
  for (const p of plan.filter((x) => x.kind === 'topic').slice(0, 4)) console.log(`  topic   ${p.from} → ${p.to}`)
  for (const p of plan.filter((x) => x.kind === 'item').slice(0, 6)) console.log(`  item    ${p.from} → ${p.to}`)
  console.log('\nRe-run with --apply to write.')
  process.exit(0)
}

// Sidebars
for (const m of Object.values(maps)) writeJson(m.sidebarPath, m.sidebar)

// Manifests: write the new identity, then move the folder.
for (const job of manifestJobs) {
  writeJson(job.manifestPath, job.manifest)
  if (job.oldDir !== job.newDir) {
    if (existsSync(job.newDir)) {
      errors.push(`target folder already exists: ${relative(ROOT, job.newDir)}`)
      continue
    }
    mkdirSync(dirname(job.newDir), { recursive: true })
    renameSync(job.oldDir, job.newDir)
  }
}

// Title manifests: rewrite identity, then place the manifest at its new path.
// Both chapter-title and topic-title manifests sit in directories the item
// sweep has already created (the chapter root and the topic folder), so only
// the manifest FILE moves — never the directory.
for (const job of titleJobs) {
  const target = join(job.newDir, 'item.json')
  mkdirSync(job.newDir, { recursive: true })
  writeJson(target, job.manifest)
  // The title's own audio lives in a sibling sound/ folder — move it too.
  const oldSound = join(job.oldDir, 'sound')
  const newSound = join(job.newDir, 'sound')
  if (existsSync(oldSound) && !existsSync(newSound)) {
    renameSync(oldSound, newSound)
  }
  if (job.manifestPath !== target && existsSync(job.manifestPath)) {
    try { unlinkSync(job.manifestPath) } catch { /* already gone */ }
  }
}

// Content folders: rewrite front matter, then move.
for (const job of contentJobs) {
  if (!existsSync(job.oldDir)) continue
  for (const file of readdirSync(job.oldDir).filter((f) => f.endsWith('.md'))) {
    const path = join(job.oldDir, file)
    const { data, content } = grayMatter(readFileSync(path, 'utf-8'))
    data.topic = job.newTopic
    data.article = job.newCode
    // entity_id is the language-independent progress identity — it must follow
    // the new topic/code pair, or the content overlay rejects the doc.
    if (data.entity_id) data.entity_id = `${job.newTopic}:${job.newCode}`
    writeFileSync(path, grayMatter.stringify(content, data))
  }
  if (job.oldDir !== job.newDir) {
    if (existsSync(job.newDir)) {
      errors.push(`target content folder already exists: ${relative(ROOT, job.newDir)}`)
      continue
    }
    mkdirSync(dirname(job.newDir), { recursive: true })
    renameSync(job.oldDir, job.newDir)
  }
}

// Remove the now-empty old chapter/topic directories (their manifests and item
// folders have all been relocated above).
for (const [track, m] of Object.entries(maps)) {
  for (const root of [join(MEDIA, track), join(CONTENT, track)]) {
    if (!existsSync(root)) continue
    for (const [oldChapter] of m.chapters) {
      const oldChapterDir = join(root, oldChapter)
      if (!existsSync(oldChapterDir)) continue
      pruneEmpty(oldChapterDir)
    }
  }
}

if (errors.length) {
  for (const e of errors) console.error(`ERROR: ${e}`)
  process.exit(1)
}

console.log('\nreid-content OK ✓ — run `./run.sh media index` to rebuild the runtime payloads.')
