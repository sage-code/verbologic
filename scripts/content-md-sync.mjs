#!/usr/bin/env node
/**
 * content-md-sync.mjs — keep the derived Markdown in step with the article JSON.
 *
 *   node scripts/content-md-sync.mjs            write what is missing or different
 *   node scripts/content-md-sync.mjs --check    exit 1 if any Markdown is stale
 *
 * content/<track>/<TOPIC>/<ID>.json is the source (scripts/lib/articles.mjs).
 * Nuxt Content still builds the article pages from content/<track>/<TOPIC>/<ID>/<locale>.md
 * until phase 3 of planning/content-in-database.md, so those files are a derived
 * copy: rewritten here, never edited by hand, deleted in phase 4.
 *
 * A file is rewritten only when its meaning differs (front matter values or
 * body), not when its formatting does, so running this on an unchanged tree
 * touches nothing.
 */
import grayMatter from 'gray-matter'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeBody, readArticle, renderBody } from './lib/articles.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CONTENT = join(ROOT, 'content')
const checkOnly = process.argv.includes('--check')

const ARTICLE_META = ['order', 'minutes', 'paragraphsPerPage', 'terms', 'related', 'video', 'image', 'context']
const LOCALE_META = ['title', 'summary', 'status', 'sourceSha', 'reviewedAt']

/** The front matter + body one locale of an article should have as Markdown. */
function expected(track, topic, id, article, locale) {
  const doc = article.locales[locale]
  const data = { track, topic, article: id, entity_id: article.entity_id, locale }
  for (const key of LOCALE_META) if (doc[key] !== undefined) data[key] = doc[key]
  for (const key of ARTICLE_META) {
    // A story's character context is written on the canonical (English) document only.
    if (key === 'context' && locale !== 'en') continue
    if (article[key] !== undefined) data[key] = article[key]
  }
  return { data, body: renderBody(doc) }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([x], [y]) => (x < y ? -1 : 1)))

let written = 0
let removed = 0
const stale = []
for (const track of ['dictionary', 'lectures', 'stories']) {
  const trackDir = join(CONTENT, track)
  if (!existsSync(trackDir)) continue
  for (const topic of readdirSync(trackDir)) {
    const topicDir = join(trackDir, topic)
    if (!statSync(topicDir).isDirectory()) continue
    for (const name of readdirSync(topicDir)) {
      if (!name.endsWith('.json')) continue
      const id = name.slice(0, -'.json'.length)
      const article = readArticle(join(topicDir, name))
      const folder = join(topicDir, id)
      const wanted = new Set(Object.keys(article.locales))

      for (const locale of wanted) {
        const file = join(folder, `${locale}.md`)
        const want = expected(track, topic, id, article, locale)
        let current = null
        if (existsSync(file)) {
          const parsed = grayMatter(readFileSync(file, 'utf8'))
          current = { data: parsed.data, body: parsed.content }
        }
        if (
          current &&
          same(sortKeys(current.data), sortKeys(want.data)) &&
          normalizeBody(current.body) === normalizeBody(want.body)
        ) continue
        stale.push(`${track}/${topic}/${id}/${locale}.md`)
        if (checkOnly) continue
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, grayMatter.stringify(want.body + String.fromCharCode(10), want.data), 'utf8')
        written++
      }
      // A language dropped from the JSON must not linger as a page.
      if (existsSync(folder)) {
        for (const file of readdirSync(folder)) {
          if (file.endsWith('.md') && !wanted.has(file.slice(0, -3))) {
            stale.push(`${track}/${topic}/${id}/${file} (no longer in the JSON)`)
            if (!checkOnly) {
              rmSync(join(folder, file))
              removed++
            }
          }
        }
      }
    }
  }
}

if (checkOnly) {
  if (stale.length) {
    console.error(`content-md-sync: ${stale.length} Markdown file(s) differ from the JSON:`)
    stale.slice(0, 15).forEach((s) => console.error(`  ${s}`))
    process.exit(1)
  }
  console.log('content-md-sync --check OK: Markdown matches the JSON')
} else {
  console.log(`content-md-sync: ${written} written, ${removed} removed`)
}
