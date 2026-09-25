#!/usr/bin/env node
/**
 * archive-topics.mjs — archive-driven topic attribution + the topic map.
 *
 * The dictionary sidebar (144 topics across 12 chapters) is the structure layer; the legacy archive
 * pages (gitignored /archive/) hold the raw content grouped in <h3> sections
 * (one <h3> per <table>, rows sequential). This module:
 *
 *   1. parses the archive pages (linear h3 → data-audio walk) so every row's
 *      audio slug is attributed to one section,
 *   2. resolves every legacy entity id (public/data/entities) to one sidebar
 *      topic code via the curated MAP (page#section → topic) plus term-level
 *      overrides (greetings/courtesy words) and id-pattern rules (alphabet),
 *   3. emits the committed topic map (topic-map.json) and a coverage report.
 *
 * It never writes sidebars: the dictionary and lectures sidebars are hand-curated.
 *
 *   node scripts/archive-topics.mjs                       # topic map + report
 *
 * Exported for scripts/media-manifests.mjs: attributeAll() → Map<id, {topic, page, section, order}>.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ENTITIES = join(ROOT, 'public', 'data', 'entities')
const SIDEBAR_FILE = join(ROOT, 'src', 'data', 'sidebars', 'library', 'dictionary', 'sidebar.json')
const MAP_FILE = join(ROOT, 'src', 'data', 'sidebars', 'library', 'dictionary', 'topic-map.json')

const LANG_DIR = { ro: 'romanian', en: 'english' }
const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'))
const readArchive = (lang, page) => readFileSync(join(ROOT, 'archive', LANG_DIR[lang], `${page}.html`), 'utf-8')

/** Legacy entity id prefix → archive page (extract-legacy.mjs naming). */
const PAGE_BY_PREFIX = {
  word: 'vocabulary',
  sentence: 'sentences',
  question: 'questions',
  imperative: 'imperative',
  greeting: 'greetings',
  letter: 'alphabet'
}

/** Curated mapping: archive page → section id → sidebar topic code. */
const BUILTIN_MAP = {
  ro: {
    vocabulary: {
      'greetings-courtesy': 'C1T11',
      'identity-people': 'C2T03',
      'time-expressions': 'C3T09',
      'home-objects': 'C3T02',
      'kitchen-food-basics': 'C3T04',
      'daily-routines': 'C3T08',
      'transport-directions': 'C5T03',
      'shopping-money': 'C6T02',
      'health-emergencies': 'C4T04',
      'school-vocabulary': 'C7T01',
      'office-vocabulary': 'C7T03',
      'communication-technology': 'C7T08',
      'travel-essentials': 'C5T07',
      'weather-nature': 'C3T11',
      'emotions-social': 'C2T12'
    },
    questions: {
      'names-and-identity': 'C2T03',
      'family-and-people': 'C2T02',
      'feelings-and-courtesy': 'C2T12',
      'home-objects': 'C3T02',
      'food-and-drink': 'C3T04',
      'daily-routine': 'C3T08',
      'school-life': 'C7T01',
      'office-life': 'C7T03',
      'technology-and-messages': 'C7T08',
      'directions-and-places': 'C5T01',
      'transport-and-tickets': 'C5T03',
      'shopping-and-money': 'C6T02',
      'health-and-help': 'C4T04',
      'emergencies': 'C4T05',
      'weather-and-nature': 'C3T11'
    },
    imperative: {
      'greetings-and-formulas': 'C1T12',
      'identity-and-social': 'C8T02',
      'messages-and-devices': 'C7T06',
      'doors-windows-and-room': 'C3T01',
      'water-bread-and-meals': 'C3T05',
      'daily-routine-commands': 'C3T12',
      'classroom-basics': 'C7T02',
      'office-actions': 'C7T03',
      'digital-tasks': 'C7T08',
      'direction-commands': 'C5T01',
      'transport-steps': 'C5T03',
      'shopping-commands': 'C6T08',
      'health-actions': 'C4T04',
      'emergency-actions': 'C4T05',
      'weather-and-outdoors': 'C3T11'
    },
    sentences: {
      'identity-and-people': 'C2T03',
      'greetings-and-feelings': 'C2T12',
      'home-objects-and-places': 'C3T02',
      'daily-actions-and-meals': 'C3T08',
      'transport-and-shopping': 'C5T03',
      'school-and-office': 'C7T03'
    },
    alphabet: {
      '*': 'C1T01',
      'digraphs': 'C1T03',
      'diphthongs': 'C1T02'
    },
    greetings: { '*': 'C1T11' }
  },
  en: {
    alphabet: { '*': 'C1T01' }
  }
}

/**
 * Term-level overrides where an archive section spans two topics:
 * vocabulary `greetings-courtesy` splits into greetings (C1T11) and courtesy
 * formulas (C1T12); `da`/`nu` are answers → Questions & answers (C8T01);
 * all `greeting_*` rows are greetings/farewells → C1T11.
 */
const TERM_OVERRIDES = {
  word_salut: 'C1T11',
  'word_buna-ziua': 'C1T11',
  'word_buna-seara': 'C1T11',
  'word_la-revedere': 'C1T11',
  'word_te-rog': 'C1T12',
  word_multumesc: 'C1T12',
  'word_cu-placere': 'C1T12',
  word_scuze: 'C1T12',
  word_da: 'C8T01',
  word_nu: 'C8T01',
  greeting_salut: 'C1T11',
  greeting_buna: 'C1T11',
  greeting_ceao: 'C1T11',
  'greeting_buna-dimineata': 'C1T11',
  'greeting_buna-ziua': 'C1T11',
  'greeting_buna-seara': 'C1T11',
  'greeting_noapte-buna': 'C1T11',
  'greeting_pe-curand': 'C1T11',
  'greeting_la-revedere': 'C1T11',
  'greeting_sa-fii-sanatos': 'C1T11',
  'greeting_noroc-bun': 'C1T11',
  'greeting_sa-auzim-de-bine': 'C1T11',
  'greeting_sa-ne-vedem-sanatosi': 'C1T11',
  'greeting_noapte-buna-2': 'C1T11',
  'greeting_adio-si-noroc': 'C1T11'
}

/** Romanian alphabet id-pattern rules (no audio → attribute by id). */
const RO_DIGRAPHS = /^letter_(ce-ci|ge-gi|che-chi|ghe-ghi)$/
const RO_VOWEL_COMBO = /^letter_(ea|oa|ia|ie|io|iu|ua|ue|ai|ei|oi|ui|au|eu|eai|iai|eau|iau|ioa)$/

/* ── archive parsing (linear h3 → data-audio walk) ─────────────────────── */

const slugCache = new Map() // `${lang}:${page}` → Map<sectionId, string[]>

/** Audio slugs per <h3> section id for one archive page, in page order. */
export function sectionSlugs(lang, page) {
  const key = `${lang}:${page}`
  if (slugCache.has(key)) return slugCache.get(key)
  const out = new Map()
  let current = null
  for (const m of readArchive(lang, page).matchAll(
    /<h3[^>]*id="([^"]+)"[^>]*>|data-audio="[^"]*\/([^/"]+)\.mp3"/g
  )) {
    if (m[1] !== undefined) {
      current = m[1]
      if (!out.has(current)) out.set(current, [])
    } else if (current) {
      out.get(current).push(m[2])
    }
  }
  slugCache.set(key, out)
  return out
}

/** slug → section id for one page (first occurrence wins). */
function slugToSection(lang, page) {
  const out = new Map()
  for (const [section, slugs] of sectionSlugs(lang, page)) {
    for (const slug of slugs) if (!out.has(slug)) out.set(slug, section)
  }
  return out
}

/** Effective topic map: the committed topic-map.json when present, else builtin. */
export function loadMap() {
  try {
    return readJson(MAP_FILE).map
  } catch {
    return BUILTIN_MAP
  }
}

/** The sidebar topic code for one entity, or null when unattributable. */
export function attribute(entity) {

  const underscore = entity.id.indexOf('_')
  const page = PAGE_BY_PREFIX[entity.id.slice(0, underscore)]
  if (!page) return null
  const map = loadMap()[entity.lang] ?? {}

  // Alphabet: id-pattern rules (ro) or the whole page (en).
  if (page === 'alphabet') {
    const section =
      entity.lang !== 'ro'
        ? '*'
        : RO_DIGRAPHS.test(entity.id)
          ? 'digraphs'
          : RO_VOWEL_COMBO.test(entity.id)
            ? 'diphthongs'
            : 'romanian-alphabet'
    const topic = map.alphabet?.[section] ?? map.alphabet?.['*'] ?? null
    return topic ? { topic, page, section } : null
  }

  // Term-level overrides (greetings/courtesy words, answers).
  if (TERM_OVERRIDES[entity.id]) {
    return { topic: TERM_OVERRIDES[entity.id], page, section: `override:${page}` }
  }

  // Audio-slug attribution: the entity id is `${prefix}_${pageSlug}` (extract-
  // legacy derived it from the row's data-audio slug), so the page slug is the
  // id minus the prefix, minus any `-N` dedup suffix.
  const slug = entity.id.slice(underscore + 1).replace(/-\d+$/, '')
  const section = slugToSection(entity.lang, page).get(slug) ?? null
  if (!section) return null
  const topic = map[page]?.[section] ?? null
  return topic ? { topic, page, section } : null
}

/** Every legacy entity attributed: Map<id, {topic, page, section, order, entity}>. */
export function attributeAll() {
  const out = new Map()
  let order = 0
  for (const file of readdirSync(ENTITIES).filter((f) => f.endsWith('.json')).sort()) {
    for (const entity of readJson(join(ENTITIES, file))) {
      const at = attribute(entity)
      if (at) out.set(entity.id, { ...at, order: order++, entity })
    }
  }
  return out
}

/* ── CLI ───────────────────────────────────────────────────────────────── */

function main() {
  const sidebar = readJson(SIDEBAR_FILE)
  const knownTopics = new Set(sidebar.sections.flatMap((c) => c.topics.map((t) => t.code)))

  // Coverage: every entity must attribute; every mapped topic must exist.
  const attribution = attributeAll()
  let total = 0
  const unattributed = []
  for (const file of readdirSync(ENTITIES).filter((f) => f.endsWith('.json')).sort()) {
    for (const entity of readJson(join(ENTITIES, file))) {
      total++
      if (!attribution.has(entity.id)) unattributed.push(entity.id)
    }
  }
  for (const lang of Object.keys(loadMap())) {
    for (const [page, sections] of Object.entries(loadMap()[lang])) {
      for (const topic of Object.values(sections)) {
        if (!knownTopics.has(topic)) console.error(`ERROR: topic-map ${lang}/${page} → unknown topic '${topic}'`)
      }
    }
  }

  // Per-topic distribution report.
  const perTopic = new Map()
  for (const { topic } of attribution.values()) perTopic.set(topic, (perTopic.get(topic) ?? 0) + 1)
  console.log(`archive-topics: ${total} entities · ${attribution.size} attributed · ${unattributed.length} unattributed`)
  const populated = [...perTopic.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  for (const [topic, n] of populated) console.log(`  ${topic}  ${String(n).padStart(3)}`)

  // Emit the committed topic map (hand-tunable; the script prefers it when present).
  writeFileSync(
    MAP_FILE,
    JSON.stringify({ generated: new Date().toISOString(), map: BUILTIN_MAP, planned: PLANNED_SOURCES }, null, 2) + '\n'
  )
  console.log(`topic map → ${MAP_FILE.replace(ROOT, '')}`)

  if (unattributed.length) {
    console.error(`ERROR: unattributed entities: ${unattributed.join(', ')}`)
    process.exit(1)
  }
}
const PLANNED_SOURCES = {
  'C2T01': ['romanian/data/pronouns.json'],
  'C2T02': ['romanian/data/nouns.json', 'english/data/nouns.json'],
  'C2T07': ['romanian/data/adjectives.json'],
  'C2T10': ['romanian/data/family-friends.json'],
  'C3T01': ['english/data/vocab.json'],
  'C5T01': ['romanian/data/prepositions.json'],
  'C5T11': ['romanian/data/travel-city.json', 'romanian/data/culture-customs.json'],
  'C7T04': ['romanian/data/work-study.json'],
  'C7T05': ['english/data/meetings.json'],
  'C7T10': ['english/data/docs.json'],
  'C6T12': ['english/data/issues.json'],
  'C8T07': ['english/data/sentences.json'],
  'C8T08': ['english/data/tenses.json'],
  'C8T09': ['english/data/phrases.json'],
  'C8T01': ['english/data/questions.json'],
  'C7T08': ['english/data/technical.json'],
  'C1T11': ['romanian/data/daily-dialog.json']
}

// CLI only — importing this module (media-manifests) must stay side-effect free.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
