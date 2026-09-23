#!/usr/bin/env node
/**
 * gallery-manifests.mjs — materialize the gallery repository (the standard).
 *
 * Moves the staged audio (media/audio/<lang>/<ID>.mp3, gitignored) into the
 * per-topic gallery layout and writes one sibling manifest per item:
 *
 *   gallery/audio/<lang>/<TOPIC>/<ID>.mp3          media file (never committed)
 *   gallery/audio/<lang>/<TOPIC>/<ID>.json         manifest (the Git index)
 *
 * Manifest shape (gallery/readme.md): { id, lang, term, names, ipa, kind,
 * file, key, mime, bytes, sha1, status, tags, [context, example] }.
 *  - key = audio/<lang>/<TOPIC>/<file>  → URL = config.root + key (R2 must be
 *    synced with the new keys before the next deploy — run media upload).
 *  - Items without audio yet → status 'pending' with key/file/bytes/sha1 null
 *    (the app renders those rows as a disabled "audio coming soon" button).
 *  - Ids are NEVER renamed: they are R2 filenames and learned_items.entity_id
 *    progress keys. Two dedup ids may share one file (letter_cat/letter_cat-2,
 *    word_coleg/word_coleg-2) — one manifest each, same key.
 *
 *   node scripts/gallery-manifests.mjs --dry-run   # plan only, write nothing
 *   node scripts/gallery-manifests.mjs             # move files + write manifests
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { attributeAll } from './archive-topics.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const STAGING = join(ROOT, 'media', 'audio')
const GALLERY_AUDIO = join(ROOT, 'gallery', 'audio')
const dryRun = process.argv.includes('--dry-run')

const sha1 = (file) => createHash('sha1').update(readFileSync(file)).digest('hex')

function main() {
  const attribution = attributeAll()
  if (attribution.size === 0) {
    console.error('ERROR: nothing attributed — run scripts/archive-topics.mjs first')
    process.exit(1)
  }

  let moved = 0
  let copiedBytes = 0
  let shared = 0
  let missing = 0
  let published = 0
  let pending = 0
  const missingList = []

  for (const [id, at] of attribution) {
    const { entity } = at
    const lang = entity.lang
    const topicDir = join(GALLERY_AUDIO, lang, at.topic)
    const names = { ...(entity.translations ?? {}), [lang]: entity.term }

    /** Base manifest — shared by the published and pending paths. */
    const manifest = {
      id,
      lang,
      kind: entity.type ?? null,
      term: entity.term,
      names,
      ipa: entity.ipa ?? null,
      file: null,
      key: null,
      mime: 'audio/mpeg',
      bytes: null,
      sha1: null,
      status: 'pending',
      tags: [`${at.page}#${at.section}`]
    }
    if (entity.context) manifest.context = entity.context
    if (entity.example) manifest.example = entity.example

    if (entity.audio) {
      // Staged file name = the audio URL's basename (shared keys collide here).
      const base = entity.audio.split('/').pop()
      const src = join(STAGING, lang, base)
      const dest = join(topicDir, base)
      if (!existsSync(src)) {
        missing++
        missingList.push(`${lang}/${base} (${id})`)
        continue
      }
      const existedBefore = existsSync(dest)
      if (!dryRun) {
        mkdirSync(topicDir, { recursive: true })
        copyFileSync(src, dest)
      }
      moved++
      copiedBytes += statSync(src).size
      if (existedBefore) shared++
      manifest.file = base
      manifest.key = `audio/${lang}/${at.topic}/${base}`
      manifest.bytes = statSync(src).size
      manifest.sha1 = sha1(src)
      manifest.status = 'published'
      published++
    } else {
      pending++
    }

    if (!dryRun) {
      mkdirSync(topicDir, { recursive: true })
      writeFileSync(join(topicDir, `${id}.json`), JSON.stringify(manifest, null, 2) + '\n')
    }
  }

  const unit = dryRun ? 'would move' : 'moved'
  console.log(`gallery-manifests${dryRun ? ' (DRY RUN)' : ''}: ${unit} ${moved} file(s) (${(copiedBytes / 1024 / 1024).toFixed(1)} MB) · manifests ${published} published + ${pending} pending · shared-key files ${shared} · missing staged ${missing}`)
  if (missingList.length) {
    console.error('missing staged files:')
    for (const m of missingList) console.error(`  - ${m}`)
  }
  if (missing) process.exitCode = 1
}

main()