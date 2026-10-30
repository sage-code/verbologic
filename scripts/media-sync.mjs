#!/usr/bin/env node
/**
 * media-sync.mjs — differential media pipeline (maintenance).
 *
 * The shared media root is the media repository itself:
 * media/<track>/<chapter>/<topic>/<code>/item.json and sound/<locale>.mp3.
 * The reorganize command migrates legacy language-prefixed R2 objects into
 * keys matching this shared tree:
 *
 *   media/dictionary/C1/C1T01/A034/sound/ro.mp3
 *     → dictionary/C1/C1T01/A034/sound/ro.mp3
 *
 * The differential baseline lives IN the item manifests: a published
 * manifest's sha1/bytes describe the exact bytes that SHOULD be on R2. When
 * Cloudflare credentials are present, the commands also diff against the
 * bucket itself (remote truth) — so drift (e.g. the initial upload never
 * having happened) is detected, not assumed away.
 *
 *   node scripts/media-sync.mjs stage              archive mp3s → legacy media/audio layout
 *   node scripts/media-sync.mjs manifest           reconcile item manifests with the files on disk
 *   node scripts/media-sync.mjs verify [--remote]  missing / orphan / dirty / pending report
 *   node scripts/media-sync.mjs upload [--apply]   differential R2 sync (default: report; --apply transfers)
 *   node scripts/media-sync.mjs reorganize [--apply] legacy audio keys → shared dictionary/lectures keys
 *   node scripts/media-sync.mjs prune [--apply]    R2 objects no legacy manifest references (default: report)
 *
 * R2 access uses R2's S3-compatible API, hand-signed with AWS SigV4 (no SDK,
 * no wrangler spawns; uploads run with bounded concurrency) — four env vars,
 * from an R2 API token's "S3 credentials" (dash.cloudflare.com → R2 → your
 * bucket → API → Manage API tokens — NOT a general Cloudflare API token,
 * which authenticates against a different API and 10000s here):
 *   CLOUDFLARE_ACCOUNT_ID    the account id
 *   R2_BUCKET                the media bucket name
 *   R2_S3_ENDPOINT           https://<account id>.r2.cloudflarestorage.com
 *   R2_S3_ACCESS_KEY_ID      the token's Access Key ID
 *   R2_S3_SECRET_ACCESS_KEY  the token's Secret Access Key
 *
 * .env is loaded automatically (Node's built-in loader) so these just need
 * to be set there — no manual `export` before running this script.
 */
import { createHash, createHmac } from 'node:crypto'
import {
  copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync
} from 'node:fs'
import { basename, isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOCALES } from './lib/locales.mjs'
import { FOLDER, descriptor, filePath, imagesOf, setFileFacts, setImageFacts } from './lib/manifest.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'))
const MEDIA = join(ROOT, 'media')
const SHARED_TRACKS = ['dictionary', 'lectures']
/**
 * The two recordings every item can carry, per language:
 *   audio → sound/<locale>.mp3  the short title/term recording
 *   read  → read/<locale>.mp3   the full article read
 */
const DESCRIPTOR_FIELDS = ['audio', 'read']
const DEFAULT_FOLDER = FOLDER
// The legacy flat staging (media/audio/<lang>/<ID>.mp3) — retired; `stage`
// reads from it while it still exists, otherwise straight from the archive.

const PUT_CONCURRENCY = 8

const MIME_BY_EXT = {
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png'
}
const MEDIA_EXT = new Set(Object.keys(MIME_BY_EXT))

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

/** R2 object key for a media file ("media/audio/ro/C1T11/x.mp3" → "audio/ro/C1T11/x.mp3"). */
function toKey(file) {
  return relative(MEDIA, file).replaceAll('\\', '/')
}

/** Every media file in the shared tree, indexed by its R2 key. */
function stagedIndex() {
  const out = new Map()
  for (const f of walk(MEDIA)) {
    if (!MEDIA_EXT.has(f.split('.').pop())) continue
    const key = toKey(f)
    out.set(key, { file: f, key })
  }
  return out
}

/** Every shared item manifest (media/<track>/<chapter>/<topic>/<code>/item.json). */
function* itemManifests() {
  for (const f of walk(MEDIA)) {
    if (!f.endsWith('item.json')) continue
    const manifest = JSON.parse(readFileSync(f, 'utf-8'))
    if (!manifest.code || !manifest.track) continue
    yield { path: f, manifest, dir: join(f, '..'), track: manifest.track, topic: manifest.topic }
  }
}

/**
 * One media file to sync: a shared manifest's `audio`/`read` descriptor for
 * one locale, or one of its shared illustrations.
 *
 * The shared manifest stores only published files (`files`, keyed by path), so
 * the entry set is the published set plus the pending locales the caller asks
 * for. `descriptor()` synthesizes the old file/key/mime/bytes/sha1/status
 * shape from `files` so the rest of this script is unchanged.
 *
 * Illustrations are NOT per locale — a story's pictures are shared by every
 * language it is translated into — so they are yielded once per item, keyed by
 * their own path in `images/`.
 */
function* mediaEntries() {
  for (const item of itemManifests()) {
    for (const field of DESCRIPTOR_FIELDS) {
      for (const locale of LOCALES) {
        const facts = item.manifest.files?.[filePath(field, locale)]
        // Pending locales are only interesting when a file has landed on disk
        // (that is what `manifest` promotes); skip them otherwise.
        if (!facts && !existsSync(join(item.dir, filePath(field, locale)))) continue
        yield { ...item, field, locale, descriptor: descriptor(item.manifest, field, locale) }
      }
    }
    for (const image of imagesOf(item.manifest)) {
      yield {
        ...item,
        field: 'image',
        locale: null,
        image,
        descriptor: {
          file: image.file,
          key: null,
          mime: MIME_BY_EXT[image.file.split('.').pop()] ?? 'image/jpeg',
          bytes: image.bytes,
          sha1: image.sha1,
          status: 'published'
        }
      }
    }
  }
}

/** The entry's media file on disk (null while the recording is still pending). */
function diskPath(entry) {
  const relative = entry.field === 'image' ? entry.image.file : filePath(entry.field, entry.locale)
  const p = join(entry.dir, relative)
  return existsSync(p) ? p : null
}

/** Write the file facts back into the manifest that owns this entry. */
function writeFacts(entry, facts) {
  if (entry.field === 'image') {
    // An illustration's facts live in the `images` list, not in `files`.
    const index = Number(entry.image.file.replace(/^images\//, '').replace(/\.jpg$/, ''))
    if (facts.status === 'published') {
      setImageFacts(entry.manifest, index, entry.image.page, facts)
    } else {
      entry.manifest.images = (entry.manifest.images ?? []).filter((i) => i.file !== entry.image.file)
    }
    writeFileSync(entry.path, JSON.stringify(entry.manifest, null, 2) + '\n')
    return
  }
  if (facts.status === 'published') {
    setFileFacts(entry.manifest, entry.field, entry.locale, facts)
  } else {
    // Back to pending — the file is gone, so it leaves `files` entirely.
    if (entry.manifest.files) delete entry.manifest.files[filePath(entry.field, entry.locale)]
  }
  writeFileSync(entry.path, JSON.stringify(entry.manifest, null, 2) + '\n')
}

/** Published keys — the set of keys that SHOULD exist on R2. */
function expectedKeys() {
  const out = new Set()
  for (const entry of mediaEntries()) {
    if (entry.descriptor.status !== 'published') continue
    // `key` is derived from the item directory now, not stored.
    const disk = diskPath(entry)
    const key = disk ? toKey(disk) : null
    if (key) out.add(key)
  }
  return out
}

/* ── Cloudflare R2 (S3-compatible API, hand-signed SigV4) ──────────────── */

/** Credentials from the environment; null (unless required) when incomplete. */
function r2Env(required = false) {
  const names = ['CLOUDFLARE_ACCOUNT_ID', 'R2_BUCKET', 'R2_S3_ENDPOINT', 'R2_S3_ACCESS_KEY_ID', 'R2_S3_SECRET_ACCESS_KEY']
  const missing = names.filter((k) => !process.env[k])
  if (missing.length) {
    if (required) {
      console.error(`R2 access requires env vars: ${missing.join(', ')}`)
      process.exit(1)
    }
    return null
  }
  return {
    bucket: process.env.R2_BUCKET,
    endpoint: process.env.R2_S3_ENDPOINT.replace(/\/+$/, ''),
    accessKeyId: process.env.R2_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_S3_SECRET_ACCESS_KEY
  }
}

const R2_REGION = 'auto' // R2's S3 API ignores region but SigV4 still needs one

const hash = (s) => createHash('sha256').update(s).digest('hex')
const hmac = (key, s) => createHmac('sha256', key).update(s).digest()

/** AWS SigV4 signature for one request — path-style (`<endpoint>/<bucket>/<key>`). */
function sign(env, method, path, query, body) {
  const host = new URL(env.endpoint).host
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '') // 20240101T000000Z
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = hash(body ?? '')

  const canonicalQuery = Object.entries(query ?? {})
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate }
  const signedHeaderNames = Object.keys(headers).sort()
  const canonicalHeaders = signedHeaderNames.map((k) => `${k}:${headers[k]}\n`).join('')
  const signedHeaders = signedHeaderNames.join(';')
  // Path segments are individually percent-encoded; slashes stay literal.
  const canonicalUri = path.split('/').map(encodeURIComponent).join('/')
  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n')

  const credentialScope = `${dateStamp}/${R2_REGION}/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, hash(canonicalRequest)].join('\n')

  const kDate = hmac(`AWS4${env.secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, R2_REGION)
  const kService = hmac(kRegion, 's3')
  const kSigning = hmac(kService, 'aws4_request')
  const signature = hmac(kSigning, stringToSign).toString('hex')

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${env.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  return { authorization, amzDate, payloadHash, url: `${env.endpoint}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ''}` }
}

/** Minimal XML text extraction — R2's ListObjectsV2 response has no attributes
 *  or nested repeats we need to worry about beyond <Contents> blocks. */
function xmlTag(block, tag) {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block)
  return m ? m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : null
}

/** All bucket objects (key → size) — paginated ListObjectsV2. */
async function r2List(env) {
  const keys = new Map()
  let continuationToken = null
  for (;;) {
    const query = { 'list-type': '2', 'max-keys': '1000' }
    if (continuationToken) query['continuation-token'] = continuationToken
    const { authorization, amzDate, payloadHash, url } = sign(env, 'GET', `/${env.bucket}`, query, '')
    const res = await fetch(url, {
      headers: { Authorization: authorization, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash }
    })
    const text = await res.text()
    if (!res.ok) throw new Error(xmlTag(text, 'Message') || `HTTP ${res.status}`)
    for (const block of text.match(/<Contents>[\s\S]*?<\/Contents>/g) ?? []) {
      const key = xmlTag(block, 'Key')
      if (key) keys.set(key, Number(xmlTag(block, 'Size') ?? 0))
    }
    continuationToken = xmlTag(text, 'IsTruncated') === 'true' ? xmlTag(text, 'NextContinuationToken') : null
    if (!continuationToken) break
  }
  return keys
}

/** PUT one object (raw octet-stream body; key slashes stay literal). */
async function r2Put(env, key, filePath, mime) {
  const body = readFileSync(filePath)
  const { authorization, amzDate, payloadHash, url } = sign(env, 'PUT', `/${env.bucket}/${key}`, {}, body)
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: authorization,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      'Content-Type': mime,
      'Content-Length': String(body.length)
    },
    body
  })
  if (!res.ok) throw new Error(xmlTag(await res.text(), 'Message') || `HTTP ${res.status}`)
}

/** Download one object so migration can verify bytes before deleting its old key. */
async function r2GetSha1(env, key) {
  const { authorization, amzDate, payloadHash, url } = sign(env, 'GET', `/${env.bucket}/${key}`, {}, '')
  const res = await fetch(url, {
    headers: { Authorization: authorization, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash }
  })
  if (!res.ok) throw new Error(xmlTag(await res.text(), 'Message') || `HTTP ${res.status}`)
  return createHash('sha1').update(Buffer.from(await res.arrayBuffer())).digest('hex')
}

/** DELETE one object. */
async function r2Delete(env, key) {
  const { authorization, amzDate, payloadHash, url } = sign(env, 'DELETE', `/${env.bucket}/${key}`, {}, '')
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: authorization, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash }
  })
  if (!res.ok && res.status !== 204) throw new Error(xmlTag(await res.text(), 'Message') || `HTTP ${res.status}`)
}

/** Run tasks with bounded concurrency (completion order is irrelevant). */
async function pool(tasks, size = PUT_CONCURRENCY) {
  const queue = [...tasks]
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      for (;;) {
        const next = queue.shift()
        if (!next) return
        await next()
      }
    })
  )
}

/**
 * Reconcile the item manifests with the files on disk — this WRITES the
 * differential baseline (each manifest's own sha1/bytes). Promotes pending
 * items whose <id>.mp3 has landed; refreshes the facts of published ones
 * (e.g. after a re-render). Never downgrades a published item whose file is
 * merely missing locally — that is `verify`'s job to report.
 */
function cmdManifest() {
  const dry = process.argv.includes('--dry-run')
  let reconciled = 0
  let promoted = 0
  let stale = 0
  let pending = 0
  for (const entry of mediaEntries()) {
    const { descriptor } = entry
    const disk = diskPath(entry)
    if (!disk) {
      if (descriptor.status === 'published') {
        stale++
        console.warn(`stale: ${descriptor.key} (${entry.manifest.code ?? entry.manifest.id}) — no file on disk`)
      } else pending++
      continue
    }
    const wasPending = descriptor.status !== 'published'
    const key = toKey(disk)
    const bytes = statSync(disk).size
    const hash = sha1(disk)
    // `key` and `mime` are derived from the path now, so only the two stored
    // facts can differ — comparing them is the whole check.
    const changed = wasPending || descriptor.bytes !== bytes || descriptor.sha1 !== hash
    if (!changed) continue
    if (!dry) {
      writeFacts(entry, {
        file: relative(entry.dir, disk).replaceAll('\\', '/'),
        key,
        mime: MIME_BY_EXT[disk.split('.').pop()] ?? 'application/octet-stream',
        bytes,
        sha1: hash,
        status: 'published'
      })
    }
    if (wasPending) promoted++
    else reconciled++
  }
  console.log(`manifest: reconciled ${reconciled} · promoted ${promoted} · stale ${stale} · pending ${pending}${dry ? ' (dry run — nothing written)' : ''}`)
}

/**
 * Report: missing staged files (published manifest, no file), orphans (staged
 * file no manifest references), dirty items (file edited after upload — the
 * next `upload --apply` re-sends them) and the pending (TTS) queue. With
 * --remote the manifest keys are also diffed against the bucket itself:
 * missing-on-R2 (published key the bucket lacks) and orphans-on-R2.
 */
async function cmdVerify() {
  const env = r2Env(process.argv.includes('--remote'))
  const remote = env ? await r2List(env) : null

  let published = 0
  let pending = 0
  let dirty = 0
  const missing = []
  const dirtyList = []
  const referenced = new Set()
  for (const entry of mediaEntries()) {
    const { descriptor } = entry
    const label = entry.manifest.code ?? entry.manifest.id
    const disk = diskPath(entry)
    // `key` is derived from the item directory now, not stored — compute it
    // from the disk path so the report names the real R2 object.
    const key = disk ? toKey(disk) : null
    if (descriptor.status !== 'published') {
      pending++
      if (disk) console.log(`ready: ${label} ${entry.field}.${entry.locale} — file on disk, 'media manifest' will promote it`)
      continue
    }
    published++
    if (key) referenced.add(key)
    if (!disk) { missing.push(`${key ?? `${label} ${entry.field}.${entry.locale}`} (${label})`); continue }
    if (descriptor.sha1 !== sha1(disk)) { dirty++; dirtyList.push(`${key} (${label})`) }
  }
  const staged = stagedIndex()
  const orphans = [...staged.values()].map((v) => v.key).filter((k) => !referenced.has(k))
  console.log(`verify: media entries ${published + pending} (published ${published}, pending ${pending}) · staged files ${staged.size}`)
  for (const m of missing) console.error(`  missing: ${m}`)
  for (const d of dirtyList) console.warn(`  dirty (edited, needs upload): ${d}`)
  if (orphans.length) {
    console.warn(`orphan staged files (no manifest reference): ${orphans.length}`)
    for (const o of orphans.slice(0, 10)) console.warn(`  - ${o}`)
  }
  if (remote) {
    const missingOnR2 = [...referenced].filter((k) => !remote.has(k))
    const orphansOnR2 = [...remote.keys()].filter((k) => !referenced.has(k))
    console.log(`verify: R2 '${env.bucket}' has ${remote.size} object(s) — missing on R2: ${missingOnR2.length} · orphans on R2: ${orphansOnR2.length}`)
    for (const k of missingOnR2.slice(0, 10)) console.error(`  not on R2: ${k}`)
    for (const k of orphansOnR2.slice(0, 10)) console.warn(`  R2-only: ${k}`)
    if (missingOnR2.length) process.exitCode = 1
  }
  if (missing.length) process.exitCode = 1
}

/**
 * Differential R2 sync. Delta = a manifest whose file on disk has a different
 * sha1 than the manifest records, a pending item whose <id>.mp3 has landed,
 * or (with credentials) a published key the bucket does not have. Default:
 * print the delta only. --apply: upload via the R2 REST API, then write the
 * new sha1/bytes/status back into the item manifest.
 */
async function cmdUpload() {
  const apply = process.argv.includes('--apply')
  const env = r2Env(apply)
  const remote = env ? await r2List(env) : null
  if (!env) {
    console.warn('note: set the R2 S3 credentials in .env to also diff against the bucket (remote truth) — see this file\'s header comment')
  }

  const delta = new Map() // key → { file, bytes, hash, mime, entries: [entry…] }
  for (const entry of mediaEntries()) {
    const { descriptor } = entry
    const label = entry.manifest.code ?? entry.manifest.id
    const disk = diskPath(entry)
    if (!disk) {
      if (descriptor.status === 'published') {
        const key = null
        if (remote && key && !remote.has(key)) {
          console.error(`broken (published, but no file locally and not on R2): ${key} (${label})`)
          process.exitCode = 1
        } else {
          console.warn(`skip (file missing on disk): ${key ?? `${label} ${entry.field}.${entry.locale}`}`)
        }
      }
      continue
    }
    const key = toKey(disk)
    const bytes = statSync(disk).size
    const hash = sha1(disk)
    // `remote` maps key -> size. Checking only that the key EXISTS is not
    // enough: a regenerated file keeps its key, so the manifest matches disk
    // while the bucket still holds the old bytes. Compare the size too.
    const remoteSize = remote ? remote.get(key) : undefined
    const onR2 = remote ? remoteSize !== undefined && remoteSize === bytes : true
    if (descriptor.status === 'published' && descriptor.sha1 === hash && descriptor.bytes === bytes && onR2) continue
    if (!delta.has(key)) {
      delta.set(key, {
        file: disk, bytes, hash,
        mime: MIME_BY_EXT[disk.split('.').pop()] ?? 'application/octet-stream',
        entries: []
      })
    }
    delta.get(key).entries.push(entry)
  }

  if (!delta.size) {
    console.log('Nothing to upload — every manifest matches its file on disk' + (remote ? ' and the bucket.' : '.'))
    return
  }
  console.log(`upload: ${delta.size} changed/new key(s)${apply ? '' : ' (dry run — re-run with --apply to transfer)'}`)
  for (const [key] of delta) console.log(`  upload ${key}`)
  if (!apply) return

  let ok = 0
  let failed = 0
  await pool([...delta.entries()].map(([key, d]) => async () => {
    try {
      await r2Put(env, key, d.file, d.mime)
      for (const entry of d.entries) {
        writeFacts(entry, {
          status: 'published',
          file: relative(entry.dir, d.file).replaceAll('\\', '/'),
          key,
          mime: d.mime,
          bytes: d.bytes,
          sha1: d.hash
        })
      }
      ok++
      console.log(`  ✓ ${key}`)
    } catch (e) {
      failed++
      console.error(`  ✗ ${key}: ${e.message}`)
    }
  }))
  console.log(`upload: ${ok} uploaded, ${failed} failed${failed ? ' — failed keys stay in the delta; fix and re-run' : ''}`)
  if (failed) process.exitCode = 1
}

/**
 * Copy existing per-language audio objects to the shared media tree's R2 keys.
 * Old objects are deleted only after each matching new object is downloaded
 * and verified against the local SHA-1. The default is a report-only plan.
 */
async function cmdReorganize() {
  const apply = process.argv.includes('--apply')
  const env = r2Env(apply)
  if (!env) {
    console.error('reorganize requires the R2 S3 credentials in .env')
    process.exitCode = 1
    return
  }

  const records = []
  const targetKeys = new Set()
  for (const track of SHARED_TRACKS) {
    const trackRoot = join(MEDIA, track)
    for (const manifestPath of walk(trackRoot).filter((file) => file.endsWith('item.json'))) {
      const item = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      if (item.track !== track || !item.code || !item.chapter || !item.topic) {
        throw new Error(`Invalid shared media item identity: ${manifestPath}`)
      }
      const itemDir = join(manifestPath, '..')
      for (const locale of LOCALES) {
        const descriptor = item.files?.[filePath('audio', locale)]
        if (!descriptor || typeof descriptor !== 'object') {
          throw new Error(`Missing audio file facts for '${locale}': ${manifestPath}`)
        }
        const relativeAudio = filePath('audio', locale)
        const file = join(itemDir, relativeAudio)
        const itemRelativeAudio = relative(itemDir, file)
        if (isAbsolute(itemRelativeAudio) || itemRelativeAudio === '..' || itemRelativeAudio.startsWith(`..${sep}`)) {
          throw new Error(`Audio path escapes item directory: ${manifestPath}: ${relativeAudio}`)
        }
        if (!existsSync(file)) continue
        if (!file.toLowerCase().endsWith('.mp3')) {
          throw new Error(`Expected MP3 audio file: ${file}`)
        }
        const key = toKey(file)
        if (targetKeys.has(key)) throw new Error(`Duplicate target R2 key: ${key}`)
        targetKeys.add(key)
        const localHash = sha1(file)
        if (descriptor.sha1 && descriptor.sha1 !== localHash) {
          throw new Error(`Local audio SHA-1 does not match ${manifestPath} audio.${locale}`)
        }
        if (descriptor.bytes != null && descriptor.bytes !== statSync(file).size) {
          throw new Error(`Local audio byte count does not match ${manifestPath} audio.${locale}`)
        }
        const title = item.kind === 'chapter-title' || item.kind === 'topic-title'
        const oldFolder = title ? item.chapter : item.topic
        const oldKey = `audio/${locale}/${oldFolder}/${item.code}.mp3`
        records.push({ track, locale, item, manifestPath, file, key, oldKey, hash: localHash })
      }
    }
  }

  const remote = await r2List(env)
  const oldAudioKeys = [...remote.keys()].filter((key) => key.startsWith('audio/'))
  const byOldKey = new Map(records.map((record) => [record.oldKey, record]))
  const mappedOldKeys = oldAudioKeys.filter((key) => byOldKey.has(key))
  const unmappedOldKeys = oldAudioKeys.filter((key) => !byOldKey.has(key))
  const copyRecords = records.filter((record) => remote.get(record.key) !== statSync(record.file).size)

  console.log(`reorganize${apply ? '' : ' (dry run)'}`)
  console.log(`  local shared audio files: ${records.length}`)
  console.log(`  legacy audio/ objects: ${oldAudioKeys.length}`)
  console.log(`  legacy objects mapped to local items: ${mappedOldKeys.length}`)
  console.log(`  new objects to upload: ${copyRecords.length}`)
  console.log(`  new objects already at expected size: ${records.length - copyRecords.length}`)
  console.log(`  legacy objects with no local mapping (will be preserved): ${unmappedOldKeys.length}`)
  for (const key of unmappedOldKeys.slice(0, 20)) console.warn(`  preserve unmapped: ${key}`)
  for (const record of records) {
    if (remote.has(record.key)) continue
    console.log(`  ${record.oldKey} -> ${record.key}`)
  }
  if (!apply) {
    console.log('dry run — re-run with --apply to upload, verify, and then remove mapped legacy objects')
    return
  }

  const changed = []
  let failed = 0
  await pool(records.map((record) => async () => {
    try {
      const remoteSize = remote.get(record.key)
      const remoteHash = remoteSize === statSync(record.file).size
        ? await r2GetSha1(env, record.key)
        : null
      if (remoteHash !== record.hash) {
        await r2Put(env, record.key, record.file, 'audio/mpeg')
      }
      const uploadedHash = await r2GetSha1(env, record.key)
      if (uploadedHash !== record.hash) {
        throw new Error(`R2 SHA-1 mismatch (expected ${record.hash}, received ${uploadedHash})`)
      }
      record.verified = true
      if (remoteSize !== statSync(record.file).size) changed.push(record.key)
    } catch (error) {
      failed++
      console.error(`  ✗ ${record.key}: ${error.message}`)
    }
  }))

  if (failed) {
    console.error(`reorganize: ${failed} target object(s) failed verification; no legacy objects deleted`)
    process.exitCode = 1
    return
  }

  const deletions = mappedOldKeys.filter((key) => {
    const record = byOldKey.get(key)
    return record?.verified && key !== record.key
  })
  let deleted = 0
  await pool(deletions.map((key) => async () => {
    try {
      await r2Delete(env, key)
      deleted++
      console.log(`  ✓ deleted legacy ${key}`)
    } catch (error) {
      failed++
      console.error(`  ✗ could not delete ${key}: ${error.message}`)
    }
  }))
  console.log(`reorganize: ${changed.length} uploaded and verified · ${deleted} legacy object(s) deleted · ${unmappedOldKeys.length} legacy object(s) preserved`)
  if (failed) process.exitCode = 1
}

/**
 * R2 objects no manifest references — deletion candidates. Remote truth via
 * the List Objects API; the retired legacy flat keys (if any) show up here
 * too, so no separate baseline file is needed.
 */
async function cmdPrune() {
  const apply = process.argv.includes('--apply')
  const env = r2Env(true)
  const remote = await r2List(env)
  const referenced = expectedKeys()
  const orphans = [...remote.keys()].filter((k) => !referenced.has(k))
  if (!orphans.length) {
    console.log(`prune: (nothing to prune — all ${remote.size} R2 object(s) are manifest-referenced)`)
    return
  }
  console.log(`prune: ${orphans.length} R2 object(s) no manifest references:`)
  for (const k of orphans) console.log(`  - ${k}`)
  if (!apply) {
    console.log('(dry run — re-run with --apply to delete from R2)')
    return
  }
  let ok = 0
  let failed = 0
  await pool(orphans.map((key) => async () => {
    try {
      await r2Delete(env, key)
      ok++
      console.log(`  ✓ deleted ${key}`)
    } catch (e) {
      failed++
      console.error(`  ✗ ${key}: ${e.message}`)
    }
  }))
  console.log(`prune: ${ok} deleted, ${failed} failed`)
  if (failed) process.exitCode = 1
}

const mode = process.argv[2] ?? 'verify'
const handlers = { manifest: cmdManifest, verify: cmdVerify, upload: cmdUpload, reorganize: cmdReorganize, prune: cmdPrune }
if (!handlers[mode]) {
  console.error(`unknown media command: ${mode} (stage | manifest | verify | upload | prune)`)
  process.exit(2)
}
Promise.resolve(handlers[mode]()).catch((e) => {
  console.error(e?.message ?? e)
  process.exit(1)
})
