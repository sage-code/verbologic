#!/usr/bin/env node
/**
 * content-md-to-json.mjs — one-shot codemod: content/<track>/<TOPIC>/<ID>/<locale>.md
 * becomes content/<track>/<TOPIC>/<ID>.json with every language inside.
 *
 *   node scripts/content-md-to-json.mjs --dry-run   report only
 *   node scripts/content-md-to-json.mjs             write the JSON files (the .md files stay)
 *   node scripts/content-md-to-json.mjs --check     exit 1 unless every JSON file reproduces its .md exactly
 *
 * planning/content-in-database.md §10, phase 1. The Markdown is not deleted here:
 * it goes once every reader of content/ has moved to the JSON.
 *
 * --check is the losslessness gate: for every .md it renders the JSON back to a
 * body and compares it with the original body, and it compares every front
 * matter value the JSON keeps. It also fails on a file that is not in canonical form.
 */
import grayMatter from 'gray-matter'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DERIVED_KEYS, articlePath, fold, isCanonical, normalizeBody, parseDoc, readArticle, renderBody, writeArticle
} from './lib/articles.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CONTENT = join(ROOT, 'content')
const TRACKS = ['lectures', 'stories']
const dryRun = process.argv.includes('--dry-run')
const checkOnly = process.argv.includes('--check')

const norm = normalizeBody

/** track -> topic -> id -> locale -> file */
function collect() {
  const found = []
  for (const track of TRACKS) {
    const root = join(CONTENT, track)
    if (!existsSync(root)) continue
    for (const topic of readdirSync(root)) {
      const topicDir = join(root, topic)
      for (const id of readdirSync(topicDir, { withFileTypes: true })) {
        if (!id.isDirectory()) continue
        const docs = {}
        for (const file of readdirSync(join(topicDir, id.name))) {
          if (file.endsWith('.md')) docs[file.slice(0, -3)] = join(topicDir, id.name, file)
        }
        if (Object.keys(docs).length) found.push({ track, topic, id: id.name, docs })
      }
    }
  }
  return found
}

const problems = []
const note = (where, message) => problems.push(`${where}: ${message}`)
let written = 0
let docCount = 0
let articleCount = 0

for (const item of collect()) {
  const where = `${item.track}/${item.topic}/${item.id}`
  const parsed = {}
  for (const [locale, file] of Object.entries(item.docs)) {
    docCount++
    try {
      parsed[locale] = parseDoc(readFileSync(file, 'utf8'))
    } catch (error) {
      note(`${where}/${locale}`, error.message)
    }
  }
  if (!Object.keys(parsed).length) continue
  const { article, issues } = fold(parsed)
  issues.forEach((issue) => note(where, issue))
  articleCount++
  const target = articlePath(CONTENT, item.track, item.topic, item.id)

  if (checkOnly) {
    if (!existsSync(target)) {
      note(where, 'no JSON file')
      continue
    }
    if (!isCanonical(target)) note(where, 'JSON is not in canonical form')
    const json = readArticle(target)
    for (const [locale, file] of Object.entries(item.docs)) {
      const doc = json.locales?.[locale]
      if (!doc) {
        note(`${where}/${locale}`, 'locale missing in JSON')
        continue
      }
      const { data, content } = grayMatter(readFileSync(file, 'utf8'))
      if (norm(renderBody(doc)) !== norm(content)) note(`${where}/${locale}`, 'body differs')
      for (const [key, value] of Object.entries(data)) {
        if (DERIVED_KEYS.includes(key)) continue
        const kept = ['title', 'summary', 'status', 'sourceSha', 'reviewedAt'].includes(key) ? doc[key] : json[key]
        if (key === 'entity_id' ? json.entity_id !== value : JSON.stringify(kept) !== JSON.stringify(value)) {
          note(`${where}/${locale}`, `front matter '${key}' differs`)
        }
      }
    }
    continue
  }
  if (!dryRun && writeArticle(target, article)) written++
}

console.log(`${articleCount} articles from ${docCount} documents`)
if (!checkOnly && !dryRun) console.log(`${written} file(s) written`)
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`)
  problems.slice(0, 40).forEach((p) => console.error(`  ${p}`))
  if (problems.length > 40) console.error(`  … and ${problems.length - 40} more`)
  process.exit(1)
}
console.log(checkOnly ? 'content-md-to-json --check OK: every JSON reproduces its Markdown' : 'content-md-to-json OK')
