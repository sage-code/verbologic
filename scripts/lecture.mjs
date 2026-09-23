#!/usr/bin/env node
/**
 * lecture.mjs — the lecture content workflow (content/lectures/**).
 *
 * A lecture = a pending/published video manifest (media/video/<lang>/<TOPIC>/<ID>.json,
 * kind 'lecture') + one Markdown doc per explanation locale:
 *
 *   content/lectures/<trackLang>/<TOPIC>/<ID>/en.md    ← the canonical original
 *   content/lectures/<trackLang>/<TOPIC>/<ID>/<locale>.md  ← translations
 *
 * The English doc is the original the author edits; every translation carries
 * `sourceSha` (sha1 of the canonical doc it was made from) + `status`, so the
 * moment the original changes the translation is flagged stale — nothing ever
 * silently drifts. Front matter is joined into the runtime payloads by
 * scripts/media-index.mjs; the prose renders on the lecture's prerendered
 * route (Nuxt Content — queried at build time, never in the browser).
 *
 *   node scripts/lecture.mjs new <trackLang> <TOPIC> <id> [--title "…"] [--minutes 6]
 *   node scripts/lecture.mjs status                     # the review queue
 *   node scripts/lecture.mjs translate <id> --lang ro   # scaffold a translation (draft)
 *   node scripts/lecture.mjs review <id> --lang ro      # mark a doc reviewed
 *
 * The script scaffolds/validates/tracks; filling the prose is human (or agent)
 * work — it never generates or overwrites body text.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import grayMatter from 'gray-matter'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CONTENT = join(ROOT, 'content', 'lectures')
const SIDEBAR_FILE = join(ROOT, 'src', 'data', 'sidebars', 'library', 'lectures', 'sidebar.json')
const MEDIA_VIDEO = join(ROOT, 'media', 'video')
const LOCALES = ['en', 'ro', 'de', 'ru', 'it', 'es', 'fr', 'hu', 'pt']
const CANONICAL = 'en' // lectures: English is the original; stories: the track language

const sha1 = (file) => createHash('sha1').update(readFileSync(file)).digest('hex')
const fail = (msg) => {
  console.error(`ERROR: ${msg}`)
  process.exit(1)
}
const write = (file, data) => {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, data)
}

const arg = (name) => {
  const at = process.argv.indexOf(name)
  return at > -1 ? process.argv[at + 1] : undefined
}
const flag = (name) => process.argv.includes(name)

/** Every lecture doc, grouped: id → { dir, trackLang, topic, docs: Map<locale, {data, file, sha}> }. */
function loadGroups() {
  const groups = new Map()
  if (!existsSync(CONTENT)) return groups

  const files = []
  const walk = (dir, parts) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const next = [...parts, entry.name]
      if (entry.isDirectory()) walk(join(dir, entry.name), next)
      else if (entry.name.endsWith('.md')) files.push(next)
    }
  }
  walk(CONTENT, [])
  for (const parts of files) {
    if (parts.length !== 4) fail(`'${parts.join('/')}' must live at <trackLang>/<TOPIC>/<id>/<locale>.md`)
    const [trackLang, topic, id] = [parts[0], parts[1], parts[2]]
    const locale = parts[3].replace(/\.md$/, '')
    const file = join(CONTENT, ...parts)
    const { data } = grayMatter(readFileSync(file, 'utf8'))
    const group = groups.get(id) ?? { dir: join(CONTENT, trackLang, topic, id), trackLang, topic, docs: new Map() }
    group.docs.set(locale, { data, file, sha: sha1(file) })
    groups.set(id, group)
  }
  return groups
}

/** new <trackLang> <TOPIC> <id> — scaffold the canonical doc + pending video manifest + sidebar item. */
function cmdNew() {
  const [trackLang, topic, id] = process.argv.slice(3).filter((a) => !a.startsWith('--'))
  const title = arg('--title') ?? id.replace(/^lecture_/, '').replaceAll('-', ' ')
  const minutes = arg('--minutes') ?? 5
  if (!trackLang || !topic || !id) fail('usage: lecture.mjs new <trackLang> <TOPIC> <id> [--title "…"] [--minutes 6]')

  const docFile = join(CONTENT, trackLang, topic, id, `${CANONICAL}.md`)
  if (existsSync(docFile)) fail(`'${docFile}' already exists`)

  write(
    docFile,
    `---
track: lectures
trackLang: ${trackLang}
locale: ${CANONICAL}
topic: ${topic}
article: ${id}
title: ${title}
status: draft
order: 1
minutes: ${minutes}
video: ${id}
related: []
---

<!-- The canonical original — edit freely. Translations track this file by hash. -->

## TODO

Write the lecture here: short, pragmatic, logic-first. One idea per section.
`
  )

  // The video manifest — pending until the mp4 lands (same standard as audio).
  const manifestFile = join(MEDIA_VIDEO, trackLang, topic, `${id}.json`)
  if (!existsSync(manifestFile)) {
    write(
      manifestFile,
      `${JSON.stringify(
        {
          id,
          lang: trackLang,
          kind: 'lecture',
          term: title,
          names: { [trackLang]: title, en: title },
          ipa: null,
          file: null,
          key: null,
          mime: 'video/mp4',
          bytes: null,
          sha1: null,
          status: 'pending',
          tags: [`lecture#${topic}`],
          content: `lectures/${trackLang}/${topic}/${id}`
        },
        null,
        2
      )}\n`
    )
  }

  // Insert the id into the lectures sidebar topic (deduped) — the structure layer.
  const sidebar = JSON.parse(readFileSync(SIDEBAR_FILE, 'utf8'))
  const topicEntry = sidebar.sections.flatMap((s) => s.topics).find((t) => t.code === topic)
  if (!topicEntry) fail(`unknown topic '${topic}' in ${SIDEBAR_FILE}`)
  if (!topicEntry.items.includes(id)) topicEntry.items.push(id)
  write(SIDEBAR_FILE, `${JSON.stringify(sidebar, null, 2)}\n`)

  console.log(`lecture: scaffolded ${trackLang}/${topic}/${id}`)
  console.log(`  doc:      content/lectures/${trackLang}/${topic}/${id}/${CANONICAL}.md (edit this)`)
  console.log(`  manifest: media/video/${trackLang}/${topic}/${id}.json (pending)`)
  console.log(`  next: write the prose, then \`run lecture translate ${id} --lang ro\`.`)
}

/** status — the review queue: per lecture, per doc — status / stale / reviewed. */
function cmdStatus() {
  const groups = loadGroups()
  if (groups.size === 0) console.log('lecture status: no content docs yet')
  let staleCount = 0
  let draftCount = 0
  for (const [id, group] of groups) {
    const canonical = group.docs.get(CANONICAL) ?? group.docs.get(group.trackLang)
    if (!canonical) {
      console.log(`  BROKEN  ${id}: no canonical '${CANONICAL}' document`)
      continue
    }
    console.log(`  ${id}  (${group.trackLang}/${group.topic})`)
    for (const [locale, doc] of group.docs) {
      const isCanonical = locale === CANONICAL
      const stale = !isCanonical && doc.data.sourceSha !== undefined && doc.data.sourceSha !== canonical.sha
      if (stale) staleCount++
      if (doc.data.status === 'draft') draftCount++
      console.log(
        `    ${locale.padEnd(3)} ${doc.data.status ?? 'draft'}${stale ? '  STALE (canonical changed)' : ''}${
          doc.data.reviewedAt ? `  reviewed ${String(doc.data.reviewedAt).slice(0, 10)}` : ''
        }`
      )
    }
  }
  console.log(`\nlecture status: ${groups.size} lecture(s) · ${draftCount} draft doc(s) · ${staleCount} stale translation(s)`)
  if (staleCount) process.exitCode = 1
}

/** translate <id> --lang <locale> — scaffold a translation doc (draft + sourceSha). */
function cmdTranslate() {
  const id = process.argv[3]
  const locale = arg('--lang')
  if (!id || !locale) fail('usage: lecture.mjs translate <id> --lang <locale>')
  if (!LOCALES.includes(locale)) fail(`unknown locale '${locale}'`)

  const group = loadGroups().get(id)
  if (!group) fail(`no content docs for '${id}'`)
  const canonical = group.docs.get(CANONICAL) ?? group.docs.get(group.trackLang)
  if (!canonical) fail(`'${id}' has no canonical document`)
  const target = join(group.dir, `${locale}.md`)

  if (existsSync(target) && !flag('--force')) {
    fail(`'${target}' exists — use --force to refresh ONLY the front matter (body is kept)`)
  }

  if (existsSync(target)) {
    // --force refreshes ONLY the front matter (sourceSha/status) — body text survives.
    const existing = grayMatter(readFileSync(target, 'utf8'))
    const front = { ...existing.data, status: 'draft', sourceSha: canonical.sha }
    delete front.reviewedAt
    write(target, grayMatter.stringify(existing.content, front))
    console.log(`translate: refreshed front matter of ${locale} for '${id}' (sourceSha updated)`)
  } else {
    const front = { ...canonical.data, locale, status: 'draft', sourceSha: canonical.sha }
    delete front.reviewedAt
    write(target, grayMatter.stringify(canonical.content, front))
    console.log(`translate: scaffolded ${locale} for '${id}' — fill in the prose, then review`)
  }
  console.log('  the translation is in sync as of now; editing the canonical flags it stale.')
}

/** review <id> --lang <locale> — flip a doc to reviewed (refuses stale docs without --force). */
function cmdReview() {
  const id = process.argv[3]
  const locale = arg('--lang')
  if (!id || !locale) fail('usage: lecture.mjs review <id> --lang <locale>')
  const group = loadGroups().get(id)
  if (!group) fail(`no content docs for '${id}'`)
  const doc = group.docs.get(locale)
  if (!doc) fail(`'${id}' has no '${locale}' document`)
  const canonical = group.docs.get(CANONICAL) ?? group.docs.get(group.trackLang)
  const stale = locale !== CANONICAL && doc.data.sourceSha !== canonical.sha
  if (stale && !flag('--force')) fail(`'${id}'/${locale} is STALE — re-translate (translate --force) or use --force to review anyway`)

  const front = { ...doc.data, status: flag('--unreview') ? 'draft' : 'reviewed' }
  if (flag('--unreview')) delete front.reviewedAt
  else front.reviewedAt = new Date().toISOString()
  write(doc.file, grayMatter.stringify(doc.content, front))
  console.log(`review: '${id}'/${locale} → ${front.status}`)
}

const cmd = process.argv[2]
if (cmd === 'new') cmdNew()
else if (cmd === 'status') cmdStatus()
else if (cmd === 'translate') cmdTranslate()
else if (cmd === 'review') cmdReview()
else fail('usage: lecture.mjs <new|status|translate|review> …')

