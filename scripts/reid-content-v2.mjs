#!/usr/bin/env node
/**
 * reid-content-v2.mjs — second re-identification pass.
 *
 *   1. Chapter prefixes: LH → LT (lecture), SH → ST (story). CH stays.
 *      LT01 = first lecture chapter, ST01 = first story chapter.
 *   2. Item codes become GLOBALLY unique within a track, not per topic:
 *      W001…W858 (dictionary), L001…L462 (lectures), S001…S58 (stories).
 *      Numbering follows the sidebar's teaching order (chapter → topic → item).
 *
 * Rewrites sidebars, manifest identity + R2 keys, folder names, and content
 * front matter. Audio files are MOVED with their folders — never deleted.
 *
 *   node scripts/reid-content-v2.mjs            # dry run
 *   node scripts/reid-content-v2.mjs --apply    # rewrite
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import grayMatter from 'gray-matter'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MEDIA = join(ROOT, 'media')
const CONTENT = join(ROOT, 'content')
const SIDEBARS = join(ROOT, 'src', 'data', 'sidebars', 'library')
const apply = process.argv.includes('--apply')

/** track → { oldChapterPrefix, newChapterPrefix, itemPrefix } */
const TRACKS = {
  dictionary: { from: 'CH', to: 'CH', item: 'W' },
  lectures: { from: 'LH', to: 'LT', item: 'L' },
  stories: { from: 'SH', to: 'ST', item: 'S' }
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'))
const writeJson = (p, data) => writeFileSync(p, JSON.stringify(data, null, 2) + '\n')
const pad = (n) => String(n).padStart(2, '0')
const code = (prefix, n) => `${prefix}${String(n).padStart(3, '0')}`

const plan = []
const warnings = []
const errors = []

/** Recursively delete a directory tree only if it is completely empty. */
function pruneEmpty(dir) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmpty(join(dir, entry.name))
  }
  if (readdirSync(dir).length === 0) rmdirSync(dir)
}

/* ── 1. Build the new code map ─────────────────────────────────────────── */

const maps = {}
for (const [track, cfg] of Object.entries(TRACKS)) {
  const sidebarPath = join(SIDEBARS, track, 'sidebar.json')
  if (!existsSync(sidebarPath)) {
    errors.push(`missing sidebar: ${relative(ROOT, sidebarPath)}`)
    continue
  }
  const sidebar = readJson(sidebarPath)
  const chapters = new Map() // old chapter → new chapter
  const topics = new Map() // old topic → new topic
  const items = new Map() // `${oldTopic}\n${oldItem}` → new item code

  let itemCounter = 0
  sidebar.sections.forEach((section, chapterIndex) => {
    const newChapter = `${cfg.to}${pad(chapterIndex + 1)}`
    chapters.set(section.code, newChapter)

    section.topics.forEach((topic, topicIndex) => {
      const newTopic = `${newChapter}T${pad(topicIndex + 1)}`
      topics.set(topic.code, newTopic)

      const topicDir = join(MEDIA, track, section.code, topic.code)
      for (const oldItem of topic.items) {
        // Only manifest-backed items get a new global code; legacy semantic
        // ids resolved through the entities bridge keep their id.
        if (!existsSync(join(topicDir, oldItem, 'item.json'))) {
          items.set(`${topic.code}\n${oldItem}`, oldItem)
          continue
        }
        itemCounter += 1
        items.set(`${topic.code}\n${oldItem}`, code(cfg.item, itemCounter))
      }

      // Orphan manifests (on disk, not in the sidebar) also need a globally
      // unique code — they are preserved, never dropped.
      if (existsSync(topicDir)) {
        const sidebarItems = new Set(topic.items)
        for (const entry of readdirSync(topicDir, { withFileTypes: true })) {
          if (!entry.isDirectory() || entry.name === 'sound' || entry.name === 'read') continue
          if (sidebarItems.has(entry.name)) continue
          if (!existsSync(join(topicDir, entry.name, 'item.json'))) continue
          itemCounter += 1
          items.set(`${topic.code}\n${entry.name}`, code(cfg.item, itemCounter))
        }
      }
    })
  })

  maps[track] = { sidebar, sidebarPath, chapters, topics, items, cfg, totalItems: itemCounter }
}

if (errors.length) {
  for (const e of errors) console.error(`ERROR: ${e}`)
  process.exit(1)
}

/* ── 2. Rewrite the sidebars ───────────────────────────────────────────── */

for (const [track, m] of Object.entries(maps)) {
  const { sidebar, cfg } = m
  sidebar.sections.forEach((section, chapterIndex) => {
    const oldChapter = section.code
    const newChapter = `${cfg.to}${pad(chapterIndex + 1)}`
    section.code = newChapter

    section.topics.forEach((topic, topicIndex) => {
      const oldTopic = topic.code
      const newTopic = `${newChapter}T${pad(topicIndex + 1)}`
      topic.code = newTopic

      topic.items = topic.items.map((oldItem) => {
        const next = m.items.get(`${oldTopic}\n${oldItem}`) ?? oldItem
        if (next !== oldItem) plan.push({ kind: 'item', from: `${oldTopic}:${oldItem}`, to: next })
        return next
      })
    })
  })
}

/* ── 3. Collect manifest + content moves ───────────────────────────────── */

const manifestJobs = []
const contentJobs = []

for (const [track, m] of Object.entries(maps)) {
  const trackRoot = join(MEDIA, track)
  if (!existsSync(trackRoot)) continue

  for (const section of m.sidebar.sections) {
    for (const topic of section.topics) {
      const oldTopic = [...m.topics.entries()].find(([, v]) => v === topic.code)?.[0]
      const oldChapter = [...m.chapters.entries()].find(([, v]) => v === section.code)?.[0]
      if (!oldTopic || !oldChapter) continue

      const oldTopicDir = join(trackRoot, oldChapter, oldTopic)
      const newTopicDir = join(trackRoot, section.code, topic.code)
      if (!existsSync(oldTopicDir)) continue

      for (const entry of readdirSync(oldTopicDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const oldCode = entry.name
        const manifestPath = join(oldTopicDir, oldCode, 'item.json')
        if (!existsSync(manifestPath)) continue

        const newCode = m.items.get(`${oldTopic}\n${oldCode}`) ?? oldCode
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
          newChapter: section.code
        })
      }
    }
  }
}

// Title manifests (chapter-title / topic-title) sit one level above items.
const titleJobs = []
for (const [track, m] of Object.entries(maps)) {
  const trackRoot = join(MEDIA, track)
  if (!existsSync(trackRoot)) continue
  for (const [oldChapter, newChapter] of m.chapters) {
    const oldChapterDir = join(trackRoot, oldChapter)
    if (!existsSync(oldChapterDir)) continue
    if (existsSync(join(oldChapterDir, 'item.json'))) {
      titleJobs.push({
        track,
        manifestPath: join(oldChapterDir, 'item.json'),
        oldDir: oldChapterDir,
        newDir: join(trackRoot, newChapter),
        oldCode: oldChapter,
        newCode: newChapter,
        kind: 'chapter-title'
      })
    }
    for (const [oldTopic, newTopic] of m.topics) {
      if (!oldTopic.startsWith(oldChapter)) continue
      const p = join(oldChapterDir, oldTopic, 'item.json')
      if (!existsSync(p)) continue
      titleJobs.push({
        track,
        manifestPath: p,
        oldDir: join(oldChapterDir, oldTopic),
        newDir: join(trackRoot, newChapter, newTopic),
        oldCode: oldTopic,
        newCode: newTopic,
        kind: 'topic-title'
      })
    }
  }
}

// Content article folders.
for (const [track, m] of Object.entries(maps)) {
  const trackRoot = join(CONTENT, track)
  if (!existsSync(trackRoot)) continue
  for (const section of m.sidebar.sections) {
    for (const topic of section.topics) {
      const oldTopic = [...m.topics.entries()].find(([, v]) => v === topic.code)?.[0]
      if (!oldTopic) continue
      const oldTopicDir = join(trackRoot, oldTopic)
      if (!existsSync(oldTopicDir)) continue
      for (const entry of readdirSync(oldTopicDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const oldCode = entry.name
        const newCode = m.items.get(`${oldTopic}\n${oldCode}`) ?? oldCode
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

/* ── 4. Report ─────────────────────────────────────────────────────────── */

console.log(`reid-content-v2: ${apply ? 'APPLY' : 'DRY RUN'}`)
for (const [track, m] of Object.entries(maps)) {
  console.log(`  ${track}: ${m.sidebar.sections.length} chapters · ${m.totalItems} manifest-backed items`)
}
console.log(`  manifests: ${manifestJobs.length} · titles: ${titleJobs.length} · content folders: ${contentJobs.length}`)
if (warnings.length) for (const w of warnings.slice(0, 10)) console.log(`  ! ${w}`)

if (!apply) {
  console.log('\nSample:')
  for (const [track, m] of Object.entries(maps)) {
    const ch = [...m.chapters.entries()][0]
    const tp = [...m.topics.entries()][0]
    const it = [...m.items.entries()].find(([, v]) => /^[WLS]\d{3}$/.test(v))
    console.log(`  ${track}: ${ch[0]}→${ch[1]} · ${tp[0]}→${tp[1]} · ${it ? `${it[0].split('\n')[1]}→${it[1]}` : '—'}`)
  }
  console.log('\nRe-run with --apply to write.')
  process.exit(0)
}

/* ── 5. Apply ──────────────────────────────────────────────────────────── */

// Pre-flight: every move target must be free. Abort before touching anything
// so a collision can never leave the tree half-migrated.
const collisions = []
for (const job of manifestJobs) {
  if (job.oldDir !== job.newDir && existsSync(job.newDir)) {
    collisions.push(`media target exists: ${relative(ROOT, job.newDir)}`)
  }
}
for (const job of contentJobs) {
  if (job.oldDir !== job.newDir && existsSync(job.newDir)) {
    collisions.push(`content target exists: ${relative(ROOT, job.newDir)}`)
  }
}
if (collisions.length) {
  for (const c of collisions.slice(0, 20)) console.error(`ERROR: ${c}`)
  console.error(`reid-content-v2 ABORTED — ${collisions.length} collision(s); nothing was written.`)
  process.exit(1)
}

for (const m of Object.values(maps)) writeJson(m.sidebarPath, m.sidebar)

// Item manifests: rewrite identity + R2 keys, then move the folder (audio included).
for (const job of manifestJobs) {
  const manifest = readJson(job.manifestPath)
  manifest.code = job.newCode
  manifest.topic = job.newTopic
  manifest.chapter = job.newChapter
  manifest.entity_id = `${job.newTopic}:${job.newCode}`

  const keyBase = `${job.track}/${job.newChapter}/${job.newTopic}/${job.newCode}`
  for (const field of ['audio', 'read']) {
    const map = manifest[field]
    if (!map || typeof map !== 'object') continue
    for (const descriptor of Object.values(map)) {
      if (descriptor && typeof descriptor === 'object' && descriptor.key) {
        descriptor.key = `${keyBase}/${descriptor.file}`
      }
    }
  }
  writeJson(job.manifestPath, manifest)

  if (job.oldDir !== job.newDir) {
    if (existsSync(job.newDir)) {
      errors.push(`target exists: ${relative(ROOT, job.newDir)}`)
      continue
    }
    mkdirSync(dirname(job.newDir), { recursive: true })
    renameSync(job.oldDir, job.newDir)
  }
}

// Title manifests: move the manifest file (and its sound/ folder) into place.
for (const job of titleJobs) {
  const manifest = readJson(job.manifestPath)
  manifest.code = job.newCode
  manifest.topic = job.newCode
  manifest.entity_id = job.newCode
  manifest.chapter = job.kind === 'chapter-title' ? job.newCode : job.newDir.split(/[\\/]/).at(-2)

  const keyBase = relative(MEDIA, job.newDir).replaceAll('\\', '/')
  for (const field of ['audio', 'read']) {
    const map = manifest[field]
    if (!map || typeof map !== 'object') continue
    for (const descriptor of Object.values(map)) {
      if (descriptor && typeof descriptor === 'object' && descriptor.key) {
        descriptor.key = `${keyBase}/${descriptor.file}`
      }
    }
  }

  mkdirSync(job.newDir, { recursive: true })
  writeJson(join(job.newDir, 'item.json'), manifest)

  const oldSound = join(job.oldDir, 'sound')
  const newSound = join(job.newDir, 'sound')
  if (existsSync(oldSound) && !existsSync(newSound)) renameSync(oldSound, newSound)
}

// Content folders: rewrite front matter, then move.
for (const job of contentJobs) {
  if (!existsSync(job.oldDir)) continue
  for (const file of readdirSync(job.oldDir).filter((f) => f.endsWith('.md'))) {
    const path = join(job.oldDir, file)
    const { data, content } = grayMatter(readFileSync(path, 'utf-8'))
    data.topic = job.newTopic
    data.article = job.newCode
    if (data.entity_id) data.entity_id = `${job.newTopic}:${job.newCode}`
    writeFileSync(path, grayMatter.stringify(content, data))
  }
  if (job.oldDir !== job.newDir) {
    if (existsSync(job.newDir)) {
      errors.push(`target content exists: ${relative(ROOT, job.newDir)}`)
      continue
    }
    mkdirSync(dirname(job.newDir), { recursive: true })
    renameSync(job.oldDir, job.newDir)
  }
}

// Prune the old chapter trees (now empty of manifests and audio).
for (const [track, m] of Object.entries(maps)) {
  for (const root of [join(MEDIA, track), join(CONTENT, track)]) {
    if (!existsSync(root)) continue
    for (const [oldChapter] of m.chapters) pruneEmpty(join(root, oldChapter))
  }
}

if (errors.length) {
  for (const e of errors) console.error(`ERROR: ${e}`)
  process.exit(1)
}

console.log('\nreid-content-v2 OK ✓ — run `./run.sh media index` to rebuild the runtime payloads.')
