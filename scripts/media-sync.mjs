#!/usr/bin/env node
/**
 * media-sync.mjs — differential media pipeline (maintenance).
 *
 * The staging root is the media repository itself: media files live in
 * media/audio/<lang>/<TOPIC>/ (gitignored binaries) next to their sibling
 * <ID>.json manifests (the Git index), so the local layout mirrors the R2
 * object keys exactly:
 *
 *   media/audio/ro/C1T11/greeting_salut.mp3  →  audio/ro/C1T11/greeting_salut.mp3
 *
 * The differential baseline lives IN the item manifests: a published
 * manifest's sha1/bytes describe the exact bytes that SHOULD be on R2. When
 * Cloudflare credentials are present, the commands also diff against the
 * bucket itself (remote truth) — so drift (e.g. the initial upload never
 * having happened) is detected, not assumed away.
 *
 *   node scripts/media-sync.mjs stage              archive mp3s → media per-topic layout
 *   node scripts/media-sync.mjs manifest           reconcile item manifests with the files on disk
 *   node scripts/media-sync.mjs verify [--remote]  missing / orphan / dirty / pending report
 *   node scripts/media-sync.mjs upload [--apply]   differential R2 sync (default: report; --apply transfers)
 *   node scripts/media-sync.mjs prune [--apply]    R2 objects no manifest references (default: report)
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
import { basename, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'))
const MEDIA = join(ROOT, 'media')
const AUDIO_DIR = join(MEDIA, 'audio')
// The legacy flat staging (media/audio/<lang>/<ID>.mp3) — retired; `stage`
// reads from it while it still exists, otherwise straight from the archive.
const LEGACY_MEDIA = join(ROOT, 'media', 'audio')

const PUT_CONCURRENCY = 8

const MIME_BY_EXT = {
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  webp: 'image/webp'
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

/** All staged media files with their keys, indexed by "<lang>/<base>". */
function stagedIndex() {
  const out = new Map()
  for (const f of walk(AUDIO_DIR)) {
    if (!MEDIA_EXT.has(f.split('.').pop())) continue
    const relPath = relative(AUDIO_DIR, f).replaceAll('\\', '/') // "<lang>/<TOPIC>/<base>"
    const [lang, , base] = relPath.split('/')
    out.set(`${lang}/${base}`, { file: f, key: toKey(f) })
  }
  return out
}

/** Every item manifest under media/audio, with its owning lang/topic. */
function* itemManifests() {
  for (const f of walk(AUDIO_DIR)) {
    if (!f.endsWith('.json')) continue
    const manifest = JSON.parse(readFileSync(f, 'utf-8'))
    if (!manifest.id) continue
    const relDir = relative(AUDIO_DIR, join(f, '..')).replaceAll('\\', '/') // "<lang>/<TOPIC>"
    const [lang, topic] = relDir.split('/')
    yield { path: f, manifest, dir: join(f, '..'), lang, topic }
  }
}

/** The item's media file on disk: the manifest's file, or <id>.mp3 for pending items. */
function diskPath(item) {
  const base = item.manifest.file ?? `${item.manifest.id}.mp3`
  const p = join(item.dir, base)
  return existsSync(p) ? p : null
}

/** Published manifest keys — the set of keys that SHOULD exist on R2. */
function expectedKeys() {
  const out = new Set()
  for (const { manifest } of itemManifests()) {
    if (manifest.status === 'published' && manifest.key) out.add(manifest.key)
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

/** Stage one archive-derived item's mp3 into the media per-topic layout. */
function cmdStage() {
  import('./archive-topics.mjs').then(async ({ attributeAll }) => {
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
  })
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
  for (const item of itemManifests()) {
    const { manifest } = item
    const disk = diskPath(item)
    if (!disk) {
      if (manifest.status === 'published') {
        stale++
        console.warn(`stale: ${manifest.key} (${manifest.id}) — no file on disk`)
      } else pending++
      continue
    }
    const wasPending = manifest.status !== 'published'
    const key = toKey(disk)
    const bytes = statSync(disk).size
    const hash = sha1(disk)
    const mime = MIME_BY_EXT[disk.split('.').pop()] ?? 'application/octet-stream'
    const changed =
      wasPending || manifest.key !== key || manifest.bytes !== bytes ||
      manifest.sha1 !== hash || manifest.mime !== mime
    if (!changed) continue
    if (!dry) {
      manifest.file = basename(disk)
      manifest.key = key
      manifest.mime = mime
      manifest.bytes = bytes
      manifest.sha1 = hash
      manifest.status = 'published'
      writeFileSync(item.path, JSON.stringify(manifest, null, 2) + '\n')
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
  for (const item of itemManifests()) {
    const { manifest } = item
    const disk = diskPath(item)
    if (manifest.status !== 'published') {
      pending++
      if (disk) console.log(`ready: ${manifest.id} — file on disk, 'media manifest' will promote it`)
      continue
    }
    published++
    referenced.add(manifest.key)
    if (!disk) { missing.push(`${manifest.key} (${manifest.id})`); continue }
    if (manifest.sha1 !== sha1(disk)) { dirty++; dirtyList.push(`${manifest.key} (${manifest.id})`) }
  }
  const staged = stagedIndex()
  const orphans = [...staged.values()].map((v) => v.key).filter((k) => !referenced.has(k))
  console.log(`verify: manifests ${published + pending} (published ${published}, pending ${pending}) · staged files ${staged.size}`)
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

  const delta = new Map() // key → { file, bytes, hash, mime, items: [item…] }
  for (const item of itemManifests()) {
    const { manifest } = item
    const disk = diskPath(item)
    if (!disk) {
      if (manifest.status === 'published') {
        if (remote && !remote.has(manifest.key)) {
          console.error(`broken (published, but no file locally and not on R2): ${manifest.key} (${manifest.id})`)
          process.exitCode = 1
        } else {
          console.warn(`skip (file missing on disk): ${manifest.key}`)
        }
      }
      continue
    }
    const key = toKey(disk)
    const bytes = statSync(disk).size
    const hash = sha1(disk)
    const onR2 = remote ? remote.has(key) : true
    if (manifest.status === 'published' && manifest.sha1 === hash && manifest.bytes === bytes && onR2) continue
    if (!delta.has(key)) {
      delta.set(key, {
        file: disk, bytes, hash,
        mime: MIME_BY_EXT[disk.split('.').pop()] ?? 'application/octet-stream',
        items: []
      })
    }
    delta.get(key).items.push(item)
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
      for (const item of d.items) {
        const { manifest } = item
        manifest.status = 'published'
        manifest.file = basename(d.file)
        manifest.key = key
        manifest.mime = d.mime
        manifest.bytes = d.bytes
        manifest.sha1 = d.hash
        writeFileSync(item.path, JSON.stringify(manifest, null, 2) + '\n')
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
const handlers = { stage: cmdStage, manifest: cmdManifest, verify: cmdVerify, upload: cmdUpload, prune: cmdPrune }
if (!handlers[mode]) {
  console.error(`unknown media command: ${mode} (stage | manifest | verify | upload | prune)`)
  process.exit(2)
}
Promise.resolve(handlers[mode]()).catch((e) => {
  console.error(e?.message ?? e)
  process.exit(1)
})
