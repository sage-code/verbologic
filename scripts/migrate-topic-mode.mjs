#!/usr/bin/env node
/**
 * migrate-topic-mode.mjs — one-shot codemod: `sourceLang`/`langs` → `mode`.
 *
 * Phase 7 (planning/performance-and-content-refactor.md §2.1) collapses five
 * overlapping direction mechanisms into one `mode: reversible | directional`:
 *
 *   langs: ['ro']            → mode: 'directional', target: 'ro'
 *   sourceLang: 'ro'         → mode: 'directional', target: 'ro'
 *   (neither)                → mode omitted (reversible is the default)
 *
 * `phonetic: true` is KEPT — it is a rendering fact (second column = IPA), not a
 * direction, and a reversible topic could legitimately be phonetic later.
 *
 *   node scripts/migrate-topic-mode.mjs --dry-run
 *   node scripts/migrate-topic-mode.mjs
 *
 * Idempotent: a topic that already has `mode` is left alone. Writes 2-space
 * indented JSON with a trailing newline, matching every other source file.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SIDEBARS = join(ROOT, 'src', 'data', 'sidebars')
const dryRun = process.argv.includes('--dry-run')

/** Recursively collect sidebar.json files. */
function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry === 'sidebar.json') out.push(full)
  }
  return out
}

let changedFiles = 0
let changedTopics = 0
const report = []

for (const file of walk(SIDEBARS)) {
  const raw = readFileSync(file, 'utf-8')
  const data = JSON.parse(raw)
  let touched = 0

  for (const section of data.sections ?? []) {
    for (const topic of section.topics ?? []) {
      if (topic.mode) continue // already migrated

      // `langs` was a visibility allow-list; `sourceLang` a content-ownership
      // fact. Both mean "this topic is about one language" — which is exactly
      // what `directional` says.
      const target =
        topic.sourceLang ??
        (Array.isArray(topic.langs) && topic.langs.length === 1 ? topic.langs[0] : null)

      if (target) {
        topic.mode = 'directional'
        topic.target = target
        touched += 1
        report.push(`  ${section.code}/${topic.code}: directional (target ${target})`)
      } else if (Array.isArray(topic.langs) && topic.langs.length > 1) {
        // A multi-language allow-list has no `directional` equivalent — it is a
        // reversible topic restricted to a subset. Surface it rather than guess.
        report.push(
          `  ! ${section.code}/${topic.code}: langs=[${topic.langs.join(',')}] has no mode equivalent — left unchanged`
        )
        continue
      }

      // Drop the superseded fields.
      delete topic.sourceLang
      delete topic.langs
    }
  }

  if (touched) {
    changedFiles += 1
    changedTopics += touched
    if (!dryRun) {
      writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
    }
  }
}

console.log(report.join('\n') || '  (nothing to migrate)')
console.log(
  `migrate-topic-mode: ${changedTopics} topic(s) in ${changedFiles} file(s)${dryRun ? ' — dry run, nothing written' : ''}`
)
