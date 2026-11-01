#!/usr/bin/env node
/**
 * audit-sound.mjs — does the sound match the name? One chapter, every topic, every item, every language.
 *
 *   node scripts/audit-sound.mjs --chapter LT01            # table + problems, exit 1 on a problem
 *   node scripts/audit-sound.mjs --chapter LT01 --list     # also list every problem
 *   node scripts/audit-sound.mjs --chapter LT01 --baseline # stamp the text hash on UNVERIFIED clips
 *
 * A title or item clip says `ttsText` when the manifest has one, else `name` (same rule as
 * generate-audio.py). A read clip says the article page of its language. generate-audio.py records
 * the SHA-1 of that text as `text` in the clip's file facts, so each clip is one of:
 *
 *   ok          recorded text equals the text the site shows now
 *   copy        a letter clip reused from the letter's own language (`copyOf`): intentional
 *   stale       recorded text differs from the current text: the clip says something else
 *   unverified  no text recorded (made before the record existed)
 *   missing     the name or page exists but there is no clip
 *
 * `--baseline` writes the current text hash on unverified clips. Only do that after the sample check
 * (scripts/verify-clip-text.py) showed the unverified clips say what their names say.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOCALES } from './lib/locales.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const arg = (name) => {
  const at = process.argv.indexOf(name)
  return at === -1 ? null : (process.argv[at + 1] ?? null)
}
const chapter = arg('--chapter')
const track = arg('--track') ?? 'lectures'
const list = process.argv.includes('--list')
const baseline = process.argv.includes('--baseline')
if (!chapter) {
  console.error('usage: audit-sound.mjs --chapter <LT01> [--track lectures] [--list] [--baseline]')
  process.exit(2)
}

const sha1 = (text) => createHash('sha1').update(text).digest('hex')
const base = join(ROOT, 'media', track, chapter.slice(0, 4))
const dirs = (path) => readdirSync(path, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)

const sidebar = JSON.parse(readFileSync(join(ROOT, 'src/data/sidebars/library', track, 'sidebar.json'), 'utf8'))
const section = sidebar.sections.find((s) => s.code === chapter)
const topicOf = new Map()
for (const t of section.topics) for (const id of t.items ?? []) topicOf.set(id, t.code)

/** manifests: the chapter title, each topic title and each item. */
const manifests = [{ kind: 'title', topic: chapter, code: chapter, file: join(base, 'item.json') }]
for (const t of section.topics) manifests.push({ kind: 'title', topic: t.code, code: t.code, file: join(base, t.code, 'item.json') })
for (const folder of dirs(base)) {
  for (const code of dirs(join(base, folder))) {
    const file = join(base, folder, code, 'item.json')
    if (existsSync(file) && topicOf.has(code)) manifests.push({ kind: 'item', topic: topicOf.get(code), code, file })
  }
}

const rows = {} // topic -> counters
const problems = []
const bump = (topic, key) => {
  const r = (rows[topic] ??= { clips: 0, ok: 0, copy: 0, stale: 0, unverified: 0, missing: 0 })
  r[key] += 1
}

function judge(entry, kind, locale, expected, manifest) {
  const topic = entry.topic
  const facts = manifest.files?.[`${kind}/${locale}.mp3`]
  rows[topic] ??= { clips: 0, ok: 0, copy: 0, stale: 0, unverified: 0, missing: 0 }
  rows[topic].clips += 1
  if (!facts) {
    bump(topic, 'missing')
    problems.push(`missing    ${entry.code} ${kind}/${locale}`)
    return
  }
  if (facts.copyOf) return bump(topic, 'copy')
  if (!facts.text) {
    if (baseline) {
      facts.text = expected
      return bump(topic, 'ok')
    }
    bump(topic, 'unverified')
    problems.push(`unverified ${entry.code} ${kind}/${locale}`)
    return
  }
  if (facts.text !== expected) {
    bump(topic, 'stale')
    problems.push(`stale      ${entry.code} ${kind}/${locale}`)
    return
  }
  bump(topic, 'ok')
}

for (const entry of manifests) {
  if (!existsSync(entry.file)) {
    problems.push(`no manifest ${entry.code}`)
    continue
  }
  const manifest = JSON.parse(readFileSync(entry.file, 'utf8'))
  const before = JSON.stringify(manifest)
  for (const locale of LOCALES) {
    const row = manifest.locales?.[locale]
    if (row?.name) judge(entry, 'sound', locale, sha1(String(row.ttsText || row.name).trim()), manifest)
  }
  if (entry.kind === 'item') {
    const articleFile = join(ROOT, 'content', track, entry.topic, `${entry.code}.json`)
    if (existsSync(articleFile)) {
      const pages = JSON.parse(readFileSync(articleFile, 'utf8')).locales ?? {}
      for (const [locale, page] of Object.entries(pages)) {
        const body = page.sections?.length ? page.sections : page.paragraphs
        if (!body) continue
        judge(entry, 'read', locale, sha1(JSON.stringify(body)), manifest)
      }
    }
  }
  if (baseline && JSON.stringify(manifest) !== before) writeFileSync(entry.file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

console.log(`Sound audit ${chapter} (${track}): topic | clips | ok | copy | stale | unverified | missing`)
let bad = 0
for (const [topic, r] of Object.entries(rows).sort()) {
  console.log(`  ${topic.padEnd(8)} ${String(r.clips).padStart(5)} ${String(r.ok).padStart(5)} ${String(r.copy).padStart(5)} ${String(r.stale).padStart(5)} ${String(r.unverified).padStart(10)} ${String(r.missing).padStart(8)}`)
  bad += r.stale + r.unverified + r.missing
}
if (list) for (const p of problems) console.log(`  ${p}`)
console.log(bad ? `${bad} clip(s) need attention` : 'every clip says what the site shows')
process.exit(bad ? 1 : 0)
