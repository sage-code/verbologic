#!/usr/bin/env node
/**
 * extract-legacy.mjs — Phase 2 legacy extraction.
 * Parses the archived roadmap HTML tables (data-audio rows) and emits the decoupled
 * O(N) payloads consumed by the Nuxt app:
 *   public/data/entities/*.json   (language-neutral, no UI text)
 *   public/data/locales/en.json   (generic UI chrome)
 *   public/data/locales/ro.json   (UI chrome + L1-relative contrastive notes)
 *
 * Run:  node scripts/extract-legacy.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MEDIA_BASE = 'https://media.verbologic.com/'
const DIRS = {
  entities: join(ROOT, 'public/data/entities'),
  locales: join(ROOT, 'public/data/locales')
}

/* ------------------------------------------------------------------ */
/* Minimal HTML helpers (no dependencies)                              */
/* ------------------------------------------------------------------ */

const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

/** Strip tags + collapse whitespace. */
const text = (s) => decode(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

const rows = (html) => [...html.matchAll(/<tr[\s>][\s\S]*?<\/tr>/g)].map((m) => m[0])
const cells = (tr) => [...tr.matchAll(/<td(?:\s[^>]*)?>([\s\S]*?)<\/td>/g)].map((m) => m[1])

/** Extract the audio slug from a cell's data-audio attribute, if any. */
const audioSlug = (cell) => {
  const m = cell.match(/data-audio="[^"]*\/([^/"]+)\.mp3"/)
  return m ? m[1] : null
}

/** ASCII slug (diacritics stripped) used for ids/URLs. */
const slug = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const read = (f) => readFileSync(join(ROOT, 'archive', f), 'utf-8')
const writeJson = (f, data) => {
  mkdirSync(DIRS.entities, { recursive: true })
  mkdirSync(DIRS.locales, { recursive: true })
  writeFileSync(join(DIRS.entities, f), JSON.stringify(data, null, 2) + '\n')
}

/* ------------------------------------------------------------------ */
/* Shared entity factory                                               */
/* ------------------------------------------------------------------ */

const base = (prefix, lang, type, term, audio) => ({
  id: audio ? `${prefix}_${audio}` : `${prefix}_${slug(term)}`,
  type,
  lang,
  term,
  ipa: null,
  translations: {},
  context: null,
  audio: audio ? `${MEDIA_BASE}audio/${lang}/${prefix}_${audio}.mp3` : null
})
/* ------------------------------------------------------------------ */
/* 1. ro_vocabulary.json — 6-column table + h3 section categories     */
/* ------------------------------------------------------------------ */

function parseVocabulary() {
  const html = read('romanian/vocabulary.html')
  const out = []
  let category = null
  const stream = [...html.matchAll(
    /<tr[\s>][\s\S]*?<\/tr>|<h3[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h3>/g
  )]
  for (const m of stream) {
    if (m[0].startsWith('<tr')) {
      const tr = m[0]
      if (tr.includes('<th')) continue // header row
      const c = cells(tr)
      if (c.length < 5) continue // malformed/divider row
      const e = base('word', 'ro', 'word', text(c[0]), audioSlug(c[1]))
      e.category = category
      e.translations = {
        en: text(c[2]),
        es: text(c[3]),
        it: text(c[4]),
        fr: text(c[5])
      }
      out.push(e)
    } else {
      category = { id: m[1], title: text(m[2]) }
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/* 2. ro_sentences.json, ro_imperative.json, ro_greetings.json         */
/* ------------------------------------------------------------------ */

function parseSentences() {
  return rows(read('romanian/sentences.html'))
    .filter((tr) => !tr.includes('<th'))
    .map((tr) => {
      const c = cells(tr)
      const e = base('sentence', 'ro', 'sentence', text(c[0]), audioSlug(c[1]))
      e.translations = { en: text(c[2]) }
      return e
    })
    .filter((e) => e.term)
}

function parseImperative() {
  return rows(read('romanian/imperative.html'))
    .filter((tr) => !tr.includes('<th'))
    .map((tr) => {
      const c = cells(tr)
      if (c.length < 4) return null
      const e = base('imperative', 'ro', 'imperative', text(c[1]), audioSlug(c[2]))
      e.translations = { en: text(c[3]) }
      return e
    })
    .filter(Boolean)
}

function parseGreetings() {
  return rows(read('romanian/greetings.html'))
    .filter((tr) => !tr.includes('<th'))
    .map((tr) => {
      const c = cells(tr)
      if (c.length < 2) return null
      const e = base('greeting', 'ro', 'greeting', text(c[0]), null) // no audio (TTS queue)
      e.context = text(c[1])
      return e
    })
    .filter(Boolean)
}

/* ------------------------------------------------------------------ */
/* 3. ro_questions.json — one row -> up to 3 entities (Q / Da / Nu)    */
/* ------------------------------------------------------------------ */

function parseQuestions() {
  const out = []
  for (const tr of rows(read('romanian/questions.html')).filter((r) => !r.includes('<th'))) {
    const c = cells(tr)
    if (c.length < 7) continue
    for (const idx of [1, 3, 5]) {
      const e = base('question', 'ro', 'question', text(c[idx]), audioSlug(c[idx + 1]))
      if (e.term) out.push(e)
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/* 4. ro_alphabet.json — letters(4 cols) + digraphs(variable cols)      */
/*    Contrastive phonetics notes harvested separately for locales.     */
/* ------------------------------------------------------------------ */

// ASCII-safe ids for the 5 diacritic letters (no audio slugs to inherit).
const RO_LETTER_ID = {
  Ă: 'letter_a_breve',
  Â: 'letter_a_circumflex',
  Î: 'letter_i_circumflex',
  Ș: 'letter_s_cedilla',
  Ț: 'letter_t_cedilla'
}

function parseRoAlphabet() {
  const html = read('romanian/alphabet.html')
  const entities = []
  const notes = {}
  let kind = 'letters' // flips to 'digraphs' once the second table starts
  for (const tr of rows(html)) {
    if (tr.includes('<th')) {
      if (tr.includes('Digraph')) kind = 'digraphs'
      continue
    }
    const c = cells(tr)
    if (kind === 'letters' && c.length >= 4) {
      const caps = text(c[0])
      const id = RO_LETTER_ID[caps] || `letter_${slug(caps)}`
      entities.push({
        id, type: 'letter', lang: 'ro',
        term: caps,
        ipa: text(c[2]) || null,
        translations: {},
        context: null,
        audio: null // TTS queue
      })
      notes[id] = text(c[3])
    } else {
      // Digraph / trigraph row: term = cell 0, remaining cells explored as a note.
      const id = `letter_${slug(text(c[0]))}`
      entities.push({
        id, type: 'letter', lang: 'ro',
        term: text(c[0]),
        ipa: null,
        translations: {},
        context: null,
        audio: null // TTS queue
      })
      notes[id] = c.slice(1).map(text).join(' · ')
    }
  }
  return { entities, notes }
}

/* ------------------------------------------------------------------ */
/* 5. en_alphabet.json — 5 cols: term | ipa | example | audio | ro      */
/* ------------------------------------------------------------------ */

function parseEnAlphabet() {
  const out = []
  for (const tr of rows(read('english/alphabet.html')).filter((r) => !r.includes('<th'))) {
    const c = cells(tr)
    if (c.length < 5) continue
    // Letter rows (5 cells): term | ipa | example | audio | ro-gloss
    // Pattern/silent-cluster rows (6): term | description | ipa | example | audio | ro-gloss
    const pattern = c.length >= 6 && !text(c[1]).startsWith('/')
    const slugA = audioSlug(pattern ? c[4] : c[3])
    const e = {
      // id derives from the row's own audio slug → guaranteed unique AND mirrors the R2 key.
      id: slugA ? `letter_${slugA}` : `letter_${slug(text(c[0]))}-${slug((text(c[pattern ? 2 : 1]) || '').replace(/[^a-z0-9]/gi, ''))}`,
      type: 'letter',
      lang: 'en',
      term: text(c[0]),
      ipa: text(pattern ? c[2] : c[1]) || null,
      example: text(pattern ? c[3] : c[2]),
      translations: (() => {
        const ro = text(c[pattern ? 5 : 4])
        return ro ? { ro } : {}
      })(),
      context: pattern ? text(c[1]) : null,
      audio: slugA ? `${MEDIA_BASE}audio/en/letter_${slugA}.mp3` : null
    }
    out.push(e)
  }
  return out
}


/* ------------------------------------------------------------------ */
/* Locale emission + main                                              */
/* ------------------------------------------------------------------ */

const UI_EN = {
  ui: {
    play: 'Play',
    pause: 'Pause',
    play_all: 'Play all rows',
    search_placeholder: 'Search words, phrases, questions…',
    no_results: 'No matches found.',
    back: 'Back',
    listen: 'Listen'
  }
}

const UI_RO = {
  ui: {
    play: 'Redă',
    pause: 'Pauză',
    play_all: 'Redă toate rândurile',
    search_placeholder: 'Caută cuvinte, expresii, întrebări…',
    no_results: 'Niciun rezultat găsit.',
    back: 'Înapoi',
    listen: 'Ascultă'
  }
}

function main() {
  const results = {
    ro_vocabulary: parseVocabulary(),
    ro_sentences: parseSentences(),
    ro_imperative: parseImperative(),
    ro_greetings: parseGreetings(),
    ro_questions: parseQuestions()
  }

  const roAlphabet = parseRoAlphabet()
  results.ro_alphabet = roAlphabet.entities
  results.en_alphabet = parseEnAlphabet()

  // Legacy rows occasionally share an audio slug (e.g. 'cat.mp3' used by two
  // English patterns) or duplicate term slugs (greetings). IDs must be unique.
  const seen = new Set()
  for (const list of Object.values(results)) {
    for (const e of list) {
      const base = e.id
      let id = base
      let n = 2
      while (seen.has(id)) id = `${base}-${n++}`
      seen.add(id)
      e.id = id
    }
  }

  for (const [name, list] of Object.entries(results)) {
    writeJson(`${name}.json`, list)
  }

  // Locales: generic chrome in both languages + contrastive notes (L1-relative, ro only).
  mkdirSync(DIRS.locales, { recursive: true })
  writeFileSync(join(DIRS.locales, 'en.json'), JSON.stringify(UI_EN, null, 2) + '\n')

  const roLocale = { ...UI_RO, contrastive: roAlphabet.notes }
  writeFileSync(join(DIRS.locales, 'ro.json'), JSON.stringify(roLocale, null, 2) + '\n')

  // Report
  let withAudio = 0
  let queuedTts = 0
  for (const list of Object.values(results)) {
    for (const e of list) {
      if (e.audio) withAudio++
      else queuedTts++
    }
  }
  const summary = Object.fromEntries(
    Object.entries(results).map(([k, v]) => [k, v.length])
  )
  console.log('OK — entities written to public/data/entities.')
  console.table(summary)
  console.log(`audio links: ${withAudio} · TTS queued (audio:null): ${queuedTts}`)
  console.log('locales: public/data/locales/en.json, ro.json')
}

main()
