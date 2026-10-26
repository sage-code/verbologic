#!/usr/bin/env node
/**
 * reattach-orphans.mjs — put finished manifests back into the sidebar.
 *
 *   node scripts/reattach-orphans.mjs --dry-run
 *   node scripts/reattach-orphans.mjs --apply
 *
 * `media/dictionary/CH01/CH01T01/` holds 77 manifests that the sidebar stopped
 * referencing in `47292ade` (the LT/ST re-key). They are finished content — 9
 * locales and 9 recordings each — so re-attaching them costs nothing.
 *
 * Two filters, because not all 77 belong in the dictionary:
 *
 * 1. PHONICS PATTERNS (`-stle`, `ch`, `-ough`, `kn-`, `th`) are alphabet
 *    material, tagged `alphabet#*`. The lecture track owns that now
 *    (src/data/alphabets/*.json), so they stay orphaned.
 * 2. DUPLICATES — 25 of the real words already exist under another code
 *    (book→CH01T08/W135, house→CH02T04/W200). Re-attaching them would show the
 *    same word twice.
 *
 * What is left is genuinely new vocabulary, placed in the topic it belongs to
 * rather than dumped back into "Greetings & farewells".
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MEDIA = join(ROOT, 'media', 'dictionary')
const SIDEBAR = join(ROOT, 'src', 'data', 'sidebars', 'library', 'dictionary', 'sidebar.json')

const apply = process.argv.includes('--apply')

/** Bare digraphs/trigraphs and dashed patterns — alphabet material, not words. */
const PHONICS = new Set([
  'ch', 'sh', 'th', 'ng', 'ph', 'gh', 'wh', 'ck', 'qu', 'kn', 'wr', 'gn',
  'mb', 'lk', 'bt', 'stle', 'ough', 'eigh', 'tion', 'sland', 'lf'
])

/** Where each genuinely-new word belongs, by its old CH01T01 code. */
const PLACEMENT = {
  W005: 'CH02T05', // apple → Food & ingredients
  W009: 'CH04T01', // city → Town places & buildings
  W014: 'CH04T01', // city (duplicate of W009 — skipped, see below)
  W073: 'CH04T01', // zoo → Town places & buildings
  W045: 'CH08T01', // ocean → Landscapes & landforms
  W050: 'CH08T02', // rose → Wild animals & plants
  W032: 'CH09T02', // job → Jobs & applications
  W070: 'CH10T03', // example → Scientific method
  W038: 'CH11T07', // myth → Abstract ideas & philosophy
  W066: 'CH11T07', // vision → Abstract ideas & philosophy
  W035: 'CH12T05', // luxury → Nuanced synonyms
  W006: 'CH01T04', // about → Simple questions
  W049: 'CH01T04', // around → Simple questions
  W008: 'CH02T04', // box → Furniture & household objects
  W022: 'CH03T01', // fly → Daily routine
  W027: 'CH06T07', // gym → Sports & PE
  W044: 'CH02T03', // open → House & rooms
  W046: 'CH07T05', // people → Culture & traditions
  W056: 'CH11T01', // sure → Opinions & debate
  W063: 'CH08T01', // top → Landscapes & landforms
  W064: 'CH10T03', // use → Scientific method
  W065: 'CH06T06', // voice → Arts & music
  W075: 'CH06T02', // language → Classroom language
  W077: 'CH06T02' // listen → Classroom language
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'))

/** Every manifest under a topic folder. */
function topicManifests(chapter, topic) {
  const dir = join(MEDIA, chapter, topic)
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'sound') continue
    const file = join(dir, entry.name, 'item.json')
    if (existsSync(file)) out.push({ path: file, manifest: readJson(file) })
  }
  return out
}

function main() {
  const sidebar = readJson(SIDEBAR)
  const referenced = new Set()
  for (const section of sidebar.sections) {
    for (const topic of section.topics) for (const id of topic.items ?? []) referenced.add(id)
  }

  // Romanian term → the code that already owns it, so a re-attach cannot
  // introduce a second row for the same word.
  const existingRo = new Map()
  for (const section of sidebar.sections) {
    for (const topic of section.topics) {
      for (const { manifest } of topicManifests(section.code, topic.code)) {
        if (!referenced.has(manifest.code)) continue
        const ro = manifest.locales?.ro?.name?.toLowerCase()
        if (ro) existingRo.set(ro, `${topic.code}/${manifest.code}`)
      }
    }
  }

  const orphans = topicManifests('CH01', 'CH01T01').filter(({ manifest }) => !referenced.has(manifest.code))

  const attached = []
  const skippedPhonics = []
  const skippedDuplicate = []
  const unplaced = []

  for (const { manifest } of orphans) {
    const en = (manifest.locales?.en?.name ?? '').trim()
    const bare = en.replace(/^-+|-+$/g, '').replace(/[()]/g, '').toLowerCase()
    if (en.startsWith('-') || en.endsWith('-') || PHONICS.has(bare)) {
      skippedPhonics.push(`${manifest.code} ${en}`)
      continue
    }
    const ro = manifest.locales?.ro?.name?.toLowerCase()
    if (ro && existingRo.has(ro)) {
      skippedDuplicate.push(`${manifest.code} ${en} → already ${existingRo.get(ro)}`)
      continue
    }
    const target = PLACEMENT[manifest.code]
    if (!target) {
      unplaced.push(`${manifest.code} ${en} / ${manifest.locales?.ro?.name}`)
      continue
    }
    const chapter = sidebar.sections.find((s) => s.topics.some((t) => t.code === target))
    const topic = chapter?.topics.find((t) => t.code === target)
    if (!topic) {
      unplaced.push(`${manifest.code} ${en} → unknown topic ${target}`)
      continue
    }
    if (!topic.items.includes(manifest.code)) topic.items.push(manifest.code)
    existingRo.set(ro, `${target}/${manifest.code}`)
    attached.push(`${manifest.code} ${en} → ${target}`)
  }

  console.log(`reattach: ${attached.length} word(s) placed`)
  for (const line of attached) console.log('  +', line)
  console.log(`reattach: ${skippedPhonics.length} phonics pattern(s) left orphaned (alphabet material)`)
  console.log(`reattach: ${skippedDuplicate.length} duplicate(s) skipped (already in the dictionary)`)
  if (unplaced.length) {
    console.log(`reattach: ${unplaced.length} word(s) have no placement:`)
    for (const line of unplaced) console.log('  ?', line)
  }

  if (!apply) {
    console.log('reattach: dry run — nothing written')
    return
  }
  writeFileSync(SIDEBAR, JSON.stringify(sidebar, null, 2) + '\n')
  console.log('reattach: sidebar written')
}

main()
