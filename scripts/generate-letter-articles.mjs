/**
 * Generate one article per letter / letter group from the phonetic data files.
 *
 * A letter article is not free prose — it is a fixed template over structured
 * facts (glyph, IPA, letter name, example, note). Authoring 363 items × 9 UI
 * locales by hand would be 3 267 Markdown files; rendering them from
 * src/data/alphabets/<lang>.json is 9 data files plus this template.
 *
 * Output: content/lectures/<TOPIC>/<CODE>/<locale>.md — the same shape the
 * existing article route, prerendering and `sourceSha` review tooling expect,
 * so nothing downstream changes.
 *
 *   node scripts/generate-letter-articles.mjs [--apply] [--lang de]
 *
 * Without --apply it reports what it would write.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOCALES } from './lib/locales.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SIDEBAR = join(ROOT, 'src', 'data', 'sidebars', 'library', 'lectures', 'sidebar.json')
const ALPHABETS = join(ROOT, 'src', 'data', 'alphabets')
const CONTENT = join(ROOT, 'content', 'lectures')
const MEDIA = join(ROOT, 'media', 'lectures')

const apply = process.argv.includes('--apply')
const langArg = process.argv.find((a) => a.startsWith('--lang='))?.slice('--lang='.length)

/**
 * Localized labels for the facts line — the only translated chrome. A letter
 * article is PROSE (the stories template), not a stack of `##` sections: the
 * reading view paginates a heading-less document one paragraph per page, so
 * headings would turn a two-sentence letter into four separate pages.
 */
const LABELS = {
  en: { name: 'Letter name', example: 'Example' },
  ro: { name: 'Numele literei', example: 'Exemplu' },
  de: { name: 'Buchstabenname', example: 'Beispiel' },
  ru: { name: 'Название буквы', example: 'Пример' },
  it: { name: 'Nome della lettera', example: 'Esempio' },
  es: { name: 'Nombre de la letra', example: 'Ejemplo' },
  fr: { name: 'Nom de la lettre', example: 'Exemple' },
  hu: { name: 'A betű neve', example: 'Példa' },
  pt: { name: 'Nome da letra', example: 'Exemplo' }
}

/** True when `text` already states `value` — keeps the facts line from
 *  repeating what the note says (the English/German notes do). */
const mentions = (text, value) =>
  Boolean(value) && text.toLowerCase().includes(String(value).toLowerCase())

/**
 * The article body: ONE paragraph — the glyph and the sound it stands for, the
 * explanation, then the facts the explanation does not already state. The
 * reading view paginates a heading-less document one paragraph per page, so a
 * single paragraph keeps a letter on a single page (a stack of `##` sections
 * would turn two sentences into four pages).
 */
function letterBody(entry, title, note, labels) {
  const head = entry.ipa ? `**${title}** · \`${entry.ipa}\`` : `**${title}**`
  const facts = []
  if (entry.letterName && !mentions(note, entry.letterName)) {
    facts.push(`${labels.name}: ${entry.letterName}`)
  }
  if (entry.example && !mentions(note, entry.example)) {
    facts.push(`${labels.example}: ${entry.example}`)
  }
  const tail = [note, facts.join(' · ')].filter(Boolean).join(' ')
  return tail ? `${head} — ${tail}` : head
}

/** YAML-safe scalar: single-quote and escape embedded quotes. */
const yaml = (value) => `'${String(value).replaceAll("'", "''")}'`

const sidebar = JSON.parse(readFileSync(SIDEBAR, 'utf8'))
const chapter = sidebar.sections.find((s) => s.code === 'LT01')

/** topic code → { sourceLang, items[] } for every phonetic topic. */
const topics = chapter.topics.filter((t) => t.phonetic === true && t.sourceLang)

let written = 0
let skipped = 0

for (const topic of topics) {
  if (langArg && topic.sourceLang !== langArg) continue
  const dataFile = join(ALPHABETS, `${topic.sourceLang}.json`)
  if (!existsSync(dataFile)) {
    console.warn(`skip ${topic.code}: no ${topic.sourceLang}.json`)
    continue
  }
  const data = JSON.parse(readFileSync(dataFile, 'utf8'))
  const entries = [...data.letters, ...data.groups]

  for (const entry of entries) {
    if (!topic.items.includes(entry.code)) continue
    const dir = join(CONTENT, topic.code, entry.code)
    const title = entry.glyph ?? entry.code

    // The manifest's `names` is the authoritative per-locale term: a single
    // letter is the same glyph everywhere, but a letter GROUP carries a
    // localized gloss ("st in star (stea)"). validate-data requires the
    // article's terms map to match it exactly.
    const manifestFile = join(MEDIA, chapter.code, topic.code, entry.code, 'item.json')
    const manifestNames = existsSync(manifestFile)
      ? JSON.parse(readFileSync(manifestFile, 'utf8')).names ?? {}
      : {}

    for (const locale of LOCALES) {
      const file = join(dir, `${locale}.md`)
      const labels = LABELS[locale] ?? LABELS.en
      const note = entry.note?.[locale] ?? entry.note?.en ?? ''
      const body = letterBody(entry, title, note, labels)

      const lines = [
        '---',
        'track: lectures',
        `topic: ${topic.code}`,
        `article: ${entry.code}`,
        `locale: ${locale}`,
        `title: ${yaml(title)}`,
        `summary: ${yaml(note.split('\n')[0].slice(0, 160))}`,
        'status: draft',
        'related: []',
        'order: 0',
        `entity_id: ${yaml(`${topic.code}:${entry.code}`)}`,
        // A phonetic item's manifest `names` is the authoritative per-locale
        // term; validate-data requires the article's terms map to match it.
        'terms:',
        ...LOCALES.map((l) => `  ${l}: ${yaml(manifestNames[l] ?? title)}`),
        '---',
        '',
        body,
        ''
      ]

      const content = `${lines.join('\n')}\n`
      if (existsSync(file) && readFileSync(file, 'utf8') === content) {
        skipped++
        continue
      }
      if (apply) {
        mkdirSync(dir, { recursive: true })
        writeFileSync(file, content, 'utf8')
      }
      written++
    }
  }
}

const verb = apply ? 'wrote' : 'would write'
console.log(`${verb} ${written} article file(s); ${skipped} already up to date`)
if (!apply) console.log('(dry run — pass --apply to write)')
