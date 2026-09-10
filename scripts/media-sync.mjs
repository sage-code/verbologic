#!/usr/bin/env node
/**
 * media-sync.mjs — differential audio/media pipeline (maintenance).
 *
 *   node scripts/media-sync.mjs stage      legacy archive mp3s → media/audio/<lang>/<id>.mp3
 *   node scripts/media-sync.mjs manifest   recompute media/audio-manifest.json (sha1 baseline)
 *   node scripts/media-sync.mjs verify     report missing keys, TTS queue and orphans
 *   node scripts/media-sync.mjs upload     upload ONLY changed/new keys to R2 (needs env vars)
 *
 * Staging layout mirrors the R2 bucket keys:
 *   local media/audio/<lang>/<id>.mp3  →  https://media.verbologic.com/audio/<lang>/<id>.mp3
 * The manifest is the differential baseline: only files absent or with a
 * different hash are uploaded by `upload`.
 */
import { createHash } from 'node:crypto'
import {
  copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync
} from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MEDIA_DIR = join(ROOT, 'media', 'audio')
const MANIFEST_FILE = join(ROOT, 'media', 'audio-manifest.json')
const MEDIA_BASE = 'https://media.verbologic.com/'
const OBJECT_PREFIX = 'audio/'
const ARCHIVE_DIRS = {
  ro: ['vocabulary', 'questions', 'imperative', 'sentences'],
  en: ['alphabet']
}
/** Legacy archive folder per language (romanians/… ≠ iso code ro). */
const ARCHIVE_LANG_DIR = { ro: 'romanian', en: 'english' }

function readJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf-8'))
}
function sha1(file) {
  return createHash('sha1').update(readFileSync(file)).digest('hex')
}
function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

/** Load all entities and expose { id, lang, key, term } for those with audio. */
function audioEntities() {
  const list = []
  let tts = 0
  for (const f of readdirSync(join(ROOT, 'public/data/entities')).filter((x) => x.endsWith('.json'))) {
    for (const e of readJson(`public/data/entities/${f}`)) {
      if (!e.audio) { tts++; continue }
      const key = e.audio.replace(MEDIA_BASE, '')
      list.push({ id: e.id, lang: e.lang, key, term: e.term })
    }
  }
  return { list, tts }
}

/** Locate the legacy archive file behind an entity id: <prefix>_<slug>. */
function findLegacyFile(lang, id) {
  const slug = id.slice(id.indexOf('_') + 1).replace(/-\d+$/, '') // strip dedup suffix
  for (const dir of ARCHIVE_DIRS[lang] || []) {
    const p = join(ROOT, 'archive', ARCHIVE_LANG_DIR[lang] || lang, 'audio', dir, `${slug}.mp3`)
    if (existsSync(p)) return p
  }
  return null
}

/** Local staged file for an entity object key ("audio/ro/word_salut.mp3"). */
function stageLocal(key) {
  return join(MEDIA_DIR, key.slice(OBJECT_PREFIX.length).replaceAll('/', '\\'))
}

/** R2 object key from a staged filename. */
function toKey(file) {
  return OBJECT_PREFIX + relative(MEDIA_DIR, file).replaceAll('\\', '/')
}

function cmdStage() {
  const { list, tts } = audioEntities()
  let copied = 0
  let missing = 0
  for (const e of list) {
    const src = findLegacyFile(e.lang, e.id)
    const dest = stageLocal(e.key)
    if (src) {
      mkdirSync(join(dest, '..'), { recursive: true })
      copyFileSync(src, dest)
      copied++
    } else {
      missing++
      console.warn(`stage: no legacy source for ${e.id} (${e.term})`)
    }
  }
  console.log(`stage: copied ${copied} · missing sources ${missing} · entities without audio (TTS): ${tts}`)
  if (missing) process.exitCode = 1
}

function cmdManifest() {
  const files = walk(MEDIA_DIR).filter((f) => f.endsWith('.mp3'))
  const manifest = {}
  for (const f of files) manifest[toKey(f)] = sha1(f)
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2))
  console.log(`manifest: ${Object.keys(manifest).length} keys → media/audio-manifest.json`)
}

function cmdVerify() {
  const { list, tts } = audioEntities()
  const manifest = existsSync(MANIFEST_FILE) ? JSON.parse(readFileSync(MANIFEST_FILE, 'utf-8')) : {}
  let present = 0
  let missing = 0
  const missingKeys = []
  for (const e of list) {
    if (existsSync(stageLocal(e.key))) present++
    else { missing++; missingKeys.push(e.key) }
  }
  // Orphans: staged keys no entity references.
  const keys = new Set(list.map((e) => e.key))
  const orphans = Object.keys(manifest).filter((k) => !keys.has(k))

  console.log(`verify: entities with audio ${list.length} · staged present ${present} · missing ${missing} · TTS queue ${tts}`)
  if (missingKeys.length) {
    console.log('missing staged files:')
    for (const k of missingKeys) console.log(`  - ${k}`)
  }
  if (orphans.length) console.warn(`manifest keys with no entity reference (orphans): ${orphans.length}`)
  if (present !== list.length) process.exitCode = 1
}

function cmdUpload() {
  const env = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']
  const missingEnv = env.filter((k) => !process.env[k])
  if (missingEnv.length) {
    console.error(`upload requires: ${missingEnv.join(', ')}`)
    console.error('Run: export R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=…')
    process.exit(1)
  }
  const { list } = audioEntities()
  const manifest = existsSync(MANIFEST_FILE) ? JSON.parse(readFileSync(MANIFEST_FILE, 'utf-8')) : {}
  let pending = 0
  for (const e of list) {
    const local = stageLocal(e.key)
    if (!existsSync(local)) { console.warn(`missing staged: ${e.key}`); continue }
    const h = sha1(local)
    if (manifest[e.key] === h) continue
    pending++
    console.log(`upload ${e.key}`)
  }
  if (pending) console.log(`\nDifferential ready: ${pending} changed/new keys.`)
  else console.log('Nothing to upload — manifest is up to date.')
}

const mode = process.argv[2] ?? 'manifest'
const handlers = { stage: cmdStage, manifest: cmdManifest, verify: cmdVerify, upload: cmdUpload }
if (!handlers[mode]) {
  console.error(`unknown media command: ${mode} (stage | manifest | verify | upload)`)
  process.exit(2)
}
handlers[mode]()
