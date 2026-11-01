#!/usr/bin/env node
/**
 * sync-title-names.mjs — make a chapter's title manifests say what the sidebar says.
 *
 * The site shows the NAMES in the sidebar (src/data/sidebars/library/<track>/sidebar.json), while the
 * title clip speaks the name in the title manifest (media/<track>/<chapter>/item.json for the chapter,
 * .../<TOPIC>/item.json for a topic). When a topic is renamed the two drift and the sound no longer
 * matches the name. This script copies the sidebar names into the manifests and, for every language
 * whose name changed, removes the stale `ttsText`, the stale `ipa` and the old clip, so
 * `generate-audio.py --audio --apply` records the new one.
 *
 *   node scripts/sync-title-names.mjs --chapter LT01            # report only
 *   node scripts/sync-title-names.mjs --chapter LT01 --apply
 *   node scripts/sync-title-names.mjs --chapter LT01 --check    # exit 1 on any difference (used by validate)
 *
 * `--track` defaults to lectures. Dictionary titles live under media/dictionary and are handled the
 * same way (`--track dictionary`).
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOCALES } from './lib/locales.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const arg = (name) => {
  const at = process.argv.indexOf(name)
  return at === -1 ? null : (process.argv[at + 1] ?? null)
}
const chapter = arg('--chapter')
const track = arg('--track') ?? 'lectures'
const apply = process.argv.includes('--apply')
const check = process.argv.includes('--check')
if (!chapter) {
  console.error('usage: sync-title-names.mjs --chapter <LT01> [--track lectures] [--apply|--check]')
  process.exit(2)
}

const sidebar = JSON.parse(readFileSync(join(ROOT, 'src/data/sidebars/library', track, 'sidebar.json'), 'utf8'))
const section = sidebar.sections.find((s) => s.code === chapter)
if (!section) {
  console.error(`chapter ${chapter} not in the ${track} sidebar`)
  process.exit(2)
}
const base = join(ROOT, 'media', track, chapter.slice(0, 4))
const titles = [
  { code: chapter, names: section.names, dir: base },
  ...section.topics.map((t) => ({ code: t.code, names: t.names, dir: join(base, t.code) }))
]

let differences = 0
for (const { code, names, dir } of titles) {
  const file = join(dir, 'item.json')
  if (!existsSync(file)) {
    console.log(`${code}: no title manifest`)
    differences += 1
    continue
  }
  const manifest = JSON.parse(readFileSync(file, 'utf8'))
  let changed = false
  for (const locale of LOCALES) {
    const shown = names?.[locale]
    if (!shown) continue
    const row = (manifest.locales ??= {})[locale] ??= {}
    if (row.name === shown) continue
    differences += 1
    console.log(`${code} ${locale}: "${row.name ?? ''}" -> "${shown}"`)
    if (!apply) continue
    row.name = shown
    delete row.ttsText
    delete row.ipa
    rmSync(join(dir, 'sound', `${locale}.mp3`), { force: true })
    if (manifest.files) delete manifest.files[`sound/${locale}.mp3`]
    changed = true
  }
  if (changed) writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}
console.log(differences ? `${differences} difference(s)${apply ? ' fixed' : ''}` : 'every title manifest matches the sidebar')
if (check && differences) process.exit(1)
