#!/usr/bin/env node
/**
 * add-lt01-english-groups.mjs — one-off: Task 2 of planning/lt01-english-plan.md.
 * Builds the English half of LT01T02 (Letter groups & sounds).
 *
 *   --setup   merge the duplicate moved pages, add the new groups (facts hand-written below, in
 *             General American), create their manifests, and put the English items in teaching order
 *   --names   after generate-alphabet-content.py has filled `exampleTranslation`: give each new
 *             manifest the per-language name the table shows ("wh in what (ce)")
 *
 *   node scripts/add-lt01-english-groups.mjs --setup
 *   node scripts/add-lt01-english-groups.mjs --names
 *
 * Nothing is touched without a flag. The groups' pages come from generate-alphabet-content.py.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { articlePath } from './lib/articles.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SIDEBAR = join(ROOT, 'src/data/sidebars/library/lectures/sidebar.json')
const ALPHABET = join(ROOT, 'src/data/alphabets/en.json')
const MEDIA = join(ROOT, 'media/lectures/LT01')
const FOLDER = 'LT01T08' // where the English T02 manifests already live (the folder says nothing about the topic)
const LOCALES = ['en', 'ro', 'de', 'ru', 'it', 'es', 'fr', 'hu', 'pt']

/** Duplicates of a page that already lists every sound of the group. */
const MERGED_AWAY = ['L615', 'L618', 'L619', 'L625', 'L626']

/** [glyph, sound summary, example, example IPA, [[sound, when, [[word, ipa], ...]], ...]]  (General American) */
const NEW = [
  ['wh', '/w/', 'what', '/wʌt/', [['/w/', 'in most words', [['when', '/wɛn/'], ['white', '/waɪt/']]], ['/h/', 'before o in a few words', [['who', '/huː/'], ['whole', '/hoʊl/']]]]],
  ['qu', '/kw/', 'queen', '/kwiːn/', [['/kw/', 'in most words', [['queen', '/kwiːn/'], ['quick', '/kwɪk/']]], ['/k/', 'in a few words that came from French', [['unique', '/ju.niːk/'], ['antique', '/æn.tiːk/']]]]],
  ['ck', '/k/', 'back', '/bæk/', [['/k/', 'after a short vowel, at the end of a syllable', [['back', '/bæk/'], ['duck', '/dʌk/']]]]],
  ['tch', '/tʃ/', 'catch', '/kætʃ/', [['/tʃ/', 'after a short vowel, at the end of a word', [['catch', '/kætʃ/'], ['match', '/mætʃ/']]]]],
  ['dge', '/dʒ/', 'bridge', '/brɪdʒ/', [['/dʒ/', 'after a short vowel, at the end of a word', [['bridge', '/brɪdʒ/'], ['badge', '/bædʒ/']]]]],
  ['ew', '/uː/', 'new', '/nuː/', [['/uː/', 'after n, r, l or ch', [['new', '/nuː/'], ['grew', '/ɡruː/']]], ['/juː/', 'after f or p', [['few', '/fjuː/'], ['pew', '/pjuː/']]]]],
  ['ay', '/eɪ/', 'play', '/pleɪ/', [['/eɪ/', 'at the end of a word or syllable', [['play', '/pleɪ/'], ['day', '/deɪ/']]]]],
  ['igh', '/aɪ/', 'night', '/naɪt/', [['/aɪ/', 'the gh is silent', [['night', '/naɪt/'], ['high', '/haɪ/']]]]],
  ['ci', '/ʃ/', 'delicious', '/dɪ.lɪ.ʃəs/', [['/ʃ/', 'before a vowel, in the middle of a word', [['delicious', '/dɪ.lɪ.ʃəs/'], ['ancient', '/eɪn.ʃənt/']]]]],
  ['ti', '/ʃ/', 'patient', '/peɪ.ʃənt/', [['/ʃ/', 'before a vowel, in the middle of a word', [['patient', '/peɪ.ʃənt/'], ['initial', '/ɪ.nɪ.ʃəl/']]]]],
  ['-ture', '/tʃɚ/', 'picture', '/pɪk.tʃɚ/', [['/tʃɚ/', 'at the end of a word', [['picture', '/pɪk.tʃɚ/'], ['furniture', '/fɝ.nɪ.tʃɚ/']]]]],
  ['pl', '/pl/', 'plan', '/plæn/', [['/pl/', 'at the start of a syllable', [['plan', '/plæn/'], ['please', '/pliːz/']]]]],
  ['pr', '/pr/', 'price', '/praɪs/', [['/pr/', 'at the start of a syllable', [['price', '/praɪs/'], ['press', '/prɛs/']]]]],
  ['tr', '/tr/', 'train', '/treɪn/', [['/tr/', 'at the start of a syllable', [['train', '/treɪn/'], ['tree', '/triː/']]]]],
  ['fr', '/fr/', 'friend', '/frɛnd/', [['/fr/', 'at the start of a syllable', [['friend', '/frɛnd/'], ['free', '/friː/']]]]],
  ['gl', '/ɡl/', 'glass', '/ɡlæs/', [['/ɡl/', 'at the start of a syllable', [['glass', '/ɡlæs/'], ['glad', '/ɡlæd/']]]]],
  ['sl', '/sl/', 'sleep', '/sliːp/', [['/sl/', 'at the start of a syllable', [['sleep', '/sliːp/'], ['slow', '/sloʊ/']]]]],
  ['sp', '/sp/', 'speak', '/spiːk/', [['/sp/', 'at the start of a syllable', [['speak', '/spiːk/'], ['spot', '/spɑt/']]]]],
  ['sn', '/sn/', 'snow', '/snoʊ/', [['/sn/', 'at the start of a syllable', [['snow', '/snoʊ/'], ['snake', '/sneɪk/']]]]],
  ['sm', '/sm/', 'smile', '/smaɪl/', [['/sm/', 'at the start of a syllable', [['smile', '/smaɪl/'], ['small', '/smɔːl/']]]]],
  ['sw', '/sw/', 'swim', '/swɪm/', [['/sw/', 'at the start of a syllable', [['swim', '/swɪm/'], ['sweet', '/swiːt/']]]]],
  ['str', '/str/', 'street', '/striːt/', [['/str/', 'at the start of a syllable', [['street', '/striːt/'], ['strong', '/strɔːŋ/']]]]]
]

/** English T02 in teaching order, by glyph; the codes of the existing entries are looked up. */
const ORDER = [
  'ea', 'ee', 'ai', 'oa', 'oo', 'ou', 'ow', 'ie', 'au', 'oi', 'oy', 'ay', 'igh', 'ew',
  'ar', 'er', 'ir', 'or', 'ur',
  'sh', 'ch', 'th', 'ph', 'ng', 'wh', 'qu', 'ck', 'tch', 'dge', 'ci', 'ti', '-tion', '-ture',
  'bl', 'br', 'cl', 'cr', 'dr', 'fl', 'gr', 'st', 'pl', 'pr', 'tr', 'fr', 'gl', 'sl', 'sp', 'sn', 'sm', 'sw', 'str',
  '-eigh', '-ough'
]

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const writeJson = (file, data, crlf = false) => {
  const out = `${JSON.stringify(data, null, 2)}\n`
  writeFileSync(file, crlf ? out.replace(/\n/g, '\r\n') : out, 'utf8')
}

function manifestDir(code) {
  for (const folder of readdirSync(MEDIA)) {
    const dir = join(MEDIA, folder, code)
    if (existsSync(join(dir, 'item.json'))) return dir
  }
  return null
}

function setup() {
  const alphabet = readJson(ALPHABET)
  const rawSidebar = readFileSync(SIDEBAR, 'utf8')
  const crlf = rawSidebar.includes('\r\n')
  const sidebar = JSON.parse(rawSidebar)
  const t02 = sidebar.sections.flatMap((s) => s.topics).find((t) => t.code === 'LT01T02')

  // 1. merge: drop the duplicate pages
  const drop = new Set(MERGED_AWAY)
  alphabet.groups = alphabet.groups.filter((e) => !drop.has(e.code))
  alphabet.letters = alphabet.letters.filter((e) => !drop.has(e.code))
  t02.items = t02.items.filter((id) => !drop.has(id))
  for (const code of MERGED_AWAY) {
    rmSync(articlePath(join(ROOT, 'content'), 'lectures', 'LT01T02', code), { force: true })
    const dir = manifestDir(code)
    if (dir) rmSync(dir, { recursive: true, force: true })
  }

  // 2. new groups
  const existing = new Set(alphabet.groups.map((e) => e.code))
  let next = 701
  const added = []
  for (const [glyph, ipa, example, exampleIpa, variants] of NEW) {
    if (alphabet.groups.some((e) => e.glyph === glyph)) continue // idempotent
    const code = `L${next++}`
    while (existing.has(code)) throw new Error(`${code} already used`)
    alphabet.groups.push({
      code, glyph, ipa, letterName: null, example, exampleIpa,
      variations: variants.map(([sound, when, words]) => ({
        ipa: sound, when, examples: words.map(([word, wordIpa]) => ({ word, ipa: wordIpa }))
      }))
    })
    added.push({ code, glyph, example })
    const dir = join(MEDIA, FOLDER, code)
    mkdirSync(dir, { recursive: true })
    writeJson(join(dir, 'item.json'), {
      code, track: 'lectures', chapter: 'LT01', topic: 'LT01T02', kind: 'letter', target: 'en',
      entity_id: `LT01T02:${code}`, cefr: 'A1', tags: ['alphabet#vowel-consonant-groups'],
      locales: Object.fromEntries(LOCALES.map((l) => [l, { name: glyph }]))
    })
  }

  // 3. teaching order of the English items (other languages' items keep their place)
  const byGlyph = new Map(alphabet.groups.map((e) => [e.glyph, e.code]))
  const ordered = ORDER.map((g) => {
    const code = byGlyph.get(g)
    if (!code) throw new Error(`no entry for ${g}`)
    return code
  })
  const english = new Set(ordered)
  const stale = t02.items.filter((id) => !english.has(id) && alphabet.groups.concat(alphabet.letters).some((e) => e.code === id))
  if (stale.length) throw new Error(`English items missing from ORDER: ${stale.join(', ')}`)
  t02.items = [...t02.items.filter((id) => !english.has(id)), ...ordered]

  writeJson(ALPHABET, alphabet)
  writeJson(SIDEBAR, sidebar, crlf)
  console.log(`merged away ${MERGED_AWAY.length}, added ${added.length}: ${added.map((a) => `${a.code}=${a.glyph}`).join(' ')}`)
  console.log(`LT01T02 English items: ${ordered.length}`)
}

function names() {
  const alphabet = readJson(ALPHABET)
  let done = 0
  for (const entry of alphabet.groups) {
    const dir = manifestDir(entry.code)
    if (!dir || !entry.exampleTranslation) continue
    const file = join(dir, 'item.json')
    const manifest = readJson(file)
    if (!NEW.some(([glyph]) => glyph === entry.glyph)) continue
    for (const locale of LOCALES) {
      const meaning = entry.exampleTranslation[locale]
      if (locale === 'en' || !meaning) continue
      manifest.locales[locale] = { ...manifest.locales[locale], name: `${entry.glyph} in ${entry.example} (${meaning})` }
    }
    writeJson(file, manifest)
    done += 1
  }
  console.log(`names filled for ${done} manifest(s); now run: node scripts/sync-alphabet-manifests.mjs --apply`)
}

if (process.argv.includes('--setup')) setup()
else if (process.argv.includes('--names')) names()
else console.log('use --setup or --names')
