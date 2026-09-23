#!/usr/bin/env node
/**
 * media-sync.mjs — differential audio/media pipeline (maintenance).
 *
 * The staging root is the gallery repository itself: media files live in
 * gallery/audio/<lang>/<TOPIC>/ (gitignored binaries) next to their sibling
 * <ID>.json manifests (the Git index), so the local layout mirrors the R2
 * object keys exactly:
 *
 *   gallery/audio/ro/C1T11/greeting_salut.mp3  →  audio/ro/C1T11/greeting_salut.mp3
 *
 *   node scripts/media-sync.mjs stage      archive mp3s → gallery per-topic layout (via archive-topics)
 *   node scripts/media-sync.mjs manifest   recompute gallery/audio-manifest.json (sha1 baseline)
 *   node scripts/media-sync.mjs verify     report missing keys, pending (TTS) queue and orphans
 *   node scripts/media-sync.mjs upload     differential report of changed/new keys (needs env vars)
 *   node scripts/media-sync.mjs prune      list the retired flat keys (audio/<lang>/<ID>.mp3) to delete from R2
 *
 * The manifest is the differential baseline: only files absent or with a
 * different hash are (re)uploaded by the R2 sync.
 */
import { createHash } from 'node:crypto'
import {
  copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync
} from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const GALLERY = join(ROOT, 'gallery')
const AUDIO_DIR = join(GALLERY, 'audio')
const MANIFEST_FILE = join(GALLERY, 'audio-manifest.json')
// The legacy flat staging (media/audio/<lang>/<ID>.mp3) — retired; `stage`
// reads from it while it still exists, otherwise straight from the archive.
const LEGACY_MEDIA = join(ROOT, 'media', 'audio')

function sha1(file) {
  return createHash('sha1').update(readFileSync(file)).digest('hex')
}

function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

/** R2 object key for a gallery file ("gallery/audio/ro/C1T11/x.mp3" → "audio/ro/C1T11/x.mp3"). */
function toKey(file) {
  return relative(GALLERY, file).replaceAll('\\', '/')
}

/** All staged mp3s with their keys, indexed by "<lang>/<base>". */
function stagedIndex() {
  const out = new Map()
  for (const f of walk(AUDIO_DIR)) {
    if (!f.endsWith('.mp3')) continue
    const relPath = relative(AUDIO_DIR, f).replaceAll('\\', '/') // "<lang>/<TOPIC>/<base>"
    const [lang, , base] = relPath.split('/')
    out.set(`${lang}/${base}`, { file: f, key: toKey(f) })
  }
  return out
}

/** Every gallery manifest. */
function manifestIndex() {
  const out = []
  for (const f of walk(AUDIO_DIR)) {
    if (!f.endsWith('.json') || f === MANIFEST_FILE) continue
    out.push({ path: f, manifest: JSON.parse(readFileSync(f, 'utf-8')) })
  }
  return out
}

/** Stage one archive-derived item's mp3 into the gallery per-topic layout. */
async function cmdStage() {
  const { attributeAll } = await import('./archive-topics.mjs')
  const attribution = attributeAll()
  let copied = 0
  let missing = 0
  for (const [, at] of attribution) {
    const { entity } = at
    if (!entity.audio) continue // pending — no media yet
    const base = entity.audio.split('/').pop()
    const dest = join(AUDIO_DIR, entity.lang, at.topic, base)
    if (existsSync(dest)) continue // idempotent
    // Prefer the legacy flat staging (identical bytes), else the archive original.
    const staged = join(LEGACY_MEDIA, entity.lang, base)
    let src = null
    if (existsSync(staged)) src = staged
    else {
      const slug = entity.id.slice(entity.id.indexOf('_') + 1).replace(/-\d+$/, '')
      for (const dir of ['vocabulary', 'questions', 'imperative', 'sentences']) {
        const p = join(ROOT, 'archive', { ro: 'romanian', en: 'english' }[entity.lang] ?? entity.lang, 'audio', dir, `${slug}.mp3`)
        if (existsSync(p)) { src = p; break }
      }
    }
    if (!src) { missing++; continue }
    mkdirSync(join(dest, '..'), { recursive: true })
    copyFileSync(src, dest)
    copied++
  }
  console.log(`stage: copied ${copied} new file(s) · missing sources ${missing}`)
  if (missing) process.exitCode = 1
}

function cmdManifest() {
  const files = walk(AUDIO_DIR).filter((f) => f.endsWith('.mp3'))
  const manifest = {}
  for (const f of files) manifest[toKey(f)] = sha1(f)
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`manifest: ${Object.keys(manifest).length} keys → ${relative(ROOT, MANIFEST_FILE)}`)
}

function cmdVerify() {
  const staged = stagedIndex()
  const manifests = manifestIndex()
  let published = 0
  let pending = 0
  const missingList = []
  for (const { manifest } of manifests) {
    if (manifest.status === 'pending') { pending++; continue }
    if (staged.has(`${manifest.lang}/${manifest.file}`)) published++
    else missingList.push(`${manifest.lang}/${manifest.file} (${manifest.id})`)
  }
  // Orphans: staged mp3s no published manifest references.
  const referenced = new Set(
    manifests.filter((m) => m.manifest.status !== 'pending').map((m) => `${m.manifest.lang}/${m.manifest.file}`)
  )
  const orphans = [...staged.keys()].filter((k) => !referenced.has(k))

  console.log(`verify: manifests ${manifests.length} (published ${published}, pending ${pending}) · staged files ${staged.size}`)
  if (missingList.length) {
    console.log('missing staged files:')
    for (const m of missingList) console.log(`  - ${m}`)
  }
  if (orphans.length) console.warn(`orphan staged files (no manifest reference): ${orphans.length}`)
  if (missingList.length) process.exitCode = 1
}

function cmdUpload() {
  const names = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']
  const missing = names.filter((k) => !process.env[k])
  if (missing.length) {
    console.error(`upload requires: ${missing.join(', ')}`)
    console.error('Run: export R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=…')
    process.exit(1)
  }
  const manifest = existsSync(MANIFEST_FILE) ? JSON.parse(readFileSync(MANIFEST_FILE, 'utf-8')) : {}
  let pendingKeys = 0
  for (const f of walk(AUDIO_DIR)) {
    if (!f.endsWith('.mp3')) continue
    const key = toKey(f)
    if (manifest[key] === sha1(f)) continue
    pendingKeys++
    console.log(`upload ${key}`)
  }
  if (pendingKeys) console.log(`\nDifferential ready: ${pendingKeys} changed/new keys.`)
  else console.log('Nothing to upload — manifest is up to date.')
}

/** List the retired flat keys (audio/<lang>/<ID>.mp3) still on R2 — deletion candidates.
 *  Sources: the legacy baseline (media/audio-manifest.json) plus any baseline key
 *  no longer present in the per-topic tree. */
function cmdPrune() {
  const current = new Set(walk(AUDIO_DIR).filter((f) => f.endsWith('.mp3')).map(toKey))
  const retired = new Set()
  const legacyBaseline = join(ROOT, 'media', 'audio-manifest.json')
  if (existsSync(legacyBaseline)) {
    for (const k of Object.keys(JSON.parse(readFileSync(legacyBaseline, 'utf-8')))) {
      if (!current.has(k)) retired.add(k)
    }
  }
  if (existsSync(MANIFEST_FILE)) {
    for (const k of Object.keys(JSON.parse(readFileSync(MANIFEST_FILE, 'utf-8')))) {
      if (!current.has(k)) retired.add(k)
    }
  }
  console.log(`prune: ${retired.size} retired key(s) safe to delete from R2:`)
  for (const k of retired) console.log(`  - ${k}`)
  if (!retired.size) console.log('(nothing to prune)')
}

const mode = process.argv[2] ?? 'manifest'
const handlers = { stage: cmdStage, manifest: cmdManifest, verify: cmdVerify, upload: cmdUpload, prune: cmdPrune }
if (!handlers[mode]) {
  console.error(`unknown media command: ${mode} (stage | manifest | verify | upload | prune)`)
  process.exit(2)
}
handlers[mode]()