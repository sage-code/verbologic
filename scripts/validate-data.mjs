#!/usr/bin/env node
/**
 * validate-data.mjs — maintenance integrity checks over the decoupled data:
 *   - every entity: unique id, valid type/lang, well-formed audio URL (or null)
 *   - every menu route resolves to a page file (manual best-effort)
 *   - menu labels complete for every supported language
 *   - flags present on all 9 interface languages
 * Exits non-zero on any failure (used by `run release` / `run validate`).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ERRORS = []
const WARNINGS = []

const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf-8'))

/* ── entities ─────────────────────────────────────────────────────────── */
const entities = []
const sawId = new Set()
let withAudio = 0
let ttsQueue = 0

for (const file of [
  'ro_vocabulary.json', 'ro_questions.json', 'ro_imperative.json',
  'ro_sentences.json', 'ro_greetings.json', 'ro_alphabet.json', 'en_alphabet.json'
]) {
  const list = readJson(`public/data/entities/${file}`)
  for (const e of list) {
    entities.push(e)
    if (sawId.has(e.id)) ERRORS.push(`duplicate entity id: ${e.id}`)
    sawId.add(e.id)
    if (!e.id || !e.term) ERRORS.push(`entity missing id/term in ${file}`)
    if (!['word', 'sentence', 'question', 'imperative', 'letter', 'greeting'].includes(e.type)) {
      ERRORS.push(`bad type '${e.type}' on ${e.id}`)
    }
    if (!['ro', 'en'].includes(e.lang)) ERRORS.push(`bad lang '${e.lang}' on ${e.id}`)

    if (e.audio === null) ttsQueue++
    else if (typeof e.audio === 'string') {
      withAudio++
      if (!e.audio.startsWith('https://media.verbologic.com/audio/')) {
        ERRORS.push(`bad audio URL on ${e.id}: ${e.audio}`)
      }
      if (!e.audio.endsWith('.mp3')) ERRORS.push(`non-mp3 audio on ${e.id}`)
    } else ERRORS.push(`audio must be string|null on ${e.id}`)
  }
}

/* ── navigation ───────────────────────────────────────────────────────── */
const nav = readJson('src/data/navigation.json')
const langCount = nav.languages.length
const menuIds = nav.menu.map((m) => m.id)

const KNOWN_FLAGS = ['us', 'ro', 'de', 'ru', 'it', 'es', 'fr', 'hu', 'pt']
const KNOWN_BRANDS = ['bluesky', 'discord', 'youtube', 'reddit']
/** Menu icon slugs — each must map to a component in AppNav.vue `ICONS`. */
const KNOWN_MENU_ICONS = ['academic-cap', 'building-library', 'microphone']

if (langCount !== 9) ERRORS.push(`expected 9 languages, got ${langCount}`)
for (const l of nav.languages) {
  if (!l.flag || !l.code || !l.locale) ERRORS.push(`language entry incomplete: ${JSON.stringify(l)}`)
  if (!KNOWN_FLAGS.includes(l.flag)) ERRORS.push(`language '${l.code}' has unknown flag code '${l.flag}' (expected one of ${KNOWN_FLAGS.join(', ')})`)
}
for (const m of nav.menu) {
  if (!KNOWN_MENU_ICONS.includes(m.icon)) {
    ERRORS.push(`menu '${m.id}' has unknown icon slug '${m.icon}' (expected one of ${KNOWN_MENU_ICONS.join(', ')})`)
  }
}
for (const s of nav.social) {
  if (!KNOWN_BRANDS.includes(s.icon)) ERRORS.push(`social '${s.id}' has unknown brand icon '${s.icon}' (expected one of ${KNOWN_BRANDS.join(', ')})`)
}
for (const lang of Object.keys(nav.menuLabels)) {
  const missing = menuIds.filter((id) => !nav.menuLabels[lang][id])
  if (missing.length) ERRORS.push(`menuLabels.${lang} missing: ${missing.join(', ')}`)
}

/* ── locales ──────────────────────────────────────────────────────────── */
try {
  readJson('public/data/locales/en.json')
  readJson('public/data/locales/ro.json')
} catch {
  ERRORS.push('missing base locale files (en.json / ro.json)')
}

/* ── language names (localized display-name matrix) ───────────────────── */
try {
  const matrix = readJson('src/data/language-names.json')
  const localeCodes = nav.languages.map((l) => l.locale)
  const expected = [...localeCodes].sort()
  const uiLocales = Object.keys(matrix).sort()
  if (JSON.stringify(uiLocales) !== JSON.stringify(expected)) {
    ERRORS.push(`language-names.json: UI locales [${uiLocales.join(', ')}] != navigation.json locales [${expected.join(', ')}]`)
  }
  for (const [ui, block] of Object.entries(matrix)) {
    for (const target of localeCodes) {
      const name = block[target]
      if (typeof name !== 'string' || !name.trim()) {
        ERRORS.push(`language-names.json: missing name for '${target}' in UI locale '${ui}'`)
      }
    }
    for (const extra of Object.keys(block)) {
      if (!localeCodes.includes(extra)) WARNINGS.push(`language-names.json: unknown target code '${extra}' in UI locale '${ui}'`)
    }
  }
  console.log(`language-names: ${uiLocales.length} UI locales × ${localeCodes.length} languages`)
} catch (e) {
  ERRORS.push(`language-names.json (src/data/) missing or unparseable: ${e.message}`)
}

/* ── prices ───────────────────────────────────────────────────────────── */
try {
  const prices = readJson('public/data/prices.json')
  const knownLocales = new Set(nav.languages.map((l) => l.locale))
  if (!Array.isArray(prices.tiers) || prices.tiers.length === 0) {
    ERRORS.push('prices.json: missing/empty tiers array')
  }
  const seenTier = new Set()
  for (const tier of prices.tiers ?? []) {
    if (!tier.id || !tier.name) ERRORS.push(`prices.json tier missing id/name: ${JSON.stringify(tier)}`)
    if (seenTier.has(tier.id)) ERRORS.push(`prices.json duplicate tier id: ${tier.id}`)
    seenTier.add(tier.id)
    if (typeof tier.price !== 'number' || tier.price < 0) {
      ERRORS.push(`prices.json tier '${tier.id}' has invalid price`)
    }
    for (const [locale, price] of Object.entries(tier.perLanguage ?? {})) {
      if (!knownLocales.has(locale)) ERRORS.push(`prices.json tier '${tier.id}': unknown language '${locale}'`)
      if (typeof price !== 'number' || price < 0) {
        ERRORS.push(`prices.json tier '${tier.id}': bad price for '${locale}'`)
      }
    }
  }
  console.log(`prices: ${prices.tiers?.length ?? 0} tiers · currency ${prices.currency ?? '?'}`)
} catch (e) {
  ERRORS.push(`prices.json missing or unparseable: ${e.message}`)
}

/* ── media: sidebars ↔ config ↔ manifests ↔ legacy bridge ─────────────── */
try {
  const config = readJson('src/data/media.config.json')
  const SECTION_PATHS = new Set(Object.values(config.sections ?? {}))
  const localeCodesAll = nav.languages.map((l) => l.locale)

  // ROOT-relative, forward-slash (mirrors media-index.mjs' rel()).
  const rel = (p) => p.slice(ROOT.length).replaceAll('\\', '/').replace(/^\//, '')

  const walkFiles = (dir, ext) =>
    existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
          const p = join(dir, e.name)
          return e.isDirectory() ? walkFiles(p, ext) : e.name.endsWith(ext) ? [p] : []
        })
      : []

  // Manifests (media/**.json), keyed by id.
  const manifestIds = new Set()
  for (const file of walkFiles('media', '.json')) {
    const relPath = rel(file).replace(/^media\//, '')
    const manifest = readJson(file)
    if (!manifest.id) continue // non-manifest JSON (none expected)
    manifestIds.add(manifest.id)
    if (!manifest.lang || !localeCodesAll.includes(manifest.lang)) {
      ERRORS.push(`media manifest ${relPath}: bad lang '${manifest.lang}'`)
    }
    if (!manifest.term || !manifest.names?.[manifest.lang]) {
      ERRORS.push(`media manifest ${relPath}: missing term/names[${manifest.lang}]`)
    }
    const key = manifest.key ?? manifest.file
    if (!key) {
      // Pending manifests (status 'pending') legitimately have no key yet —
      // the media file has not been produced/uploaded (TTS queue).
      if (manifest.status !== 'pending') ERRORS.push(`media manifest ${relPath}: missing key/file`)
    } else if (!SECTION_PATHS.has(key.split('/')[0] + '/')) {
      ERRORS.push(`media manifest ${relPath}: key '${key}' outside every configured section path`)
    }
  }

  // Sidebars: structure + item resolution (manifest or legacy entity).
  const entities = new Set()
  for (const file of walkFiles('public/data/entities', '.json')) {
    for (const entity of readJson(file)) entities.add(entity.id)
  }

  const sidebarFiles = walkFiles('src/data/sidebars', '.json').filter((f) => f.endsWith('sidebar.json'))
  const seenSections = new Set()
  let itemCount = 0
  for (const file of sidebarFiles) {
    const sidebar = readJson(file)
    if (seenSections.has(sidebar.id)) ERRORS.push(`duplicate sidebar id: ${sidebar.id}`)
    seenSections.add(sidebar.id)
    if (!config.sections?.[sidebar.id]) ERRORS.push(`config.sections missing '${sidebar.id}'`)
    if (!sidebar.names?.en?.trim()) ERRORS.push(`sidebar ${sidebar.id}: missing names.en`)
    for (const section of sidebar.sections ?? []) {
      if (!section.names?.en?.trim()) ERRORS.push(`sidebar ${sidebar.id} · ${section.code}: missing names.en`)
      for (const topic of section.topics ?? []) {
        if (!topic.names?.en?.trim()) ERRORS.push(`sidebar ${sidebar.id} · ${topic.code}: missing names.en`)
        for (const id of topic.items ?? []) {
          itemCount++
          if (!manifestIds.has(id) && !entities.has(id)) {
            ERRORS.push(`sidebar ${sidebar.id} · ${topic.code}: item '${id}' has no manifest and no legacy entity`)
          }
        }
      }
    }
  }
  for (const sectionId of Object.keys(config.sections ?? {})) {
    if (!seenSections.has(sectionId)) ERRORS.push(`config.sections has no sidebar for '${sectionId}'`)
  }
  console.log(`media: ${sidebarFiles.length} sidebars · ${itemCount} items · ${manifestIds.size} manifests · config root ${config.root}`)
} catch (e) {
  ERRORS.push(`media model missing or unparseable: ${e.message}`)
}

/* ── content: lectures/stories front matter ↔ sidebars ↔ manifests ─────── */
try {
  const { default: grayMatter } = await import('gray-matter')
  const LOCALES = ['en', 'ro', 'de', 'ru', 'it', 'es', 'fr', 'hu', 'pt']
  const CANONICAL_BY_TRACK = { lectures: 'en' } // stories: the track language
  const contentDir = join(ROOT, 'content')

  const walkContent = (dir, parts) =>
    existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
          const next = [...parts, e.name]
          return e.isDirectory() ? walkContent(join(dir, e.name), next) : e.name.endsWith('.md') ? [next] : []
        })
      : []

  // Manifest ids (media/**.json) — content media (the video) must resolve here.
  const mediaManifestIds = new Set()
  const walkManifestFiles = (dir) =>
    existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory() ? walkManifestFiles(join(dir, e.name)) : e.name.endsWith('.json') ? [join(dir, e.name)] : []
        )
      : []
  for (const file of walkManifestFiles(join(ROOT, 'media'))) {
    const manifest = JSON.parse(readFileSync(file, 'utf-8'))
    if (manifest.id) mediaManifestIds.add(manifest.id)
  }

  const pins = existsSync(join(ROOT, 'src/data/sidebars/library/dictionary/pins.json'))
    ? readJson('src/data/sidebars/library/dictionary/pins.json')
    : {}
  const sidebarBySection = {}
  for (const file of walkManifestFiles(join(ROOT, 'src/data/sidebars')).filter((f) => f.endsWith('sidebar.json'))) {
    const doc = JSON.parse(readFileSync(file, 'utf-8'))
    sidebarBySection[doc.id] = doc
  }

  const docsByLecture = new Map() // id → { track, trackLang, topic, docs: Map<locale, data> }
  const contentFiles = walkContent(contentDir, [])
  for (const parts of contentFiles) {
    const relPath = `content/${parts.join('/')}`
    // <lectures|stories>/<trackLang>/<TOPIC>/<id>/<locale>.md
    if (parts.length !== 5) {
      ERRORS.push(`content ${relPath}: must live at <track>/<trackLang>/<TOPIC>/<id>/<locale>.md`)
      continue
    }
    const [track, trackLang, topic, id, docName] = parts
    const locale = docName.replace(/\.md$/, '')
    const { data } = grayMatter(readFileSync(join(contentDir, ...parts), 'utf8'))
    if (!LOCALES.includes(locale)) ERRORS.push(`content ${relPath}: bad doc locale '${locale}'`)
    if (!data.title) ERRORS.push(`content ${relPath}: missing title`)
    for (const [field, expected] of [
      ['track', track],
      ['trackLang', trackLang],
      ['topic', topic],
      ['article', id],
      ['locale', locale]
    ]) {
      if (data[field] !== expected) ERRORS.push(`content ${relPath}: front-matter ${field} '${data[field]}' != path '${expected}'`)
    }
    if (data.status && !['draft', 'reviewed'].includes(data.status)) {
      ERRORS.push(`content ${relPath}: bad status '${data.status}'`)
    }
    const group = docsByLecture.get(id) ?? { track, trackLang, topic, docs: new Map() }
    group.docs.set(locale, data)
    docsByLecture.set(id, group)
  }

  for (const [id, group] of docsByLecture) {
    const canonicalLocale = CANONICAL_BY_TRACK[group.track] ?? group.trackLang
    if (!group.docs.has(canonicalLocale)) {
      ERRORS.push(`content '${id}': no canonical '${canonicalLocale}' document`)
    }
    // The content docs must be reachable: the id is a sidebar item of its topic.
    const section = `library/${group.track}`
    const sidebar = sidebarBySection[section]
    const topicEntry = sidebar?.sections.flatMap((s) => s.topics).find((t) => t.code === group.topic)
    if (!topicEntry) ERRORS.push(`content '${id}': topic '${group.topic}' missing in ${section}`)
    else if (!topicEntry.items.includes(id)) ERRORS.push(`content '${id}': not an item of ${section} · ${group.topic}`)
    // Manifests for content media (the video) are validated by the media pass (manifestIds).
  }

  // ── topic layouts — ONE topic, ONE layout kind (the pane is picked by the
  // topic's `layout` field, never by the track). Per-kind item invariants:
  //   table   → non-image records only, never a content doc
  //   article → content docs only (prose-only is fine), never a media manifest
  //   gallery → image manifests only
  const TOPIC_LAYOUTS = ['table', 'article', 'gallery']
  const mimeById = new Map() // manifest id → mime
  for (const file of walkManifestFiles(join(ROOT, 'media'))) {
    const manifest = JSON.parse(readFileSync(file, 'utf-8'))
    if (manifest.id && manifest.mime) mimeById.set(manifest.id, manifest.mime)
  }
  const entityIdSet = new Set()
  for (const file of walkManifestFiles(join(ROOT, 'public/data/entities'))) {
    const list = JSON.parse(readFileSync(file, 'utf-8'))
    if (Array.isArray(list)) for (const entity of list) if (entity.id) entityIdSet.add(entity.id)
  }
  let layoutCount = 0
  const layoutTotals = {}
  for (const sidebar of Object.values(sidebarBySection)) {
    for (const section of sidebar.sections ?? []) {
      for (const topic of section.topics ?? []) {
        const layout = topic.layout
        if (!TOPIC_LAYOUTS.includes(layout)) {
          ERRORS.push(`sidebar ${sidebar.id} · ${topic.code}: bad/missing layout '${layout}' (expected one of ${TOPIC_LAYOUTS.join(', ')})`)
          continue
        }
        layoutCount++
        layoutTotals[layout] = (layoutTotals[layout] ?? 0) + 1
        for (const id of topic.items ?? []) {
          const isDoc = docsByLecture.has(id)
          if (layout === 'article') {
            if (!isDoc) ERRORS.push(`sidebar ${sidebar.id} · ${topic.code}: article topic holds non-doc item '${id}'`)
            else if (mediaManifestIds.has(id) && !(mimeById.get(id) ?? '').startsWith('video/')) {
              ERRORS.push(`sidebar ${sidebar.id} · ${topic.code}: article item '${id}' has a non-video manifest — articles are prose-only (a video manifest is allowed)`)
            }
          } else if (isDoc) {
            ERRORS.push(`sidebar ${sidebar.id} · ${topic.code}: ${layout} topic holds content doc '${id}' — move it to an article topic`)
          } else if (layout === 'gallery' && !(mimeById.get(id) ?? '').startsWith('image/')) {
            ERRORS.push(`sidebar ${sidebar.id} · ${topic.code}: gallery item '${id}' has no image manifest`)
          } else if (layout === 'table' && (mimeById.get(id) ?? '').startsWith('image/')) {
            ERRORS.push(`sidebar ${sidebar.id} · ${topic.code}: table topic holds image item '${id}' — make it a gallery topic`)
          } else if (layout === 'table' && !entityIdSet.has(id) && !mediaManifestIds.has(id)) {
            ERRORS.push(`sidebar ${sidebar.id} · ${topic.code}: table item '${id}' has no manifest and no legacy entity`)
          }
        }
      }
    }
  }
  console.log(`layouts: ${layoutCount} topics — ${Object.entries(layoutTotals).map(([k, v]) => `${k} ${v}`).join(' · ')}`)

  // Pins: every pinned id must live in its pinned sidebar topic, and resolve to a manifest.
  for (const [id, pin] of Object.entries(pins)) {
    const sidebar = sidebarBySection[pin.section]
    const topicEntry = sidebar?.sections.flatMap((s) => s.topics).find((t) => t.code === pin.topic)
    if (!topicEntry) ERRORS.push(`pin '${id}': topic '${pin.topic}' missing in ${pin.section}`)
    else if (!topicEntry.items.includes(id)) ERRORS.push(`pin '${id}': not an item of ${pin.section} · ${pin.topic}`)
    if (!mediaManifestIds.has(id)) ERRORS.push(`pin '${id}': no manifest`)
  }
  console.log(
    `content: ${contentFiles.length} doc(s) in ${docsByLecture.size} lecture(s) · ${Object.keys(pins).length} pinned id(s)`
  )
} catch (e) {
  ERRORS.push(`content model missing or unparseable: ${e.message}`)
}

/* ── report ───────────────────────────────────────────────────────────── */
console.log(`entities: ${entities.length} (audio: ${withAudio}, TTS queue: ${ttsQueue})`)
console.log(`languages: ${langCount} · menu items: ${menuIds.length}`)
for (const w of WARNINGS) console.warn(`warn: ${w}`)
if (ERRORS.length) {
  for (const e of ERRORS) console.error(`ERROR: ${e}`)
  console.error(`validate-data FAILED (${ERRORS.length} errors)`)
  process.exit(1)
}
console.log('validate-data OK ✓')
