#!/usr/bin/env node
/**
 * Shared lecture content workflow.
 *
 *   content/lectures/<TOPIC>/<ID>.json     one file per article, every language inside
 *
 * See scripts/lib/articles.mjs and planning/content-in-database.md section 5.
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
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { articlePath, readArticle, writeArticle } from './lib/articles.mjs'
import { LOCALES } from './lib/locales.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CONTENT = join(ROOT, 'content')
const LECTURES = join(CONTENT, 'lectures')
const AUDIO = join(ROOT, 'media', 'audio')
const SIDEBAR_FILE = join(ROOT, 'src', 'data', 'sidebars', 'library', 'lectures', 'sidebar.json')
const CANONICAL = 'en'

/** Hash of one language's page: what a translation's `sourceSha` is compared with. */
const pageSha = (doc) =>
  createHash('sha1')
    .update(JSON.stringify({ title: doc.title, summary: doc.summary, sections: doc.sections, paragraphs: doc.paragraphs }))
    .digest('hex')
const fail = (message) => {
  console.error(`ERROR: ${message}`)
  process.exit(1)
}
const arg = (name) => {
  const at = process.argv.indexOf(name)
  return at > -1 ? process.argv[at + 1] : undefined
}
const flag = (name) => process.argv.includes(name)

/** Every lecture article: topic, id, file and the parsed article. */
function loadArticles() {
  const out = []
  if (!existsSync(LECTURES)) return out
  for (const topic of readdirSync(LECTURES)) {
    for (const name of readdirSync(join(LECTURES, topic))) {
      if (!name.endsWith('.json')) continue
      const id = name.slice(0, -'.json'.length)
      const file = join(LECTURES, topic, name)
      const article = readArticle(file)
      if (article.entity_id !== `${topic}:${id}`) fail(`'${topic}/${name}' entity_id does not match its path`)
      out.push({ topic, id, file, article })
    }
  }
  return out
}

function findArticle(topic, id) {
  const file = articlePath(CONTENT, 'lectures', topic, id)
  return existsSync(file) ? { topic, id, file, article: readArticle(file) } : null
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
  const docFile = articlePath(CONTENT, 'lectures', topic, id)
  if (existsSync(docFile)) fail(`'${docFile}' already exists`)

  const terms = loadTerms(topic, id)
  const sidebar = JSON.parse(readFileSync(SIDEBAR_FILE, 'utf8'))
  const topicEntry = findTopic(sidebar, topic)
  if (!topicEntry) fail(`unknown topic '${topic}' in ${SIDEBAR_FILE}`)
  if (!topicEntry.items.includes(id)) {
    topicEntry.items.push(id)
    writeFileSync(SIDEBAR_FILE, `${JSON.stringify(sidebar, null, 2)}\n`)
  }

  const title = arg('--title') ?? 'Using {{term}}'
  const minutes = Number(arg('--minutes') ?? 2)
  if (!Number.isFinite(minutes) || minutes <= 0) fail('--minutes must be a positive number')

  writeArticle(docFile, {
    entity_id: `${topic}:${id}`,
    order: 1,
    minutes,
    terms,
    related: [],
    locales: {
      [CANONICAL]: {
        title,
        summary: '',
        status: 'draft',
        paragraphs: [
          'Write the shared explanation here. Use `:target-term` wherever the selected dictionary language\'s example term should appear.'
        ]
      }
    }
  })
  console.log(`lecture: scaffolded shared article ${topic}/${id}`)
  console.log(`  doc: content/lectures/${topic}/${id}.json`)
  console.log('  next: run media-expand-shared-variants.mjs --apply, then translate the explanation')
}

function cmdStatus() {
  const all = loadArticles()
  let staleCount = 0
  let draftCount = 0
  for (const { topic, id, article } of all) {
    const canonical = article.locales[CANONICAL]
    if (!canonical) {
      console.log(`  BROKEN  ${topic}/${id}: no canonical '${CANONICAL}' page`)
      continue
    }
    console.log(`  ${topic}/${id}`)
    for (const [locale, doc] of Object.entries(article.locales)) {
      const stale = locale !== CANONICAL && doc.sourceSha !== pageSha(canonical)
      if (stale) staleCount++
      if ((doc.status ?? 'draft') === 'draft') draftCount++
      console.log(`    ${locale.padEnd(3)} ${doc.status ?? 'draft'}${stale ? '  STALE (canonical changed)' : ''}`)
    }
  }
  console.log(`\nlecture status: ${all.length} article(s) · ${draftCount} draft page(s) · ${staleCount} stale translation(s)`)
  if (staleCount) process.exitCode = 1
}

function cmdTranslate() {
  const [topic, id] = process.argv.slice(3).filter((value) => !value.startsWith('--'))
  const locale = arg('--lang')
  if (!topic || !id || !locale) fail('usage: lecture.mjs translate <TOPIC> <ID> --lang <locale>')
  if (!LOCALES.includes(locale)) fail(`unknown locale '${locale}'`)
  const found = findArticle(topic, id)
  if (!found) fail(`no article for '${topic}/${id}'`)
  const canonical = found.article.locales[CANONICAL]
  if (!canonical) fail(`'${topic}/${id}' has no canonical English page`)
  const existing = found.article.locales[locale]
  if (existing && !flag('--force')) fail(`'${topic}/${id}' already has a '${locale}' page — use --force to refresh its status only`)

  // A new page starts as a copy of the English one, marked draft and tied to the
  // exact English text it was made from (`sourceSha`); the translation then replaces the text.
  const page = existing ? { ...existing } : structuredClone(canonical)
  page.status = 'draft'
  page.sourceSha = pageSha(canonical)
  delete page.reviewedAt
  found.article.locales[locale] = page
  writeArticle(found.file, found.article)
  console.log(`translate: ${topic}/${id}/${locale} is in sync with the English source; translate the text, then review`)
}

function cmdReview() {
  const [topic, id] = process.argv.slice(3).filter((value) => !value.startsWith('--'))
  const locale = arg('--lang')
  if (!topic || !id || !locale) fail('usage: lecture.mjs review <TOPIC> <ID> --lang <locale>')
  const found = findArticle(topic, id)
  if (!found) fail(`no article for '${topic}/${id}'`)
  const doc = found.article.locales[locale]
  const canonical = found.article.locales[CANONICAL]
  if (!doc) fail(`'${topic}/${id}' has no '${locale}' page`)
  if (!canonical) fail(`'${topic}/${id}' has no canonical English page`)
  if (locale !== CANONICAL && doc.sourceSha !== pageSha(canonical) && !flag('--force')) {
    fail(`'${topic}/${id}/${locale}' is stale — re-translate or review with --force`)
  }
  doc.status = flag('--unreview') ? 'draft' : 'reviewed'
  if (flag('--unreview')) delete doc.reviewedAt
  else doc.reviewedAt = new Date().toISOString()
  writeArticle(found.file, found.article)
  console.log(`review: ${topic}/${id}/${locale} → ${doc.status}`)
}

const command = process.argv[2]
if (command === 'new') cmdNew()
else if (command === 'status') cmdStatus()
else if (command === 'translate') cmdTranslate()
else if (command === 'review') cmdReview()
else fail('usage: lecture.mjs <new|status|translate|review> …')
