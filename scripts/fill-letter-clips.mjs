#!/usr/bin/env node
/**
 * fill-letter-clips.mjs — give every letter item a title clip in every reader language.
 *
 * A letter such as Ț, Ű or Я is not in the alphabet of most reader languages, so the voice of those
 * languages returns no audio for it (generate-audio.py fails with NoAudioReceived). The sound of a
 * letter is the same whoever listens, so the missing clip is a copy of the clip in the letter's own
 * language (`sound/<target>.mp3`), spoken by a voice that can say it.
 *
 *   node scripts/fill-letter-clips.mjs [--topic LT01T01] [--apply]
 *
 * Only clips that are missing are filled, never an existing one, and only for items whose target
 * clip exists. The manifest's file facts are updated; upload with `./run.sh media upload`.
 */
import { copyFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MEDIA = join(ROOT, 'media/lectures')
const LOCALES = ['en', 'ro', 'de', 'ru', 'it', 'es', 'fr', 'hu', 'pt']
const apply = process.argv.includes('--apply')
const topicAt = process.argv.indexOf('--topic')
const TOPIC = topicAt === -1 ? 'LT01T01' : process.argv[topicAt + 1]

let filled = 0
let marked = 0
const noSource = []
const byTarget = {}
const dirs = (path) => readdirSync(path, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
for (const chapter of dirs(MEDIA)) {
  for (const folder of dirs(join(MEDIA, chapter))) {
    for (const code of dirs(join(MEDIA, chapter, folder))) {
      const dir = join(MEDIA, chapter, folder, code)
      const file = join(dir, 'item.json')
      if (!existsSync(file)) continue
      const item = JSON.parse(readFileSync(file, 'utf8'))
      if (item.topic !== TOPIC || !item.target) continue
      const source = join(dir, 'sound', `${item.target}.mp3`)
      let changed = false
      for (const locale of LOCALES) {
        if (!item.locales?.[locale]?.name) continue
        const clip = join(dir, 'sound', `${locale}.mp3`)
        if (existsSync(clip)) continue
        if (!existsSync(source)) { noSource.push(`${item.code}/${locale}`); continue }
        filled += 1
        byTarget[item.target] = (byTarget[item.target] ?? 0) + 1
        if (!apply) continue
        copyFileSync(source, clip)
        item.files ??= {}
        item.files[`sound/${locale}.mp3`] = {
          bytes: statSync(clip).size,
          sha1: createHash('sha1').update(readFileSync(clip)).digest('hex'),
          copyOf: `sound/${item.target}.mp3`
        }
        changed = true
      }
      // Clips copied earlier carry no marker: a clip identical to the target's own clip is a copy.
      const own = item.files?.[`sound/${item.target}.mp3`]
      for (const locale of LOCALES) {
        const facts = item.files?.[`sound/${locale}.mp3`]
        if (locale !== item.target && facts && own && facts.sha1 === own.sha1 && !facts.copyOf) {
          marked += 1
          if (!apply) continue
          facts.copyOf = `sound/${item.target}.mp3`
          delete facts.text
          changed = true
        }
      }
      if (changed) writeFileSync(file, `${JSON.stringify(item, null, 2)}\n`, 'utf8')
    }
  }
}
console.log(`${apply ? 'filled' : 'would fill'} ${filled} clip(s) in ${TOPIC}`, byTarget, `· ${apply ? 'marked' : 'would mark'} ${marked} copy clip(s) with copyOf`)
if (noSource.length) console.log(`no clip in the letter's own language for ${noSource.length}: ${noSource.slice(0, 8).join(' ')}`)
