#!/usr/bin/env node
/**
 * seed-track-titles.mjs — pending title manifests for the lectures and stories
 * tracks, mirroring what scripts/seed-titles.mjs does for the dictionary.
 *
 * The dictionary's titles were seeded chapter by chapter; the other two tracks
 * never were, so their chapter and topic rows render a disabled "audio coming
 * soon" button in every language (useTitles finds no entry in titles.json).
 * This script creates the missing manifests from the sidebar — the structure
 * the UI renders — so `generate-audio.py --audio` has something to record.
 *
 *   node scripts/seed-track-titles.mjs <track> [--apply]
 *
 * Layout (same convention as the dictionary):
 *   media/<track>/<chapterCode>/item.json          chapter title
 *   media/<track>/<chapterCode>/<topicCode>/item.json  topic title
 *
 * Kind per track: lectures -> chapter-title / topic-title,
 *                 stories  -> story-chapter / story-topic.
 *
 * Existing manifests are never touched: a title that already has a manifest
 * keeps its hand-authored rows and its recordings.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOCALES } from './lib/locales.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SIDEBARS = join(ROOT, 'src', 'data', 'sidebars', 'library')

/** Track -> the two title kinds its manifests carry. */
const KINDS = {
  lectures: { chapter: 'chapter-title', topic: 'topic-title' },
  stories: { chapter: 'story-chapter', topic: 'story-topic' }
}

function fail(message) {
  console.error(`ERROR: ${message}`)
  process.exit(1)
}

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const track = args.find((arg) => !arg.startsWith('--'))
if (!track || !KINDS[track]) fail(`usage: seed-track-titles.mjs <${Object.keys(KINDS).join('|')}> [--apply]`)

const kinds = KINDS[track]
const sidebarPath = join(SIDEBARS, track, 'sidebar.json')
if (!existsSync(sidebarPath)) fail(`missing sidebar: ${sidebarPath}`)
const sidebar = JSON.parse(readFileSync(sidebarPath, 'utf-8'))

/** One manifest per title, carrying every locale's row. No `files` entry —
 *  the UI renders it as "audio coming soon" until a recording lands. */
function manifestFor(code, chapterCode, names, kind) {
  const locales = {}
  for (const locale of LOCALES) {
    const name = names?.[locale]
    if (name) locales[locale] = { name }
  }
  return {
    code,
    track,
    chapter: chapterCode,
    topic: kind === kinds.chapter ? chapterCode : code,
    kind,
    entity_id: code,
    locales,
    tags: [`title#${kind === kinds.chapter ? 'chapter' : 'topic'}`]
  }
}

const planned = []
for (const section of sidebar.sections ?? []) {
  const chapterCode = section.code
  planned.push({
    code: chapterCode,
    kind: kinds.chapter,
    dir: join(ROOT, 'media', track, chapterCode),
    manifest: manifestFor(chapterCode, chapterCode, section.names, kinds.chapter)
  })
  for (const topic of section.topics ?? []) {
    planned.push({
      code: topic.code,
      kind: kinds.topic,
      dir: join(ROOT, 'media', track, chapterCode, topic.code),
      manifest: manifestFor(topic.code, chapterCode, topic.names, kinds.topic)
    })
  }
}

const missing = planned.filter((entry) => !existsSync(join(entry.dir, 'item.json')))
const existing = planned.length - missing.length
console.log(
  `${track}: ${planned.length} title(s) in the sidebar — ${existing} already have a manifest, ` +
    `${missing.length} missing.`
)
if (!apply) {
  for (const entry of missing) console.log(`would create: media/${track}/${entry.code} (${entry.kind})`)
  console.log('Run with --apply to write the pending manifests.')
  process.exit(0)
}

let written = 0
for (const entry of missing) {
  mkdirSync(entry.dir, { recursive: true })
  writeFileSync(join(entry.dir, 'item.json'), `${JSON.stringify(entry.manifest, null, 2)}\n`, 'utf-8')
  written += 1
}
console.log(`Created ${written} pending title manifest(s) for ${track}.`)
