/**
 * Rewrites the internal `chapter`/`topic`/`entity_id`/`tags` of dictionary
 * manifests so they agree with the folder the sidebar points at.
 *
 * `reattach-orphans.mjs` moved codes between topics in the sidebar and
 * `move-manifests-to-sidebar.mjs` moved the folders, but neither touched the
 * manifest body — so a word filed under CH01T04 still claimed CH01T01 and
 * carried the `alphabet#*` tag that made the indexer skip it.
 *
 * Usage: node scripts/retag-manifests.mjs [--apply]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MEDIA = join(ROOT, 'media', 'dictionary')
const SIDEBAR = join(ROOT, 'src', 'data', 'sidebars', 'library', 'dictionary', 'sidebar.json')

const apply = process.argv.includes('--apply')
const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'))

function main() {
  const sidebar = readJson(SIDEBAR)
  const fixed = []

  for (const section of sidebar.sections) {
    for (const topic of section.topics) {
      for (const code of topic.items ?? []) {
        const file = join(MEDIA, section.code, topic.code, code, 'item.json')
        if (!existsSync(file)) continue

        const manifest = readJson(file)
        const changes = []

        if (manifest.chapter !== section.code) {
          changes.push(`chapter ${manifest.chapter} → ${section.code}`)
          manifest.chapter = section.code
        }
        if (manifest.topic !== topic.code) {
          changes.push(`topic ${manifest.topic} → ${topic.code}`)
          manifest.topic = topic.code
        }
        const entityId = `${topic.code}:${code}`
        if (manifest.entity_id !== entityId) {
          changes.push(`entity_id ${manifest.entity_id} → ${entityId}`)
          manifest.entity_id = entityId
        }

        // Drop only the leftover phonics tag and make sure the topic tag is
        // present. Every other tag (`shared-article-variant`, overrides, …)
        // carries meaning and must survive.
        const tags = manifest.tags ?? []
        const wanted = `vocabulary#${topic.code}`
        const kept = tags.filter((t) => !t.startsWith('alphabet#'))
        if (!kept.includes(wanted)) kept.push(wanted)
        if (kept.length !== tags.length || !tags.includes(wanted)) {
          manifest.tags = kept
          changes.push(`tags ${JSON.stringify(tags)} → ${JSON.stringify(kept)}`)
        }

        // Only manifests whose location actually disagrees with the sidebar
        // need rewriting; the rest already index correctly.
        if (!changes.some((c) => c.startsWith('chapter') || c.startsWith('topic') || c.startsWith('entity_id'))) {
          continue
        }

        if (changes.length === 0) continue
        if (apply) writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n')
        fixed.push(`${section.code}/${topic.code}/${code} ${manifest.locales?.ro?.name} :: ${changes.join(', ')}`)
      }
    }
  }

  console.log(`retag: ${fixed.length} manifest(s) ${apply ? 'rewritten' : 'to rewrite'}`)
  for (const line of fixed) console.log('  ~', line)
  if (!apply) console.log('retag: dry run — nothing written')
}

main()
