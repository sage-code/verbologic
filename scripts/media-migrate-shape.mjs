#!/usr/bin/env node
/**
 * media-migrate-shape.mjs — one-shot migration of item.json to the
 * `locales` + `files` shape (planning/performance-and-content-refactor.md §21).
 *
 * Before: six parallel locale maps (names, description, pronunciation,
 * metadata, audio, read), each repeating the locale set, with four derivable
 * fields per audio descriptor (file, key, mime, status).
 *
 * After:
 *   locales: { <locale>: { name, description, ipa, ttsText, example, context } }
 *   files:   { "<folder>/<locale>.mp3": { bytes, sha1 } }
 *
 * `locales` is keyed by locale — one self-contained row each, the import unit
 * for the units table. `files` is keyed by path — only the two facts that
 * cannot be derived; a file's presence IS its published status.
 *
 *   node scripts/media-migrate-shape.mjs --dry-run   # report only
 *   node scripts/media-migrate-shape.mjs             # rewrite in place
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOCALES } from './lib/locales.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MEDIA = join(ROOT, 'media')
const dryRun = process.argv.includes('--dry-run')

/** Top-level keys carried through untouched. */
const PASSTHROUGH = [
  'code', 'track', 'chapter', 'topic', 'kind', 'entity_id',
  'legacy_entity_id', 'cefr', 'letter', 'schema', 'tags'
]

/** Manifest field → the folder its files live in. */
const FOLDER = { audio: 'sound', read: 'read' }

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(p))
    else if (entry.name === 'item.json') out.push(p)
  }
  return out
}

/** The locale set a manifest actually uses — the union of its six maps. */
function localesOf(item) {
  const seen = new Set()
  for (const field of ['names', 'description', 'pronunciation', 'metadata', 'audio', 'read']) {
    for (const locale of Object.keys(item[field] ?? {})) seen.add(locale)
  }
  // Keep navigation.json order so the output is deterministic.
  return LOCALES.filter((locale) => seen.has(locale))
}

function convert(item) {
  const out = {}
  for (const key of PASSTHROUGH) {
    if (item[key] !== undefined) out[key] = item[key]
  }

  const locales = {}
  for (const locale of localesOf(item)) {
    const row = {}
    const name = item.names?.[locale]
    const description = item.description?.[locale]
    const pronunciation = item.pronunciation?.[locale]
    const metadata = item.metadata?.[locale]
    // ttsText lives in two places today (a top-level map and inside
    // pronunciation); they never collide, so either source is authoritative.
    const ttsText = pronunciation?.ttsText ?? item.ttsText?.[locale]
    if (name) row.name = name
    if (description) row.description = description
    if (pronunciation?.ipa) row.ipa = pronunciation.ipa
    if (ttsText) row.ttsText = ttsText
    if (metadata?.example) row.example = metadata.example
    if (metadata?.context) row.context = metadata.context
    if (Object.keys(row).length) locales[locale] = row
  }
  if (Object.keys(locales).length) out.locales = locales

  const files = {}
  for (const [field, folder] of Object.entries(FOLDER)) {
    for (const [locale, descriptor] of Object.entries(item[field] ?? {})) {
      if (!descriptor || typeof descriptor !== 'object') continue
      // A descriptor without a sha1 is pending — it has no file, so it is
      // omitted entirely (presence in `files` means published).
      if (!descriptor.sha1) continue
      const path = descriptor.file ?? `${folder}/${locale}.mp3`
      files[path] = { bytes: descriptor.bytes, sha1: descriptor.sha1 }
    }
  }
  if (Object.keys(files).length) out.files = files

  return out
}

function main() {
  const paths = walk(MEDIA)
  let before = 0
  let after = 0
  let changed = 0
  const problems = []

  for (const path of paths) {
    const raw = readFileSync(path, 'utf8')
    const item = JSON.parse(raw)
    const next = convert(item)
    const text = JSON.stringify(next, null, 2) + '\n'
    before += Buffer.byteLength(raw)
    after += Buffer.byteLength(text)

    // Guard: every locale that had a name must still have one.
    for (const locale of Object.keys(item.names ?? {})) {
      if (item.names[locale] && !next.locales?.[locale]?.name) {
        problems.push(`${relative(ROOT, path)}: lost names.${locale}`)
      }
    }
    // Guard: every published descriptor must still have a file entry.
    for (const [field, folder] of Object.entries(FOLDER)) {
      for (const [locale, descriptor] of Object.entries(item[field] ?? {})) {
        if (!descriptor?.sha1) continue
        const key = descriptor.file ?? `${folder}/${locale}.mp3`
        if (!next.files?.[key]) problems.push(`${relative(ROOT, path)}: lost ${field}.${locale}`)
      }
    }

    if (text !== raw) changed++
    if (!dryRun) writeFileSync(path, text)
  }

  const kb = (n) => (n / 1024).toFixed(0)
  console.log(
    `media-migrate-shape${dryRun ? ' (DRY RUN)' : ''}: ${paths.length} manifest(s) · ` +
    `${changed} rewritten · ${kb(before)} KB → ${kb(after)} KB ` +
    `(${((after / before - 1) * 100).toFixed(0)}%)`
  )
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):`)
    for (const p of problems.slice(0, 20)) console.error(`  - ${p}`)
    process.exitCode = 1
  }
}

main()
