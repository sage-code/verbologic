#!/usr/bin/env node
/**
 * Shared lecture content workflow.
 *
 *   content/lectures/<TOPIC>/<ID>/en.md
 *   content/lectures/<TOPIC>/<ID>/<locale>.md
 *
 * Audio manifests live separately at media/audio/<locale>/<TOPIC>/<file>.json.
 * All language variants share the same topic-scoped id and names map; only the
 * physical audio file path and target-language term/IPA differ.
 *
 *   node scripts/lecture.mjs new <TOPIC> <ID> [--title "Using {{term}}"]
 *   node scripts/lecture.mjs status
 *   node scripts/lecture.mjs translate <TOPIC> <ID> --lang ro
 *   node scripts/lecture.mjs review <TOPIC> <ID> --lang ro
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import grayMatter from 'gray-matter'
import { LOCALES } from './lib/locales.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CONTENT = join(ROOT, 'content', 'lectures')
const AUDIO = join(ROOT, 'media', 'audio')
const SIDEBAR_FILE = join(ROOT, 'src', 'data', 'sidebars', 'library', 'lectures', 'sidebar.json')
const CANONICAL = 'en'

const sha1 = (file) => createHash('sha1').update(readFileSync(file)).digest('hex')
const fail = (message) => {
  console.error(`ERROR: ${message}`)
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
const articleKey = (topic, id) => `${topic}\n${id}`

function loadGroups() {
  const groups = new Map()
  if (!existsSync(CONTENT)) return groups
  const walk = (dir, parts = []) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const next = [...parts, entry.name]
      if (entry.isDirectory()) walk(join(dir, entry.name), next)
      else if (entry.name.endsWith('.md')) {
        if (next.length !== 3) fail(`'${next.join('/')}' must live at <TOPIC>/<ID>/<locale>.md`)
        const [topic, id, filename] = next
        const locale = filename.replace(/\.md$/, '')
        const file = join(CONTENT, ...next)
        const { data, content } = grayMatter(readFileSync(file, 'utf8'))
        if (data.track !== 'lectures' || data.topic !== topic || data.article !== id || data.locale !== locale) {
          fail(`'${next.join('/')}' front matter does not match its path`)
        }
        if (data.trackLang !== undefined) fail(`'${next.join('/')}' must not include trackLang`)
        const key = articleKey(topic, id)
        const group = groups.get(key) ?? {
          topic,
          id,
          dir: join(CONTENT, topic, id),
          docs: new Map()
        }
        group.docs.set(locale, { data, content, file, sha: sha1(file) })
        groups.set(key, group)
      }
    }
  }
  walk(CONTENT)
  return groups
}

function findTopic(sidebar, topicCode) {
  return sidebar.sections.flatMap((section) => section.topics).find((topic) => topic.code === topicCode)
}

function loadTerms(topic, id) {
  const manifests = []
  for (const lang of LOCALES) {
    const dir = join(AUDIO, lang, topic)
    if (!existsSync(dir)) continue
    for (const filename of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
      const manifest = JSON.parse(readFileSync(join(dir, filename), 'utf8'))
      if (manifest.id === id) {
        if (manifest.lang !== lang) fail(`'${topic}/${filename}' has lang '${manifest.lang}', expected '${lang}'`)
        manifests.push(manifest)
      }
    }
  }
  const source = manifests.find((manifest) =>
    LOCALES.every((locale) => typeof manifest.names?.[locale] === 'string' && manifest.names[locale].trim())
  )
  if (!source) {
    fail(`'${topic}/${id}' needs one seed manifest with a complete names map for all locales before authoring`)
  }
  if (source.term !== source.names[source.lang]) {
    fail(`'${topic}/${id}' seed term does not match names.${source.lang}`)
  }
  for (const manifest of manifests) {
    if (manifest.term !== source.names[manifest.lang]) {
      fail(`'${topic}/${id}' ${manifest.lang} term does not match the seed names map`)
    }
    if (LOCALES.some((locale) => manifest.names?.[locale] !== source.names[locale])) {
      fail(`'${topic}/${id}' ${manifest.lang} names map differs from the seed manifest`)
    }
  }
  return Object.fromEntries(LOCALES.map((locale) => [locale, source.names[locale]]))
}

function cmdNew() {
  const [topic, id] = process.argv.slice(3).filter((value) => !value.startsWith('--'))
  if (!topic || !id) fail('usage: lecture.mjs new <TOPIC> <ID> [--title "Using {{term}}"]')
  if (!/^[A-Z]\d{3}$/.test(id)) fail(`'${id}' must be a coded content ID such as A023`)
  const docFile = join(CONTENT, topic, id, `${CANONICAL}.md`)
  if (existsSync(docFile)) fail(`'${docFile}' already exists`)

  const terms = loadTerms(topic, id)
  const sidebar = JSON.parse(readFileSync(SIDEBAR_FILE, 'utf8'))
  const topicEntry = findTopic(sidebar, topic)
  if (!topicEntry) fail(`unknown topic '${topic}' in ${SIDEBAR_FILE}`)
  if (!topicEntry.items.includes(id)) {
    topicEntry.items.push(id)
    write(SIDEBAR_FILE, `${JSON.stringify(sidebar, null, 2)}\n`)
  }

  const title = arg('--title') ?? 'Using {{term}}'
  const minutes = Number(arg('--minutes') ?? 2)
  if (!Number.isFinite(minutes) || minutes <= 0) fail('--minutes must be a positive number')

  write(
    docFile,
    `---
track: lectures
topic: ${topic}
article: ${id}
entity_id: '${topic}:${id}'
locale: en
title: '${title.replaceAll("'", "''")}'
summary: ''
terms:
${Object.entries(terms).map(([locale, term]) => `  ${locale}: ${JSON.stringify(term)}`).join('\n')}
status: draft
order: 1
minutes: ${minutes}
related: []
---

Write the shared explanation here. Use \`:target-term\` wherever the selected
dictionary language's example term should appear.
`
  )
  console.log(`lecture: scaffolded shared article ${topic}/${id}`)
  console.log(`  doc: content/lectures/${topic}/${id}/en.md`)
  console.log('  next: run media-expand-shared-variants.mjs --apply, then translate the explanation')
}

function cmdStatus() {
  const groups = loadGroups()
  let staleCount = 0
  let draftCount = 0
  for (const group of groups.values()) {
    const canonical = group.docs.get(CANONICAL)
    if (!canonical) {
      console.log(`  BROKEN  ${group.topic}/${group.id}: no canonical '${CANONICAL}' document`)
      continue
    }
    console.log(`  ${group.topic}/${group.id}`)
    for (const [locale, doc] of group.docs) {
      const stale = locale !== CANONICAL && doc.data.sourceSha !== canonical.sha
      if (stale) staleCount++
      if ((doc.data.status ?? 'draft') === 'draft') draftCount++
      console.log(`    ${locale.padEnd(3)} ${doc.data.status ?? 'draft'}${stale ? '  STALE (canonical changed)' : ''}`)
    }
  }
  console.log(`\nlecture status: ${groups.size} article(s) · ${draftCount} draft doc(s) · ${staleCount} stale translation(s)`)
  if (staleCount) process.exitCode = 1
}

function cmdTranslate() {
  const [topic, id] = process.argv.slice(3).filter((value) => !value.startsWith('--'))
  const locale = arg('--lang')
  if (!topic || !id || !locale) fail('usage: lecture.mjs translate <TOPIC> <ID> --lang <locale>')
  if (!LOCALES.includes(locale)) fail(`unknown locale '${locale}'`)
  const group = loadGroups().get(articleKey(topic, id))
  if (!group) fail(`no content docs for '${topic}/${id}'`)
  const canonical = group.docs.get(CANONICAL)
  if (!canonical) fail(`'${topic}/${id}' has no canonical English document`)
  const target = join(group.dir, `${locale}.md`)
  if (existsSync(target) && !flag('--force')) fail(`'${target}' exists — use --force to refresh front matter only`)

  if (existsSync(target)) {
    const existing = grayMatter(readFileSync(target, 'utf8'))
    const front = { ...existing.data, status: 'draft', sourceSha: canonical.sha }
    delete front.reviewedAt
    write(target, grayMatter.stringify(existing.content, front))
  } else {
    const front = { ...canonical.data, locale, status: 'draft', sourceSha: canonical.sha }
    delete front.reviewedAt
    write(target, grayMatter.stringify(canonical.content, front))
  }
  console.log(`translate: ${topic}/${id}/${locale} is in sync with the English source; translate the body, then review`)
}

function cmdReview() {
  const [topic, id] = process.argv.slice(3).filter((value) => !value.startsWith('--'))
  const locale = arg('--lang')
  if (!topic || !id || !locale) fail('usage: lecture.mjs review <TOPIC> <ID> --lang <locale>')
  const group = loadGroups().get(articleKey(topic, id))
  if (!group) fail(`no content docs for '${topic}/${id}'`)
  const doc = group.docs.get(locale)
  const canonical = group.docs.get(CANONICAL)
  if (!doc) fail(`'${topic}/${id}' has no '${locale}' document`)
  if (!canonical) fail(`'${topic}/${id}' has no canonical English document`)
  if (locale !== CANONICAL && doc.data.sourceSha !== canonical.sha && !flag('--force')) {
    fail(`'${topic}/${id}/${locale}' is stale — re-translate or review with --force`)
  }
  const front = { ...doc.data, status: flag('--unreview') ? 'draft' : 'reviewed' }
  if (flag('--unreview')) delete front.reviewedAt
  else front.reviewedAt = new Date().toISOString()
  write(doc.file, grayMatter.stringify(doc.content, front))
  console.log(`review: ${topic}/${id}/${locale} → ${front.status}`)
}

const command = process.argv[2]
if (command === 'new') cmdNew()
else if (command === 'status') cmdStatus()
else if (command === 'translate') cmdTranslate()
else if (command === 'review') cmdReview()
else fail('usage: lecture.mjs <new|status|translate|review> …')
