#!/usr/bin/env node
/**
 * restructure-dictionary.mjs — move the alphabet basics out of the dictionary.
 *
 * The dictionary becomes an EXPRESSION dictionary: letters and sound patterns
 * (C1T01 alphabet · C1T02 vowel patterns · C1T03 consonant clusters) belong in
 * the introductory lectures. Both sidebars share one topic code space (C1T01…),
 * so moving an id between them changes NOTHING else: media keys (R2 paths),
 * entity_ids (learned_items progress keys) and manifests stay byte-identical —
 * only the sidebar section that lists the id changes.
 *
 *   node scripts/restructure-dictionary.mjs --dry-run   # plan only
 *   node scripts/restructure-dictionary.mjs --apply     # move + write the pins
 *
 * Durability: every moved id is pinned in
 *   src/data/sidebars/library/dictionary/pins.json  (id → { section, topic })
 * and scripts/archive-topics.mjs honours the pins, so re-running the legacy
 * attribution pipeline (--apply-sidebar) can never silently undo the move.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SIDEBARS = join(ROOT, 'src', 'data', 'sidebars', 'library')
const PINS_FILE = join(SIDEBARS, 'dictionary', 'pins.json')
const DRY = process.argv.includes('--dry-run')
const APPLY = process.argv.includes('--apply')

/** The basics: dictionary topics that move to the lectures track (same codes). */
const MOVE = ['C1T01', 'C1T02', 'C1T03']

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

const dictionary = readJson(join(SIDEBARS, 'dictionary', 'sidebar.json'))
const lectures = readJson(join(SIDEBARS, 'lectures', 'sidebar.json'))

const dictionaryTopics = new Map(dictionary.sections.flatMap((c) => c.topics.map((t) => [t.code, t])))
const lecturesTopics = new Map(lectures.sections.flatMap((c) => c.topics.map((t) => [t.code, t])))

const moved = []
for (const code of MOVE) {
  const from = dictionaryTopics.get(code)
  const to = lecturesTopics.get(code)
  if (!from || !to) {
    console.error(`ERROR: topic '${code}' missing (dictionary: ${!!from}, lectures: ${!!to})`)
    process.exit(1)
  }
  const ids = from.items.filter((id) => !to.items.includes(id))
  if (ids.length === 0) continue
  moved.push({ code, ids })
}

if (moved.length === 0) {
  console.log('restructure: nothing to move — the basics are already in the lectures track')
  process.exit(0)
}

const total = moved.reduce((n, m) => n + m.ids.length, 0)
console.log(`restructure: ${total} id(s) → library/lectures (${moved.map((m) => `${m.code}: ${m.ids.length}`).join(' · ')})`)

/** The lectures keep their content docs first (the lecture opens the topic). */
const LECTURE_IDS = (to) => to.items.filter((id) => id.startsWith('lecture_'))

if (APPLY) {
  const pins = existsSync(PINS_FILE) ? readJson(PINS_FILE) : {}
  for (const { code, ids } of moved) {
    const from = dictionaryTopics.get(code)
    const to = lecturesTopics.get(code)
    from.items = from.items.filter((id) => !ids.includes(id))
    to.items = [...LECTURE_IDS(to), ...to.items.filter((id) => !ids.includes(id) && !id.startsWith('lecture_')), ...ids]
    for (const id of ids) pins[id] = { section: 'library/lectures', topic: code }
  }
  if (!DRY) {
    writeFileSync(join(SIDEBARS, 'dictionary', 'sidebar.json'), `${JSON.stringify(dictionary, null, 2)}\n`)
    writeFileSync(join(SIDEBARS, 'lectures', 'sidebar.json'), `${JSON.stringify(lectures, null, 2)}\n`)
    writeFileSync(PINS_FILE, `${JSON.stringify(pins, null, 2)}\n`)
    console.log(`restructure: sidebars rewritten · pins → ${PINS_FILE.replace(ROOT, '')} (${Object.keys(pins).length} pinned)`)
    console.log('next: run media index (rebuild the payloads), then run validate.')
  } else {
    console.log('restructure: DRY RUN — nothing written')
  }
} else if (!DRY) {
  console.log('restructure: pass --apply to move, or --dry-run to preview')
}
