#!/usr/bin/env node
/**
 * sync-alphabet-manifests.mjs — push the alphabet data into the letter
 * manifests, so the table and the article agree with the authored source.
 *
 * src/data/alphabets/<lang>.json is the authoring surface for the phonetic
 * topics (src/types/phonetic.ts). The manifests under
 * media/lectures/LT01/<TOPIC>/<CODE>/item.json are DERIVED from it, but they
 * were seeded once and then drifted: a letter's `ipa` in the table could
 * disagree with the article, and the example word never reached the manifest
 * at all.
 *
 * This script rewrites, for every phonetic topic:
 *   locales[<target>].name        the glyph (what the row shows)
 *   locales[<target>].ipa         the entry's IPA
 *   locales[<target>].example     the example word
 *   locales[<target>].context     the example word's IPA
 *   locales[<target>].ttsText     the letter name, when it differs from the glyph
 *
 * It never touches `files` — the recordings are managed by generate-audio.py.
 * Pass --audio to also delete the stale `sound/<lang>.mp3` of every entry whose
 * spoken text changed, so the next `generate-audio.py --audio --apply` records
 * the new pronunciation instead of reusing the old clip.
 *
 *   node scripts/sync-alphabet-manifests.mjs --dry-run
 *   node scripts/sync-alphabet-manifests.mjs --apply
 *   node scripts/sync-alphabet-manifests.mjs --apply --audio
 */
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ALPHABETS = join(ROOT, 'src', 'data', 'alphabets')
const SIDEBAR = join(ROOT, 'src', 'data', 'sidebars', 'library', 'lectures', 'sidebar.json')
const MEDIA = join(ROOT, 'media', 'lectures')

const apply = process.argv.includes('--apply')
const dropAudio = process.argv.includes('--audio')

const readJson = (path) => JSON.parse(readFileSync(path, 'utf-8'))
const writeJson = (path, data) =>
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')

/** topic code -> { target, entries: Map<code, entry> } */
const topics = new Map()
const sidebar = readJson(SIDEBAR)
for (const section of sidebar.sections ?? []) {
  for (const topic of section.topics ?? []) {
    if (topic.phonetic !== true || topic.mode !== 'directional' || !topic.target) continue
    const file = join(ALPHABETS, `${topic.target}.json`)
    if (!existsSync(file)) continue
    const data = readJson(file)
    const entries = new Map()
    for (const entry of [...(data.letters ?? []), ...(data.groups ?? [])]) {
      entries.set(entry.code, entry)
    }
    topics.set(topic.code, { target: topic.target, entries })
  }
}

let updated = 0
let audioDropped = 0
let missing = 0

for (const [topicCode, { target, entries }] of topics) {
  const topicDir = join(MEDIA, 'LT01', topicCode)
  if (!existsSync(topicDir)) continue
  for (const name of readdirSync(topicDir, { withFileTypes: true })) {
    if (!name.isDirectory()) continue
    const itemPath = join(topicDir, name.name, 'item.json')
    if (!existsSync(itemPath)) continue
    const manifest = readJson(itemPath)
    const entry = entries.get(manifest.code)
    if (!entry) {
      missing += 1
      continue
    }

    const row = (manifest.locales ??= {})[target] ??= {}
    const before = JSON.stringify(row)

    // The row shows the glyph; the spoken text is the letter's name when the
    // alphabet data gives one (German "A" is spoken "A", but a group like
    // "sch" is spoken as the group itself).
    if (entry.glyph) row.name = entry.glyph
    if (entry.ipa) row.ipa = entry.ipa
    if (entry.example) row.example = entry.example
    if (entry.exampleIpa) row.context = entry.exampleIpa
    if (entry.letterName && entry.letterName !== entry.glyph) row.ttsText = entry.letterName
    else delete row.ttsText

    if (JSON.stringify(row) === before) continue
    updated += 1

    if (dropAudio) {
      // The spoken text changed, so the existing clip says the wrong thing.
      const sound = join(topicDir, name.name, 'sound', `${target}.mp3`)
      if (existsSync(sound)) {
        if (apply) rmSync(sound)
        audioDropped += 1
      }
      if (apply) {
        for (const key of Object.keys(manifest.files ?? {})) {
          if (key === `sound/${target}.mp3`) delete manifest.files[key]
        }
      }
    }

    if (apply) writeJson(itemPath, manifest)
  }
}

const verb = apply ? 'updated' : 'would update'
console.log(
  `${verb} ${updated} letter manifest(s)` +
    (dropAudio ? `, ${apply ? 'dropped' : 'would drop'} ${audioDropped} stale recording(s)` : '') +
    (missing ? `; ${missing} manifest(s) have no alphabet entry` : '')
)
if (!apply) console.log('Run with --apply to write the changes.')
