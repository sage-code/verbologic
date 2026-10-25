#!/usr/bin/env node
/**
 * seed-import.mjs — load seed/*.json into the Supabase content tables.
 *
 *   node scripts/seed-import.mjs --dry-run   report only, write nothing
 *   node scripts/seed-import.mjs             upsert into the linked project
 *   node scripts/seed-import.mjs --no-prune  upsert only, keep stale rows
 *
 * Reads the seed files produced by scripts/seed-export.mjs and upserts them
 * into public.topics / public.units / public.articles
 * (planning/performance-and-content-refactor.md §14, phase 5).
 *
 * Credentials: SUPABASE_SECRET_KEY (the sb_secret_… key) or
 * SUPABASE_SERVICE_ROLE_KEY, from the environment or .env. The secret key
 * bypasses RLS, which is required — the content tables grant SELECT to anon and
 * nothing else.
 *
 * Idempotent: every write is an upsert on the table's natural key, so a re-run
 * updates in place. Articles are skipped when `source_sha` is unchanged, so a
 * re-import after a small edit only touches the rows that actually changed.
 * Rows the seed no longer contains are deleted (see `prune`).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SEED_DIR, SEED_LOCALES, SEED_SCHEMA, unitsFile } from './lib/seed.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SEED = join(ROOT, SEED_DIR)

if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'))

const dryRun = process.argv.includes('--dry-run')

const url = (process.env.NUXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '')
const key = (
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ''
).trim()

if (!url) {
  console.error('seed-import: NUXT_PUBLIC_SUPABASE_URL is not set.')
  process.exit(1)
}
if (!key && !dryRun) {
  console.error('seed-import: SUPABASE_SECRET_KEY is not set — the content tables grant')
  console.error('  SELECT to anon and nothing else, so the import needs the secret key.')
  process.exit(1)
}

const readJson = (name) => JSON.parse(readFileSync(join(SEED, name), 'utf-8'))

/** PostgREST upsert with the secret key. Returns the row count written. */
async function upsert(table, rows, onConflict, { batch = 500 } = {}) {
  if (!rows.length) return 0
  let written = 0
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch)
    const response = await fetch(`${url}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        // merge-duplicates = upsert; return=minimal keeps the response small.
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(chunk)
    })
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`${table} upsert failed (${response.status}): ${body.slice(0, 400)}`)
    }
    written += chunk.length
  }
  return written
}

/**
 * Delete rows the seed no longer contains.
 *
 * The upsert only ever adds or updates, so a topic removed from the sidebars
 * (the dictionary alphabet, CH01T09) or a legacy entity id that predates the
 * manifests (`greeting_*`, `question_*`) stays in the table forever. Those rows
 * are not inert: `search` filters on track + locale only, so a stale row still
 * matches a query and can outrank the real one — searching "proiect" returned
 * four legacy sentences and buried the actual dictionary entry.
 *
 * Reads the table's keys, diffs against the seed, and deletes the difference.
 * `--no-prune` skips it.
 */
async function prune(table, keep, keyColumns, { batch = 200 } = {}) {
  const existing = []
  const page = 1000
  for (let offset = 0; ; offset += page) {
    const response = await fetch(
      `${url}/rest/v1/${table}?select=${keyColumns.join(',')}&limit=${page}&offset=${offset}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    )
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`${table} read failed (${response.status}): ${body.slice(0, 300)}`)
    }
    const rows = await response.json()
    existing.push(...rows)
    if (rows.length < page) break
  }

  const stale = existing.filter((row) => !keep.has(keyColumns.map((c) => row[c]).join('\u0000')))
  if (!stale.length) return 0

  for (let i = 0; i < stale.length; i += batch) {
    const chunk = stale.slice(i, i + batch)
    // PostgREST has no bulk-delete-by-key, so this is one `or` filter per chunk.
    const filter = chunk
      .map((row) => `and(${keyColumns.map((c) => `${c}.eq.${encodeURIComponent(row[c] ?? '')}`).join(',')})`)
      .join(',')
    const response = await fetch(`${url}/rest/v1/${table}?or=(${filter})`, {
      method: 'DELETE',
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    })
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`${table} prune failed (${response.status}): ${body.slice(0, 300)}`)
    }
  }
  return stale.length
}

/** Read the existing article hashes so unchanged rows can be skipped. */async function existingArticleHashes() {
  const hashes = new Map()
  let offset = 0
  const page = 1000
  for (;;) {
    const response = await fetch(
      `${url}/rest/v1/articles?select=entity_id,locale,source_sha&limit=${page}&offset=${offset}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    )
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`articles read failed (${response.status}): ${body.slice(0, 300)}`)
    }
    const rows = await response.json()
    for (const row of rows) hashes.set(`${row.entity_id}\u0000${row.locale}`, row.source_sha)
    if (rows.length < page) break
    offset += page
  }
  return hashes
}

async function main() {
  // ── Load ────────────────────────────────────────────────────────────────
  const namesDoc = readJson('names.json')
  if (namesDoc.schema !== SEED_SCHEMA) {
    console.error(`seed-import: seed schema ${namesDoc.schema} != expected ${SEED_SCHEMA}. Re-run seed-export.`)
    process.exit(1)
  }
  const names = namesDoc.names ?? {}
  const topicsDoc = readJson('topics.json')
  const articlesDoc = readJson('articles.json')

  /** topic code -> { track, chapter, level } for denormalizing onto units. */
  const topicMeta = new Map()
  for (const t of topicsDoc.topics ?? []) {
    topicMeta.set(t.topic, { track: t.track, chapter: t.chapter, level: t.level ?? null })
  }

  // ── topics ──────────────────────────────────────────────────────────────
  const topicRows = (topicsDoc.topics ?? []).map((t) => ({
    track: t.track,
    chapter: t.chapter,
    topic: t.topic,
    title: t.title,
    order: t.order ?? 0,
    level: t.level ?? null,
    words: t.words ?? 0
  }))

  // ── units ───────────────────────────────────────────────────────────────
  // One row per (entity, locale). `topic` is the entity_id prefix before ':'.
  const unitRows = []
  for (const locale of SEED_LOCALES) {
    const doc = readJson(unitsFile(locale))
    for (const unit of doc.units ?? []) {
      const topic = unit.i.includes(':') ? unit.i.split(':')[0] : ''
      const meta = topicMeta.get(topic)
      unitRows.push({
        entity_id: unit.i,
        locale,
        topic,
        track: meta?.track ?? 'dictionary',
        kind: null,
        term: unit.term,
        ipa: unit.ipa ?? null,
        names: names[unit.i] ?? {},
        audio_url: unit.audio ?? null,
        read_url: unit.read ?? null,
        level: meta?.level ?? null,
        order: unit.order ?? 0
      })
    }
  }

  // ── articles ────────────────────────────────────────────────────────────
  const articleRows = (articlesDoc.articles ?? []).map((a) => ({
    entity_id: a.entity_id,
    locale: a.locale,
    title: a.title ?? '',
    summary: a.summary ?? null,
    body: a.body ?? '',
    status: a.status ?? 'draft',
    order: a.order ?? null,
    related: a.related ?? null,
    source_sha: a.source_sha ?? null
  }))

  console.log(`seed-import: ${topicRows.length} topics · ${unitRows.length} units · ${articleRows.length} articles`)

  if (dryRun) {
    console.log('seed-import: dry run — nothing written')
    return
  }

  // ── Write ───────────────────────────────────────────────────────────────
  const topicsWritten = await upsert('topics', topicRows, 'track,topic')
  console.log(`seed-import: topics   ${topicsWritten} upserted`)

  const unitsWritten = await upsert('units', unitRows, 'entity_id,locale')
  console.log(`seed-import: units    ${unitsWritten} upserted`)

  // Skip articles whose body hash is unchanged — a re-import after a one-file
  // edit should not rewrite 99 rows.
  const existing = await existingArticleHashes()
  const changed = articleRows.filter(
    (a) => existing.get(`${a.entity_id}\u0000${a.locale}`) !== a.source_sha
  )
  const articlesWritten = await upsert('articles', changed, 'entity_id,locale')
  console.log(
    `seed-import: articles ${articlesWritten} upserted (${articleRows.length - changed.length} unchanged, skipped)`
  )

  // ── Prune ───────────────────────────────────────────────────────────────
  // Upsert cannot remove a row, so anything dropped from the sidebars or the
  // manifests survives in the table and keeps matching searches.
  if (!process.argv.includes('--no-prune')) {
    const unitKeys = new Set(unitRows.map((u) => `${u.entity_id}\u0000${u.locale}`))
    const unitsPruned = await prune('units', unitKeys, ['entity_id', 'locale'])
    console.log(`seed-import: units    ${unitsPruned} stale row(s) deleted`)

    const topicKeys = new Set(topicRows.map((t) => `${t.track}\u0000${t.topic}`))
    const topicsPruned = await prune('topics', topicKeys, ['track', 'topic'])
    console.log(`seed-import: topics   ${topicsPruned} stale row(s) deleted`)

    const articleKeys = new Set(articleRows.map((a) => `${a.entity_id}\u0000${a.locale}`))
    const articlesPruned = await prune('articles', articleKeys, ['entity_id', 'locale'])
    console.log(`seed-import: articles ${articlesPruned} stale row(s) deleted`)
  }

  console.log('seed-import: done ✓')
}

await main()
