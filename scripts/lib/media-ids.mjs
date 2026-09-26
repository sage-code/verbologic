/**
 * media-ids.mjs — sequential media filename generator.
 *
 * Each topic's SIDEBAR entry (src/data/sidebars/library/<section>/sidebar.json
 * — the "topic manifest") carries a `lastIndex` counter per language and
 * media type: { lastIndex: { en: { audio: 7 }, ro: { audio: 12 } } }. The
 * next physical filename for a topic/lang/type is that counter + 1, formatted
 * as a type letter + 3-digit number: V001 first video, P001 first picture,
 * A001 first audio file — independent per type (each starts at 001).
 *
 * This ONLY generates the physical filename (manifest `file`/`key`). The
 * manifest `id` (the R2 lookup key and `learned_items.entity_id` progress
 * key — see media/readme.md) is never touched by anything in this module.
 *
 * Topic codes are routed to their sidebar by first letter: C → dictionary,
 * L → lectures, S → stories (mirrors the existing chapter-code convention).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

export const SIDEBAR_BY_PREFIX = {
  C: join(ROOT, 'src', 'data', 'sidebars', 'library', 'dictionary', 'sidebar.json'),
  L: join(ROOT, 'src', 'data', 'sidebars', 'library', 'lectures', 'sidebar.json'),
  S: join(ROOT, 'src', 'data', 'sidebars', 'library', 'stories', 'sidebar.json')
}

export const TYPE_PREFIX = { audio: 'A', video: 'V', image: 'P' }

/** The sidebar file that owns a topic code, from its chapter-letter prefix. */
export function sidebarPathForTopic(topicCode) {
  const path = SIDEBAR_BY_PREFIX[topicCode[0]]
  if (!path) throw new Error(`unknown topic prefix '${topicCode[0]}' for topic '${topicCode}'`)
  return path
}

export function loadSidebar(path) {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

export function saveSidebar(path, sidebar) {
  writeFileSync(path, JSON.stringify(sidebar, null, 2) + '\n')
}

/** Find a topic entry by code across every section of a loaded sidebar. */
export function findTopic(sidebar, topicCode) {
  for (const section of sidebar.sections) {
    const topic = section.topics.find((t) => t.code === topicCode)
    if (topic) return topic
  }
  return null
}

/** Format one media code: ('audio', 7) → "A007". */
export function formatMediaCode(type, index) {
  const prefix = TYPE_PREFIX[type]
  if (!prefix) throw new Error(`unknown media type '${type}' (expected audio, video or image)`)
  return `${prefix}${String(index).padStart(3, '0')}`
}

/**
 * Bump a topic's in-memory lastIndex for one language/type and return the
 * new code. Callers doing many allocations (a migration) should load the
 * sidebar once, call this per file, then saveSidebar once at the end —
 * see nextMediaCode for the single-allocation convenience path.
 */
export function bumpLastIndex(topic, lang, type) {
  topic.lastIndex ??= {}
  topic.lastIndex[lang] ??= {}
  const next = (topic.lastIndex[lang][type] ?? 0) + 1
  topic.lastIndex[lang][type] = next
  return formatMediaCode(type, next)
}

/**
 * Allocate and persist the next sequential code for one topic/lang/type —
 * the convenience path for a single new file (e.g. scaffolding one topic).
 * Reads the topic's sidebar, bumps its lastIndex, writes the sidebar back.
 */
export function nextMediaCode(topicCode, lang, type) {
  const path = sidebarPathForTopic(topicCode)
  const sidebar = loadSidebar(path)
  const topic = findTopic(sidebar, topicCode)
  if (!topic) throw new Error(`topic '${topicCode}' not found in ${path}`)
  const code = bumpLastIndex(topic, lang, type)
  saveSidebar(path, sidebar)
  return code
}
