#!/usr/bin/env node
/**
 * articles-set-targets.mjs — one-shot: copy each lecture item's manifest `target`
 * into its article file as `targets: ["<lang>"]`.
 *
 *   node scripts/articles-set-targets.mjs --dry-run
 *   node scripts/articles-set-targets.mjs
 *
 * planning/content-in-database.md section 7 (phase 2). `targets` lists the
 * languages an article applies to as a LEARNED language; omitted = all. It
 * replaces the single manifest `target` + the topic's `mode: directional`.
 * An article that already has `targets` is left alone.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readArticle, writeArticle } from './lib/articles.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const dryRun = process.argv.includes('--dry-run')

/** item code -> the language its manifest says it teaches */
const targetByCode = new Map()
const walk = (dir) => {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name === 'item.json') {
      const manifest = JSON.parse(readFileSync(full, 'utf8'))
      if (manifest.code && manifest.target) targetByCode.set(manifest.code, manifest.target)
    }
  }
}
walk(join(ROOT, 'media', 'lectures'))

let set = 0
let kept = 0
let none = 0
const lectures = join(ROOT, 'content', 'lectures')
for (const topic of readdirSync(lectures)) {
  for (const name of readdirSync(join(lectures, topic))) {
    if (!name.endsWith('.json')) continue
    const id = name.slice(0, -'.json'.length)
    const file = join(lectures, topic, name)
    const article = readArticle(file)
    if (article.targets) {
      kept++
      continue
    }
    const target = targetByCode.get(id)
    if (!target) {
      none++
      continue
    }
    article.targets = [target]
    if (!dryRun) writeArticle(file, article)
    set++
  }
}
console.log(`articles-set-targets: ${set} set, ${kept} already had targets, ${none} without a manifest target${dryRun ? ' (dry run)' : ''}`)
