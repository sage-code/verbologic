#!/usr/bin/env node
/**
 * alphabet-to-markdown.mjs — convert the alphabet JSON into Markdown articles.
 *
 *   node scripts/alphabet-to-markdown.mjs            write content/lectures/**
 *   node scripts/alphabet-to-markdown.mjs --dry-run  report only
 *   node scripts/alphabet-to-markdown.mjs --check    exit 1 if any file is stale
 *
 * The alphabet data (src/data/alphabets/<lang>.json) stays the authoring
 * surface for the STRUCTURED facts — glyph, IPA, example word, pronunciation
 * variations — because those are data the renderer and the media manifests
 * both need. The PROSE moves to Markdown, which is the authoring tool for
 * articles: one file per (topic, letter, explanation locale).
 *
 *   content/lectures/<TOPIC>/<CODE>/<locale>.md
 *
 * One section = one `##` heading, which is the pagination contract the reading
 * view already uses (a document with headings starts a new page at each one).
 *
 * Idempotent: the output is deterministic, so `--check` is a reliable
 * staleness gate and a re-run rewrites only what changed.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ALPHABETS = join(ROOT, 'src', 'data', 'alphabets')
const SIDEBARS = join(ROOT, 'src', 'data', 'sidebars', 'library', 'lectures', 'sidebar.json')
const CONTENT = join(ROOT, 'content', 'lectures')

const dryRun = process.argv.includes('--dry-run')
const checkOnly = process.argv.includes('--check')

const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'))

/** Section order in the article — the reading order the renderer uses. */
const SECTION_ORDER = ['sound', 'howToSay', 'spelling', 'compare']

/** Every registered explanation locale, in the canonical order. */
const LOCALES = ['en', 'es', 'it', 'fr', 'de', 'ru', 'hu', 'pt', 'ro']

/**
 * The per-locale names of one item, read from its media manifest.
 *
 * A letter's name is the glyph in every language, but a GROUP's is not — the
 * Romanian "ea" is "ea in seară (evening)" in English. The manifest is the
 * authority for those, and the shared-article invariant requires the doc's
 * `terms` to match it exactly.
 */
function manifestNames(track, topic, code) {
  const file = join(ROOT, 'media', track, topic.slice(0, 4), topic, code, 'item.json')
  if (!existsSync(file)) return null
  const manifest = readJson(file)
  const names = {}
  for (const [locale, value] of Object.entries(manifest.locales ?? {})) {
    if (typeof value?.name === 'string' && value.name) names[locale] = value.name
  }
  return Object.keys(names).length ? names : null
}

/**
 * A YAML scalar that survives any prose.
 *
 * JSON string syntax is valid YAML, so quoting with JSON.stringify handles
 * colons, `#`, quotes, backslashes and leading/trailing space in one step —
 * the alternative is a hand-rolled escaper that gets one of those wrong.
 */
const yamlString = (value) => JSON.stringify(String(value))

/** Front matter for one article doc. */
function frontMatter({ topic, code, locale, title, summary, order, entityId, terms }) {
  const lines = [
    '---',
    'track: lectures',
    `topic: ${topic}`,
    `article: ${code}`,
    `locale: ${locale}`,
    `title: ${yamlString(title)}`,
    `summary: ${yamlString(summary)}`,
    'status: draft',
    `entity_id: ${yamlString(entityId)}`,
    `order: ${order}`,
    'terms:',
    ...LOCALES.map((l) => `  ${l}: ${yamlString(terms[l] ?? title)}`),
    '---'
  ]
  return lines.join('\n')
}

/**
 * The Markdown body: one `##` section per authored section, in reading order.
 *
 * The section text already carries inline Markdown (`**bold**`, `` `ipa` ``),
 * so it is written through unchanged — that is the point of moving the prose
 * out of JSON.
 */
function body(entry, locale) {
  const sections = entry.sections?.[locale] ?? entry.sections?.en ?? {}
  const parts = []
  for (const key of SECTION_ORDER) {
    const section = sections[key]
    if (!section?.text) continue
    const title = section.title || key
    parts.push(`## ${title}`, '', section.text.trim(), '')
  }
  return parts.join('\n').trimEnd()
}

/** Every phonetic topic, with the language whose sounds it teaches. */
function phoneticTopics() {
  const sidebar = readJson(SIDEBARS)
  const topics = []
  for (const section of sidebar.sections ?? []) {
    for (const topic of section.topics ?? []) {
      if (topic.phonetic !== true || topic.mode !== 'directional' || !topic.target) continue
      topics.push({ code: topic.code, target: topic.target, items: topic.items ?? [] })
    }
  }
  return topics
}

function main() {
  const topics = phoneticTopics()
  const files = new Map()
  let entries = 0
  let skipped = 0

  for (const topic of topics) {
    const file = join(ALPHABETS, `${topic.target}.json`)
    if (!existsSync(file)) continue
    const data = readJson(file)
    const byCode = new Map()
    for (const entry of [...(data.letters ?? []), ...(data.groups ?? [])]) byCode.set(entry.code, entry)

    topic.items.forEach((code, index) => {
      const entry = byCode.get(code)
      if (!entry) {
        skipped += 1
        return
      }
      entries += 1
      const glyph = entry.glyph ?? entry.code
      for (const locale of LOCALES) {
        const sections = entry.sections?.[locale]
        // A locale with no prose would produce an empty article — skip it so
        // the route list stays honest about what actually exists.
        if (!sections || !SECTION_ORDER.some((key) => sections[key]?.text)) continue
        const note = entry.note?.[locale] ?? entry.note?.en ?? ''
        // A letter's "term" is its glyph in every language, but a group's name
        // is per-locale ("ea in seară (evening)"). The manifest is the
        // authority — the shared-article invariant requires an exact match.
        const names = manifestNames('lectures', topic.code, code)
        const terms = Object.fromEntries(
          LOCALES.map((l) => [l, names?.[l] ?? glyph])
        )
        const text = [
          frontMatter({
            topic: topic.code,
            code,
            locale,
            title: names?.[locale] ?? glyph,
            summary: note.split('\n')[0].slice(0, 200),
            order: index,
            entityId: `${topic.code}:${code}`,
            terms
          }),
          '',
          body(entry, locale),
          ''
        ].join('\n')
        files.set(join(CONTENT, topic.code, code, `${locale}.md`), text)
      }
    })
  }

  let written = 0
  let stale = 0
  for (const [path, text] of files) {
    const existing = existsSync(path) ? readFileSync(path, 'utf-8') : null
    if (existing === text) continue
    stale += 1
    if (dryRun || checkOnly) continue
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, text, 'utf-8')
    written += 1
  }

  const summary = `${entries} entries · ${files.size} doc(s) · ${stale} stale`
  if (checkOnly) {
    console.log(`alphabet-to-markdown: ${summary}`)
    if (stale) {
      console.error('alphabet-to-markdown: content/lectures is stale — re-run without --check')
      process.exit(1)
    }
    return
  }
  if (dryRun) {
    console.log(`alphabet-to-markdown: ${summary} (dry run — nothing written)`)
    return
  }
  console.log(`alphabet-to-markdown: ${summary} · ${written} written`)
  if (skipped) console.log(`alphabet-to-markdown: ${skipped} sidebar item(s) had no alphabet entry`)
}

main()
