/**
 * Moves dictionary manifest folders so their on-disk location matches the
 * sidebar. `reattach-orphans.mjs` rewrote the sidebar but left every folder
 * behind in CH01T01, so the UI asked for CH01T04/W006 and found nothing.
 *
 * Usage: node scripts/move-manifests-to-sidebar.mjs [--apply]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MEDIA = join(ROOT, 'media', 'dictionary')
const SIDEBAR = join(ROOT, 'src', 'data', 'sidebars', 'library', 'dictionary', 'sidebar.json')

const apply = process.argv.includes('--apply')
const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'))

/** code → absolute path of the folder holding its item.json */
function indexManifests() {
  const index = new Map()
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (entry.name !== 'item.json') continue
      const manifest = readJson(full)
      if (!manifest.code) continue
      if (!index.has(manifest.code)) index.set(manifest.code, [])
      index.get(manifest.code).push(full)
    }
  }
  walk(MEDIA)
  return index
}

function main() {
  const sidebar = readJson(SIDEBAR)
  const index = indexManifests()

  const moved = []
  const missing = []
  const ambiguous = []

  for (const section of sidebar.sections) {
    for (const topic of section.topics) {
      for (const code of topic.items ?? []) {
        const target = join(MEDIA, section.code, topic.code, code)
        if (existsSync(join(target, 'item.json'))) continue

        const sources = index.get(code) ?? []
        if (sources.length === 0) {
          missing.push(`${code} (${topic.code}) — no manifest anywhere`)
          continue
        }
        if (sources.length > 1) {
          ambiguous.push(`${code} (${topic.code}) — ${sources.length} copies: ${sources.join(', ')}`)
          continue
        }

        const source = sources[0]
        const sourceDir = join(source, '..')
        if (apply) {
          mkdirSync(join(MEDIA, section.code, topic.code), { recursive: true })
          renameSync(sourceDir, target)
        }
        moved.push(`${code} ${sourceDir.replace(MEDIA + '\\', '')} → ${section.code}/${topic.code}`)
      }
    }
  }

  console.log(`move: ${moved.length} folder(s) ${apply ? 'moved' : 'to move'}`)
  for (const line of moved) console.log('  →', line)
  if (missing.length) {
    console.log(`move: ${missing.length} unresolved`)
    for (const line of missing) console.log('  !', line)
  }
  if (ambiguous.length) {
    console.log(`move: ${ambiguous.length} ambiguous`)
    for (const line of ambiguous) console.log('  ?', line)
  }
  if (!apply) console.log('move: dry run — nothing written')
}

main()
