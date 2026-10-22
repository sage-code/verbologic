#!/usr/bin/env node
/**
 * media-manifests.mjs — materialize the media repository (the standard).
 *
 * Moves the staged audio (media/audio/<lang>/<ID>.mp3, gitignored) into the
 * per-topic media layout and writes one sibling manifest per item:
 *
 *   media/audio/<lang>/<TOPIC>/<ID>.mp3          media file (never committed)
 *   media/audio/<lang>/<TOPIC>/<ID>.json         manifest (the Git index)
 *
 * Manifest shape (media/readme.md): { id, lang, term, names, ipa, kind,
 * file, key, mime, bytes, sha1, status, tags, [context, example] }.
 *  - key = audio/<lang>/<TOPIC>/<file>  → URL = config.root + key (R2 must be
 *    synced with the new keys before the next deploy — run media upload).
 *  - Items without audio yet → status 'pending' with key/file/bytes/sha1 null
 *    (the app renders those rows as a disabled "audio coming soon" button).
 *  - Manifest ids are topic-scoped content codes; `entity_id` is the
 *    language-independent `<TOPIC>:<CODE>` identity. The previous progress
 *    key is retained as `legacy_entity_id` during migration.
 *
 *   node scripts/media-manifests.mjs --dry-run   # plan only, write nothing
 *   node scripts/media-manifests.mjs             # move files + write manifests
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { attributeAll } from './archive-topics.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const STAGING = join(ROOT, 'media', 'audio')
const MEDIA_AUDIO = join(ROOT, 'media', 'audio')
const dryRun = process.argv.includes('--dry-run')

const sha1 = (file) => createHash('sha1').update(readFileSync(file)).digest('hex')

function main() {
  const attribution = attributeAll()
  if (attribution.size === 0) {
    console.error('ERROR: nothing attributed — run scripts/archive-topics.mjs first')
    process.exit(1)
  }

  const contentIdsByEntity = new Map()
  for (const lang of existsSync(MEDIA_AUDIO) ? readdirSync(MEDIA_AUDIO) : []) {
    const langDir = join(MEDIA_AUDIO, lang)
    for (const topic of readdirSync(langDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      const topicDir = join(langDir, topic.name)
      for (const name of readdirSync(topicDir).filter((file) => file.endsWith('.json'))) {
        const existing = JSON.parse(readFileSync(join(topicDir, name), 'utf8'))
        const legacyId = existing.legacy_entity_id ?? existing.entity_id
        if (legacyId && existing.id) {
          contentIdsByEntity.set(`${topic.name}\n${legacyId}`, existing.id)
        }
      }
    }
  }

  const unmapped = [...attribution].filter(([entityId, item]) =>
    !contentIdsByEntity.has(`${item.topic}\n${entityId}`)
  )
  if (unmapped.length) {
    console.error(`ERROR: ${unmapped.length} legacy item(s) have no assigned content code. Run media-scaffold-topic for the topic first.`)
    for (const [id, item] of unmapped.slice(0, 10)) console.error(`  - ${item.topic}: ${id}`)
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
    const contentId = contentIdsByEntity.get(`${at.topic}\n${id}`)
    const topicDir = join(MEDIA_AUDIO, lang, at.topic)
    const names = { ...(entity.translations ?? {}), [lang]: entity.term }

    /** Base manifest — shared by the published and pending paths. */
    const manifest = {
      id: contentId,
      entity_id: `${at.topic}:${contentId}`,
      legacy_entity_id: id,
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
        missingList.push(`${lang}/${base} (${contentId})`)
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
      writeFileSync(join(topicDir, `${contentId}.json`), JSON.stringify(manifest, null, 2) + '\n')
    }
  }

  const unit = dryRun ? 'would move' : 'moved'
  console.log(`media-manifests${dryRun ? ' (DRY RUN)' : ''}: ${unit} ${moved} file(s) (${(copiedBytes / 1024 / 1024).toFixed(1)} MB) · manifests ${published} published + ${pending} pending · shared-key files ${shared} · missing staged ${missing}`)
  if (missingList.length) {
    console.error('missing staged files:')
    for (const m of missingList) console.error(`  - ${m}`)
  }
  if (missing) process.exitCode = 1
}

main()