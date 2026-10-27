#!/usr/bin/env node
/**
 * seed-dictionary-expansion.mjs — add chapters, topics and words from
 * seed/dictionary-expansion.json.
 *
 *   node scripts/seed-dictionary-expansion.mjs            # dry run
 *   node scripts/seed-dictionary-expansion.mjs --apply
 *
 * Only `ro` and `en` names are written; the other locales stay blank for
 * generate-audio.py --translate to fill. Romanian IPA is taken from the seed.
 * Codes are allocated above the current maximum W-code, so none shift.
 * Every Romanian term is checked against every existing word first, so a
 * re-run cannot introduce a duplicate.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MEDIA = join(ROOT, 'media', 'dictionary')
const SIDEBAR = join(ROOT, 'src', 'data', 'sidebars', 'library', 'dictionary', 'sidebar.json')
const SEED = join(ROOT, 'seed', 'dictionary-expansion.json')

const apply = process.argv.includes('--apply')
const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'))

/** Every manifest under a topic folder. */
function topicManifests(chapter, topic) {
  const dir = join(MEDIA, chapter, topic)
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'sound') continue
    const file = join(dir, entry.name, 'item.json')
    if (existsSync(file)) out.push(readJson(file))
  }
  return out
}

function main() {
  const sidebar = readJson(SIDEBAR)
  const seed = readJson(SEED)

  let highest = 0
  const existingRo = new Map()
  for (const section of sidebar.sections) {
    for (const topic of section.topics) {
      for (const id of topic.items ?? []) {
        const m = /^W(\d+)$/.exec(id)
        if (m) highest = Math.max(highest, Number(m[1]))
      }
      for (const manifest of topicManifests(section.code, topic.code)) {
        const m = /^W(\d+)$/.exec(manifest.code ?? '')
        if (m) highest = Math.max(highest, Number(m[1]))
        const ro = manifest.locales?.ro?.name?.trim().toLowerCase()
        if (ro) existingRo.set(ro, `${topic.code}/${manifest.code}`)
      }
    }
  }

  const created = []
  const skipped = []
  const newTopics = []

  const addWord = (chapterCode, topicEntry, word) => {
    const ro = word.ro.trim().toLowerCase()
    if (existingRo.has(ro)) {
      skipped.push(`${word.ro} (already ${existingRo.get(ro)})`)
      return
    }
    highest += 1
    const code = `W${String(highest).padStart(3, '0')}`
    const manifest = {
      code,
      track: 'dictionary',
      chapter: chapterCode,
      topic: topicEntry.code,
      kind: 'word',
      entity_id: `${topicEntry.code}:${code}`,
      cefr: topicEntry.level ?? 'B1',
      tags: [`vocabulary#${topicEntry.code}`],
      locales: {
        ro: { name: word.ro, ipa: word.ipa },
        en: { name: word.en }
      }
    }
    const dir = join(MEDIA, chapterCode, topicEntry.code, code)
    if (apply) {
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'item.json'), JSON.stringify(manifest, null, 2) + '\n')
    }
    topicEntry.items.push(code)
    existingRo.set(ro, `${topicEntry.code}/${code}`)
    created.push(`${code} ${word.ro} / ${word.en} → ${topicEntry.code}`)
  }

  // 1. New chapters and their topics.
  for (const chapterSpec of seed.chapters) {
    let chapter = sidebar.sections.find((s) => s.code === chapterSpec.code)
    if (!chapter) {
      chapter = { code: chapterSpec.code, names: chapterSpec.names, topics: [] }
      sidebar.sections.push(chapter)
    }
    for (const topicSpec of chapterSpec.topics) {
      let topic = chapter.topics.find((t) => t.code === topicSpec.code)
      if (!topic) {
        topic = { code: topicSpec.code, names: topicSpec.names, layout: 'table', level: topicSpec.level, items: [] }
        chapter.topics.push(topic)
        newTopics.push(`${topicSpec.code} ${topicSpec.names.en}`)
      }
      for (const word of topicSpec.words) addWord(chapterSpec.code, topic, word)
    }
  }

  // 2. Additions to existing topics.
  for (const [topicCode, words] of Object.entries(seed.additions)) {
    const section = sidebar.sections.find((s) => s.topics.some((t) => t.code === topicCode))
    const topic = section?.topics.find((t) => t.code === topicCode)
    if (!topic) {
      console.error(`seed: unknown topic ${topicCode}`)
      process.exitCode = 1
      continue
    }
    for (const word of words) addWord(section.code, topic, word)
  }

  console.log(`seed: ${newTopics.length} new topic(s)`)
  for (const line of newTopics) console.log('  + topic', line)
  console.log(`seed: ${created.length} word(s) created`)
  for (const line of created) console.log('  +', line)
  if (skipped.length) {
    console.log(`seed: ${skipped.length} skipped (already present)`)
    for (const line of skipped) console.log('  =', line)
  }

  if (!apply) {
    console.log('seed: dry run — nothing written')
    return
  }
  writeFileSync(SIDEBAR, JSON.stringify(sidebar, null, 2) + '\n')
  console.log('seed: sidebar written')
}

main()
