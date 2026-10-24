#!/usr/bin/env node
/**
 * seed-import.mjs — load seed/*.json into the Supabase content tables.
 *
 *   node scripts/seed-import.mjs --dry-run   report only, write nothing
 *   node scripts/seed-import.mjs             upsert into the linked project
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

/** Read the existing article hashes so unchanged rows can be skipped. */
async function existingArticleHashes() {
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
        order: 0
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

  console.log('seed-import: done ✓')
}

await main()
