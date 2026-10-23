#!/usr/bin/env node
/**
 * perf-baseline.mjs — record and compare the numbers the refactor is judged by
 * (planning/performance-and-content-refactor.md §3 phase 0, §12).
 *
 *   node scripts/perf-baseline.mjs snapshot [--tag v0] [--build]
 *       writes planning/baseline/baseline-<tag>.json (metrics) and
 *               planning/baseline/golden-<tag>.json (per topic × language row hashes)
 *       --build also runs a forced `nuxt generate` and records its wall time
 *   node scripts/perf-baseline.mjs compare [--tag v0]
 *       re-reads the current payloads and reports any golden difference
 *
 * Metrics: payload size (raw / gzip / brotli) by group, article route counts
 * (same enumeration as nuxt.config.ts), content and media file counts, the
 * last .output file count, and JSON.parse cost of the dictionary search index.
 *
 * Golden rows hash only SEMANTIC fields (id, term, names, ipa, urls, …) so
 * later phases may drop sha1/bytes/mime/section/source without a false alarm.
 * The full pre-change payloads are in git at the commit recorded in the file,
 * so a mismatch can be diffed against `git show <commit>:<path>`.
 */
import { createHash } from 'node:crypto'
import { spawnSync, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, gzipSync } from 'node:zlib'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT_DIR = join(ROOT, 'planning', 'baseline')
const DATA = join(ROOT, 'public', 'data')
const MEDIA_PAYLOADS = join(DATA, 'media')

const [command = 'snapshot', ...rest] = process.argv.slice(2)
const arg = (name, fallback) => {
  const at = rest.indexOf(name)
  return at > -1 ? rest[at + 1] : fallback
}
const tag = arg('--tag', 'v0')

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const posix = (p) => p.replaceAll('\\', '/')
const walk = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
      )
    : []
const sha1 = (s) => createHash('sha1').update(s).digest('hex')
const mb = (n) => Math.round((n / 1e6) * 1000) / 1000

/* ── metrics ───────────────────────────────────────────────────────────── */

function payloadMetrics() {
  const groups = {}
  const biggest = []
  for (const file of walk(DATA)) {
    const rel = posix(relative(DATA, file))
    const group = rel.startsWith('media/')
      ? rel.endsWith('search.json')
        ? 'media/search'
        : rel.endsWith('titles.json')
          ? 'media/titles'
          : rel === 'media/index.json'
            ? 'media/index'
            : 'media/topics'
      : rel.split('/')[0]
    const buf = readFileSync(file)
    const g = (groups[group] ??= { files: 0, raw: 0, gzip: 0, brotli: 0 })
    g.files++
    g.raw += buf.length
    g.gzip += gzipSync(buf).length
    g.brotli += brotliCompressSync(buf).length
    biggest.push([rel, buf.length])
  }
  biggest.sort((a, b) => b[1] - a[1])
  return { groups, biggest: biggest.slice(0, 8).map(([path, bytes]) => ({ path, bytes })) }
}

/** Same enumeration as nuxt.config.ts `contentDocRoutes` (kept in sync by hand until phase 2 shares it). */
function routeMetrics() {
  const navigation = readJson(join(ROOT, 'src', 'data', 'navigation.json'))
  const allLangs = navigation.languages.map((l) => l.locale)
  const sidebar = readJson(join(ROOT, 'src', 'data', 'sidebars', 'library', 'lectures', 'sidebar.json'))
  const scopes = new Map()
  for (const section of sidebar.sections ?? [])
    for (const topic of section.topics ?? [])
      scopes.set(
        topic.code,
        topic.sourceLang ? [topic.sourceLang] : Array.isArray(topic.langs) && topic.langs.length ? topic.langs : allLangs
      )
  const byTrack = { dictionary: 0, lectures: 0, stories: 0, legacyStories: 0 }
  const docsByTrack = { dictionary: 0, lectures: 0, stories: 0, legacyStories: 0 }
  const root = join(ROOT, 'content')
  for (const file of walk(root).filter((f) => f.endsWith('.md'))) {
    const parts = posix(relative(root, file)).split('/')
    if (parts.length === 1) continue // README
    if (parts.length === 4 && ['dictionary', 'lectures', 'stories'].includes(parts[0])) {
      const [track, topic] = parts
      const n = track === 'lectures' ? (scopes.get(topic) ?? allLangs).length : allLangs.length
      byTrack[track] += n
      docsByTrack[track]++
    } else if (parts.length === 5) {
      byTrack.legacyStories++
      docsByTrack.legacyStories++
    }
  }
  const trackPages = allLangs.length * 3
  // Phonetic articles have no Markdown — they render from the alphabet data
  // (phase 3), so their routes are counted from the same source nuxt.config.ts
  // enumerates: the topic's items, in the topic's owning language, per locale.
  const alphabets = join(ROOT, 'src', 'data', 'alphabets')
  let phoneticRoutes = 0
  let phoneticDocs = 0
  if (existsSync(alphabets)) {
    for (const section of sidebar.sections ?? []) {
      for (const topic of section.topics ?? []) {
        if (topic.phonetic !== true || !topic.sourceLang) continue
        const file = join(alphabets, `${topic.sourceLang}.json`)
        if (!existsSync(file)) continue
        const data = readJson(file)
        const codes = new Set(
          [...(data.letters ?? []), ...(data.groups ?? [])].map((entry) => entry.code)
        )
        const owned = (topic.items ?? []).filter((code) => codes.has(code))
        phoneticRoutes += owned.length * allLangs.length
        phoneticDocs += owned.length
      }
    }
    byTrack.lectures += phoneticRoutes
    docsByTrack.lectures += phoneticDocs
  }
  return {
    languages: allLangs.length,
    trackPages,
    articleRoutes: Object.values(byTrack).reduce((a, b) => a + b, 0),
    articleRoutesByTrack: byTrack,
    mdDocsByTrack: docsByTrack,
    phoneticRoutes,
    // Nitro's own "Prerendered N routes" counter counts a page AND its
    // _payload.json as two routes. These are the real page counts.
    note: 'articleRoutes counts PAGES; a build emits ~2 files per page while experimental.payloadExtraction is on'
  }
}

function fileCounts() {
  const count = (dir, test = () => true) => {
    const files = walk(dir).filter(test)
    return { files: files.length, bytes: files.reduce((n, f) => n + statSync(f).size, 0) }
  }
  const media = join(ROOT, 'media')
  const ext = {}
  for (const f of walk(media)) {
    const e = f.split('.').pop().toLowerCase()
    const x = (ext[e] ??= { files: 0, bytes: 0 })
    x.files++
    x.bytes += statSync(f).size
  }
  const output = join(ROOT, '.output', 'public')
  return {
    contentMd: count(join(ROOT, 'content'), (f) => f.endsWith('.md')),
    mediaByExtension: ext,
    sidebarsJson: count(join(ROOT, 'src', 'data', 'sidebars')),
    alphabetsJson: count(join(ROOT, 'src', 'data', 'alphabets')),
    output: existsSync(output)
      ? { ...count(output), builtAt: statSync(output).mtime.toISOString(), note: 'last build on disk, not re-run by snapshot' }
      : null
  }
}

function parseCost() {
  const file = join(MEDIA_PAYLOADS, 'library', 'dictionary', 'search.json')
  if (!existsSync(file)) return null
  const text = readFileSync(file, 'utf8')
  const times = []
  let records = 0
  for (let i = 0; i < 5; i++) {
    const t0 = process.hrtime.bigint()
    records = JSON.parse(text).records.length
    times.push(Number(process.hrtime.bigint() - t0) / 1e6)
  }
  times.sort((a, b) => a - b)
  return { file: 'media/library/dictionary/search.json', records, parseMsMedian: Math.round(times[2] * 10) / 10 }
}

/* ── golden rows ───────────────────────────────────────────────────────── */

/** Semantic projection of one topic record — stable across payload slimming. */
function semantic(r) {
  return {
    id: r.id,
    entity_id: r.entity_id,
    topic: r.topic,
    lang: r.lang,
    kind: r.kind ?? null,
    term: r.term,
    names: Object.fromEntries(Object.entries(r.names ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))),
    description: r.description ?? null,
    ipa: r.ipa ?? null,
    context: r.context ?? null,
    example: r.example ?? null,
    tags: [...(r.tags ?? [])].sort(),
    url: r.media?.url ?? null,
    read: r.read?.url ?? null,
    related: (r.related ?? []).map((x) => x.entity_id).sort(),
    canonical: r.content?.canonical ?? null,
    summary: r.content?.summary ?? null,
    order: r.content?.order ?? null,
    video: r.content?.video ?? null
  }
}

function goldenSnapshot() {
  const topics = {}
  const entityIds = new Set()
  for (const file of walk(join(MEDIA_PAYLOADS, 'library'))) {
    const rel = posix(relative(MEDIA_PAYLOADS, file))
    if (rel.endsWith('search.json') || rel.endsWith('titles.json')) continue
    const records = readJson(file)
    const byLang = new Map()
    for (const r of records) {
      entityIds.add(r.entity_id)
      if (!byLang.has(r.lang)) byLang.set(r.lang, [])
      byLang.get(r.lang).push(semantic(r))
    }
    for (const [lang, rows] of byLang) {
      topics[`${rel.replace(/\.json$/, '')}#${lang}`] = {
        rows: rows.length,
        hash: sha1(JSON.stringify(rows)) // order matters: it is the teaching order
      }
    }
  }
  const searchHashes = {}
  for (const file of walk(join(MEDIA_PAYLOADS, 'library')).filter((f) => f.endsWith('search.json'))) {
    const { records } = readJson(file)
    const rows = records.map((r) => ({
      id: r.id,
      entity_id: r.entity_id,
      topic: r.topic,
      lang: r.lang,
      term: r.term,
      names: Object.fromEntries(Object.entries(r.names ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))),
      ipa: r.ipa ?? null,
      url: r.media?.url ?? null
    }))
    searchHashes[posix(relative(MEDIA_PAYLOADS, file))] = { rows: rows.length, hash: sha1(JSON.stringify(rows)) }
  }
  const index = readJson(join(MEDIA_PAYLOADS, 'index.json'))
  return {
    topics,
    search: searchHashes,
    entityIds: { count: entityIds.size, hash: sha1([...entityIds].sort().join('\n')) },
    indexCounts: sha1(JSON.stringify(index.counts)),
    indexProgressAliases: sha1(JSON.stringify(index.progressAliases ?? {}))
  }
}

/* ── commands ──────────────────────────────────────────────────────────── */

const gitHead = () => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}
const gitDirty = () => {
  try {
    return execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim().length > 0
  } catch {
    return null
  }
}

function snapshot() {
  mkdirSync(OUT_DIR, { recursive: true })
  const payload = payloadMetrics()
  const routes = routeMetrics()
  const files = fileCounts()
  const dictionaryUnits = readJson(join(ROOT, 'src', 'data', 'sidebars', 'library', 'dictionary', 'sidebar.json'))
    .sections.flatMap((s) => s.topics)
    .reduce((n, t) => n + t.items.length, 0)

  const baseline = {
    tag,
    commit: gitHead(),
    dirtyTree: gitDirty(),
    recordedAt: new Date().toISOString(),
    node: process.version,
    payloads: {
      totalMB: mb(Object.values(payload.groups).reduce((n, g) => n + g.raw, 0)),
      groups: Object.fromEntries(
        Object.entries(payload.groups).map(([k, g]) => [
          k,
          { files: g.files, rawMB: mb(g.raw), gzipMB: mb(g.gzip), brotliMB: mb(g.brotli) }
        ])
      ),
      biggest: payload.biggest
    },
    routes,
    projection: {
      dictionaryPlannedUnits: dictionaryUnits,
      fullDictionaryArticleRoutes: dictionaryUnits * routes.languages * routes.languages,
      freePlanFileLimit: 20000
    },
    files,
    parse: parseCost(),
    build: null,
    ttfb: 'not measured — static preview server is not representative; measured in stage C on Workers'
  }

  if (rest.includes('--build')) {
    console.log('running forced build (this takes a while)…')
    const t0 = Date.now()
    // Through the project runner (prepare + generate + fingerprint), as CLAUDE.md requires.
    const r = spawnSync('bash', ['./run.sh', 'build', '--force'], { cwd: ROOT, stdio: 'inherit' })
    const output = join(ROOT, '.output', 'public')
    baseline.build = {
      command: './run.sh build --force',
      seconds: Math.round((Date.now() - t0) / 1000),
      exitCode: r.status,
      outputFiles: existsSync(output) ? walk(output).length : null
    }
    baseline.files = fileCounts()
  }

  const golden = { tag, commit: baseline.commit, ...goldenSnapshot() }
  writeFileSync(join(OUT_DIR, `baseline-${tag}.json`), JSON.stringify(baseline, null, 2) + '\n')
  writeFileSync(join(OUT_DIR, `golden-${tag}.json`), JSON.stringify(golden, null, 1) + '\n')

  console.log(`baseline-${tag}.json  commit ${baseline.commit}${baseline.dirtyTree ? ' (DIRTY TREE)' : ''}`)
  console.log(`  payloads: ${baseline.payloads.totalMB} MB raw in ${Object.values(baseline.payloads.groups).reduce((n, g) => n + g.files, 0)} files`)
  for (const [k, g] of Object.entries(baseline.payloads.groups))
    console.log(`    ${k.padEnd(14)} ${String(g.files).padStart(4)} files  ${String(g.rawMB).padStart(8)} MB raw  ${String(g.gzipMB).padStart(7)} MB gz`)
  console.log(`  article routes: ${routes.articleRoutes} (+${routes.trackPages} track pages); by track ${JSON.stringify(routes.articleRoutesByTrack)}`)
  console.log(`  projection: full dictionary = ${baseline.projection.fullDictionaryArticleRoutes} article routes vs Free limit ${baseline.projection.freePlanFileLimit} files`)
  if (baseline.parse) console.log(`  search.json: ${baseline.parse.records} records, JSON.parse median ${baseline.parse.parseMsMedian} ms`)
  if (baseline.files.output) console.log(`  .output: ${baseline.files.output.files} files (built ${baseline.files.output.builtAt})`)
  if (baseline.build) console.log(`  build: ${baseline.build.seconds}s, exit ${baseline.build.exitCode}`)
  console.log(`golden-${tag}.json  ${Object.keys(golden.topics).length} topic×language hashes, ${golden.entityIds.count} entity ids`)
}

function compare() {
  const file = join(OUT_DIR, `golden-${tag}.json`)
  if (!existsSync(file)) {
    console.error(`no golden snapshot for tag '${tag}' — run: node scripts/perf-baseline.mjs snapshot --tag ${tag}`)
    process.exit(2)
  }
  const old = readJson(file)
  const now = goldenSnapshot()
  const problems = []
  const keys = new Set([...Object.keys(old.topics), ...Object.keys(now.topics)])
  for (const k of [...keys].sort()) {
    const a = old.topics[k]
    const b = now.topics[k]
    if (!a) problems.push(`+ new topic×lang ${k} (${b.rows} rows)`)
    else if (!b) problems.push(`- missing topic×lang ${k} (${a.rows} rows)`)
    else if (a.hash !== b.hash) problems.push(`~ changed ${k} (${a.rows} → ${b.rows} rows)`)
  }
  for (const k of new Set([...Object.keys(old.search), ...Object.keys(now.search)])) {
    if (old.search[k]?.hash !== now.search[k]?.hash) problems.push(`~ search index differs: ${k}`)
  }
  if (old.entityIds.hash !== now.entityIds.hash) problems.push(`~ entity id set differs (${old.entityIds.count} → ${now.entityIds.count})`)
  if (old.indexCounts !== now.indexCounts) problems.push('~ index counts differ')
  if (old.indexProgressAliases !== now.indexProgressAliases) problems.push('~ progress aliases differ')
  console.log(`golden '${tag}' (commit ${old.commit}): ${problems.length ? problems.length + ' difference(s)' : 'identical ✓'}`)
  for (const p of problems.slice(0, 60)) console.log('  ' + p)
  if (problems.length > 60) console.log(`  … ${problems.length - 60} more`)
  console.log(`  diff a changed payload against the baseline:  git show ${old.commit}:public/data/media/<path>.json`)
  process.exit(problems.length ? 1 : 0)
}

if (command === 'snapshot') snapshot()
else if (command === 'compare') compare()
else {
  console.error('usage: perf-baseline.mjs <snapshot|compare> [--tag v0] [--build]')
  process.exit(2)
}
