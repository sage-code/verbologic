#!/usr/bin/env node
/**
 * Create pending per-language manifests for shared dictionary/lecture articles
 * whose target terms are already translated. Each language keeps its own audio.
 *
 *   node scripts/media-expand-shared-variants.mjs          # dry run
 *   node scripts/media-expand-shared-variants.mjs --apply  # write manifests
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SIDEBAR_BY_PREFIX, bumpLastIndex, findTopic, loadSidebar, saveSidebar } from './lib/media-ids.mjs'
import { LOCALES } from './lib/locales.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CONTENT = join(ROOT, 'content')
const AUDIO = join(ROOT, 'media', 'audio')
const SHARED_TRACKS = new Set(['dictionary', 'lectures'])
const TRANSLATABLE_KINDS = new Set(['word', 'sentence', 'expression', 'phrase', 'greeting', 'letter'])
const apply = process.argv.includes('--apply')

function walkMarkdown(dir, parts = []) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const next = [...parts, entry.name]
    const path = join(dir, entry.name)
    return entry.isDirectory()
      ? walkMarkdown(path, next)
      : entry.name.endsWith('.md')
        ? [next]
        : []
  })
}

function walkManifests() {
  const manifests = []
  for (const languageEntry of readdirSync(AUDIO, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const lang = languageEntry.name
    const langDir = join(AUDIO, lang)
    for (const topicEntry of readdirSync(langDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      const topic = topicEntry.name
      const topicDir = join(langDir, topic)
      for (const filename of readdirSync(topicDir).filter((name) => name.endsWith('.json'))) {
        const path = join(topicDir, filename)
        const data = JSON.parse(readFileSync(path, 'utf8'))
        if (data.id && !['chapter-title', 'topic-title'].includes(data.kind)) {
          manifests.push({ lang, topic, filename, path, data })
        }
      }
    }
  }
  return manifests
}

function main() {
  const articleCodes = new Set(
    walkMarkdown(CONTENT)
      .filter((parts) => SHARED_TRACKS.has(parts[0]) && parts.length === 4)
      .map((parts) => `${parts[1]}\n${parts[2]}`)
  )
  const manifests = walkManifests()
  const manifestsByTopicCode = new Map()
  for (const item of manifests) {
    const key = `${item.topic}\n${item.data.id}`
    const entries = manifestsByTopicCode.get(key) ?? []
    entries.push(item)
    manifestsByTopicCode.set(key, entries)
  }

  const sidebars = new Map()
  const planned = []
  const skipped = []
  for (const itemKey of articleCodes) {
    const [topicCode, contentCode] = itemKey.split('\n')
    const entries = manifestsByTopicCode.get(itemKey) ?? []
    const source = entries.slice().sort((a, b) => {
      const namesCount = (m) => Object.keys(m.data.names ?? {}).length
      return namesCount(b) - namesCount(a) ||
        Number(b.lang === 'ro') - Number(a.lang === 'ro') ||
        a.lang.localeCompare(b.lang)
    })[0]
    if (!source) {
      skipped.push(`${topicCode}/${contentCode}: no source manifest`)
      continue
    }
    if (!TRANSLATABLE_KINDS.has(source.data.kind)) {
      skipped.push(`${topicCode}/${contentCode}: kind '${source.data.kind}' requires explicit variants`)
      continue
    }

    const sidebarPath = SIDEBAR_BY_PREFIX[topicCode[0]]
    if (!sidebarPath) throw new Error(`No sidebar configured for topic '${topicCode}'`)
    if (!sidebars.has(sidebarPath)) sidebars.set(sidebarPath, loadSidebar(sidebarPath))
    const topic = findTopic(sidebars.get(sidebarPath), topicCode)
    if (!topic) throw new Error(`Topic '${topicCode}' is missing from ${sidebarPath}`)
    if (!topic.items.includes(contentCode)) {
      throw new Error(`Article ${topicCode}/${contentCode} is not a sidebar item`)
    }

    const existingLanguages = new Set(entries.map((entry) => entry.lang))
    for (const lang of LOCALES) {
      if (existingLanguages.has(lang)) continue
      const term = source.data.names?.[lang]
      if (!term) {
        skipped.push(`${topicCode}/${contentCode}/${lang}: no translated term`)
        continue
      }
      const dir = join(AUDIO, lang, topicCode)
      let filenameCode
      let path
      do {
        filenameCode = bumpLastIndex(topic, lang, 'audio')
        path = join(dir, `${filenameCode}.json`)
      } while (
        existsSync(path) ||
        existsSync(join(dir, `${filenameCode}.mp3`))
      )

      const manifest = {
        id: contentCode,
        entity_id: `${topicCode}:${contentCode}`,
        ...(source.data.legacy_entity_id ? { legacy_entity_id: source.data.legacy_entity_id } : {}),
        lang,
        kind: source.data.kind,
        term,
        names: source.data.names,
        ipa: null,
        file: null,
        key: null,
        mime: 'audio/mpeg',
        bytes: null,
        sha1: null,
        status: 'pending',
        tags: [...(source.data.tags ?? []), 'shared-article-variant']
      }
      planned.push({ path, manifest, sidebarPath, topic: topicCode })
    }
  }

  console.log(`shared article variants${apply ? '' : ' (DRY RUN)'}: ${planned.length} pending manifest(s), ${skipped.length} skipped`)
  for (const item of planned) {
    console.log(`  ${item.manifest.lang}/${item.topic}/${basename(item.path)} -> ${item.manifest.id} (${item.manifest.term})`)
  }
  for (const message of skipped) console.log(`  skipped: ${message}`)
  if (!apply) {
    console.log('dry run — nothing written. Re-run with --apply to create variants.')
    return
  }

  for (const item of planned) {
    mkdirSync(join(item.path, '..'), { recursive: true })
    writeFileSync(item.path, JSON.stringify(item.manifest, null, 2) + '\n')
  }
  for (const [path, sidebar] of sidebars) saveSidebar(path, sidebar)
  console.log('Variants created with pending audio. Add language-specific recordings before publishing audio buttons.')
}

main()
