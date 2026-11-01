#!/usr/bin/env node
/**
 * cleanup-lt01-english.mjs — one-off: make LT01T01 hold only the English alphabet.
 * planning/lt01-english-plan.md, Task 1.
 *
 *   DISCARD  L579..L595, L597..L602  second and third "sound variants" of A C G S T X Y. Each
 *                                    letter page already teaches every sound of its letter.
 *   MOVE     L614..L626              digraphs and groups (th sh ch ph ng -tion -eigh -ough) to LT01T02
 *   MOVE     L596, L603..L613        silent letters to LT01T04 (spelling patterns)
 *
 * Discarded: sidebar item, alphabet-data entry, article file, local manifest folder (the R2 copies
 * go with `./run.sh media prune`). Moved: sidebar item, article file path and entity_id, manifest
 * `topic` and `entity_id`. Nothing is rewritten when --apply is missing.
 *
 *   node scripts/cleanup-lt01-english.mjs            # dry run
 *   node scripts/cleanup-lt01-english.mjs --apply
 */
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { articlePath, readArticle, writeArticle } from './lib/articles.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const apply = process.argv.includes('--apply')
const SIDEBAR = join(ROOT, 'src/data/sidebars/library/lectures/sidebar.json')
const ALPHABET = join(ROOT, 'src/data/alphabets/en.json')
const CONTENT = join(ROOT, 'content')
const MEDIA = join(ROOT, 'media/lectures/LT01')

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => `L${a + i}`)
const DISCARD = [...range(579, 595), ...range(597, 602)]
const TO_T02 = range(614, 626)
const TO_T04 = ['L596', ...range(603, 613)]

/** The manifest folder of an item: the physical folder is unrelated to its topic. */
function manifestDir(code) {
  for (const folder of readdirSync(MEDIA)) {
    const dir = join(MEDIA, folder, code)
    if (existsSync(join(dir, 'item.json'))) return dir
  }
  return null
}

const rawSidebar = readFileSync(SIDEBAR, 'utf8')
const crlf = rawSidebar.includes('\r\n')
const sidebar = JSON.parse(rawSidebar)
const topics = Object.fromEntries(sidebar.sections.flatMap((s) => s.topics).map((t) => [t.code, t]))

const log = (line) => console.log(`${apply ? '' : '[dry] '}${line}`)

// 1. sidebar lists
const gone = new Set([...DISCARD, ...TO_T02, ...TO_T04])
const t01 = topics.LT01T01
const before = t01.items.length
t01.items = t01.items.filter((id) => !gone.has(id))
for (const [code, ids] of [['LT01T02', TO_T02], ['LT01T04', TO_T04]]) {
  const topic = topics[code]
  topic.items.push(...ids.filter((id) => !topic.items.includes(id)))
}
log(`sidebar: LT01T01 ${before} -> ${t01.items.length}, LT01T02 -> ${topics.LT01T02.items.length}, LT01T04 -> ${topics.LT01T04.items.length}`)

// 2. alphabet data: the discarded entries must not come back through alphabet-to-articles
const alphabet = JSON.parse(readFileSync(ALPHABET, 'utf8'))
const drop = new Set(DISCARD)
for (const key of ['letters', 'groups']) {
  const count = alphabet[key].length
  alphabet[key] = alphabet[key].filter((entry) => !drop.has(entry.code))
  log(`alphabets/en.json ${key}: ${count} -> ${alphabet[key].length}`)
}

// 3. articles and manifests
for (const code of DISCARD) {
  const file = articlePath(CONTENT, 'lectures', 'LT01T01', code)
  const dir = manifestDir(code)
  log(`discard ${code}: ${existsSync(file) ? 'article' : 'no article'}, ${dir ? 'manifest folder' : 'no manifest'}`)
  if (apply) {
    rmSync(file, { force: true })
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
}
for (const [topicCode, ids] of [['LT01T02', TO_T02], ['LT01T04', TO_T04]]) {
  for (const code of ids) {
    const from = articlePath(CONTENT, 'lectures', 'LT01T01', code)
    const to = articlePath(CONTENT, 'lectures', topicCode, code)
    const dir = manifestDir(code)
    log(`move ${code} -> ${topicCode}`)
    if (!apply) continue
    if (existsSync(from)) {
      const article = readArticle(from)
      article.entity_id = `${topicCode}:${code}`
      article.order = topics[topicCode].items.indexOf(code)
      writeArticle(to, article)
      rmSync(from, { force: true })
    }
    if (dir) {
      const file = join(dir, 'item.json')
      const manifest = JSON.parse(readFileSync(file, 'utf8'))
      manifest.topic = topicCode
      manifest.entity_id = `${topicCode}:${code}`
      writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    }
  }
}

// 4. Seeded one-line summaries ("Letter name: A. Example: apple." in every language) only repeat the
// title and the example: blank them (an empty summary is honest, see alphabet-to-articles.mjs).
const ALPHABETS = join(ROOT, 'src/data/alphabets')
const boilerplate = new Set()
for (const file of readdirSync(ALPHABETS)) {
  const data = JSON.parse(readFileSync(join(ALPHABETS, file), 'utf8'))
  for (const entry of [...data.letters, ...data.groups]) {
    if (/^(Letter name:|This is the letter)/.test(entry.note?.en ?? '')) {
      for (const text of Object.values(entry.note)) boilerplate.add(text.split('\n')[0].slice(0, 200))
    }
  }
}
let blanked = 0
for (const topicCode of ['LT01T01', 'LT01T02', 'LT01T04']) {
  const dir = join(CONTENT, 'lectures', topicCode)
  for (const name of readdirSync(dir)) {
    const file = join(dir, name)
    const article = readArticle(file)
    let changed = false
    for (const page of Object.values(article.locales)) {
      if (page.summary && boilerplate.has(page.summary)) {
        page.summary = ''
        changed = true
        blanked += 1
      }
    }
    if (changed && apply) writeArticle(file, article)
  }
}
log(`boilerplate summaries blanked: ${blanked}`)

if (apply) {
  const out = `${JSON.stringify(sidebar, null, 2)}\n`
  writeFileSync(SIDEBAR, crlf ? out.replace(/\n/g, '\r\n') : out, 'utf8')
  writeFileSync(ALPHABET, `${JSON.stringify(alphabet, null, 2)}\n`, 'utf8')
  console.log('done')
} else {
  console.log('dry run: nothing written (use --apply)')
}
