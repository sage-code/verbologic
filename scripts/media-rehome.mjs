#!/usr/bin/env node
/**
 * media-rehome.mjs — one-time move: redistribute media/audio/ro-archive/<old
 * code>/ files into media/audio/<lang>/<new code>/, where <new code> is
 * looked up per manifest `id` from the CURRENT sidebars (dictionary /
 * lectures / stories) — the sidebars place rows by id, not by folder, so
 * they are the source of truth for where an id lives now (see
 * manual/curriculum.md "Re-home record", 2026-09-26).
 *
 * For each destination topic, assigns fresh sequential A0xx codes
 * (continuing that topic's own lastIndex, via scripts/lib/media-ids.mjs),
 * grouping manifests that share one physical file (dedup ids, e.g.
 * word_coleg / word_coleg-2) so they land on one file with primary/dedup
 * manifest names — same convention as media-migrate-ids.mjs.
 *
 * An id not found in any current sidebar is left in place under ro-archive
 * and reported — a file only moves when we know exactly where it belongs.
 *
 *   node scripts/media-rehome.mjs                     # dry run: print the plan
 *   node scripts/media-rehome.mjs --apply              # move + write manifests + sidebars
 *   node scripts/media-rehome.mjs --apply --lang=ro     # restrict to one language (default: ro)
 */
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SIDEBAR_BY_PREFIX, loadSidebar, saveSidebar, findTopic, bumpLastIndex } from './lib/media-ids.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const AUDIO_ROOT = join(ROOT, 'media', 'audio')
const ARCHIVE_ROOT = join(AUDIO_ROOT, 'ro-archive')
const apply = process.argv.includes('--apply')
const langArg = process.argv.find((a) => a.startsWith('--lang='))
const LANGS = langArg ? langArg.slice('--lang='.length).split(',') : ['ro']

function listTopicDirs(root) {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
}

/** Every archived manifest, tagged with its old topic folder. */
function archivedManifests() {
  const out = []
  for (const topicCode of listTopicDirs(ARCHIVE_ROOT)) {
    const dir = join(ARCHIVE_ROOT, topicCode)
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      out.push({ oldTopic: topicCode, name, path: join(dir, name), data: JSON.parse(readFileSync(join(dir, name), 'utf-8')) })
    }
  }
  return out
}

/** id -> current topic code, built from every sidebar's topics[].items. */
function buildIdToTopic() {
  const map = new Map()
  for (const sidebarPath of Object.values(SIDEBAR_BY_PREFIX)) {
    const sidebar = loadSidebar(sidebarPath)
    for (const section of sidebar.sections) {
      for (const topic of section.topics) {
        for (const id of topic.items ?? []) {
          if (map.has(id) && map.get(id) !== topic.code) {
            console.error(`! id '${id}' appears in multiple topics: ${map.get(id)} and ${topic.code}`)
          }
          map.set(id, topic.code)
        }
      }
    }
  }
  return map
}

function manifestNameFor(code, indexInGroup) {
  return indexInGroup === 0 ? `${code}.json` : `${code}-${indexInGroup + 1}.json`
}

function main() {
  const idToTopic = buildIdToTopic()
  const sidebarCache = new Map()
  const plan = []
  let filesMoved = 0
  let manifestsWritten = 0
  let unattributed = 0
  const unattributedList = []

  for (const lang of LANGS) {
    const manifests = archivedManifests().filter((m) => m.data.lang === lang || !m.data.lang)
    // destTopic -> oldKey -> manifest[]  (oldKey groups manifests sharing one physical file)
    const groups = new Map()

    for (const m of manifests) {
      const destTopic = idToTopic.get(m.data.id)
      if (!destTopic) {
        unattributed++
        unattributedList.push(`${lang}/${m.oldTopic}/${m.name} (id: ${m.data.id})`)
        continue
      }
      if (!groups.has(destTopic)) groups.set(destTopic, new Map())
      const byKey = groups.get(destTopic)
      const oldKey = m.data.key ?? m.path
      if (!byKey.has(oldKey)) byKey.set(oldKey, [])
      byKey.get(oldKey).push(m)
    }

    const orderedTopics = [...groups.keys()].sort()
    for (const destTopic of orderedTopics) {
      const byKey = groups.get(destTopic)
      const destDir = join(AUDIO_ROOT, lang, destTopic)
      const sidebarPath = SIDEBAR_BY_PREFIX[destTopic[0]]
      if (!sidebarPath) {
        console.error(`! unknown topic prefix for '${destTopic}', skipping group`)
        continue
      }
      if (!sidebarCache.has(sidebarPath)) sidebarCache.set(sidebarPath, loadSidebar(sidebarPath))
      const sidebar = sidebarCache.get(sidebarPath)
      const topic = findTopic(sidebar, destTopic)
      if (!topic) {
        console.error(`! topic '${destTopic}' not found in ${sidebarPath}, skipping group`)
        continue
      }

      const orderedKeys = [...byKey.keys()].sort((a, b) => {
        const fa = byKey.get(a)[0].data.file ?? ''
        const fb = byKey.get(b)[0].data.file ?? ''
        return fa.localeCompare(fb)
      })

      for (const oldKey of orderedKeys) {
        const group = byKey.get(oldKey).slice().sort((a, b) => a.data.id.localeCompare(b.data.id))
        const primary = group[0]
        const oldFile = primary.data.file

        if (!oldFile) {
          // Pending item — no audio yet, just relocate the manifest placeholder.
          const code = bumpLastIndex(topic, lang, 'audio')
          const wantName = `${code}.json`
          plan.push(`${lang}/${primary.oldTopic}/${primary.name} -> ${lang}/${destTopic}/${wantName}  (id: ${primary.data.id}, pending)`)
          if (apply) {
            mkdirSync(destDir, { recursive: true })
            writeFileSync(join(destDir, wantName), JSON.stringify(primary.data, null, 2) + '\n')
            if (existsSync(primary.path)) rmSync(primary.path)
          }
          manifestsWritten++
          continue
        }

        const oldPath = join(ARCHIVE_ROOT, primary.oldTopic, oldFile)
        const ext = oldFile.slice(oldFile.lastIndexOf('.'))
        const code = bumpLastIndex(topic, lang, 'audio')
        const newFile = `${code}${ext}`
        const newKey = `audio/${lang}/${destTopic}/${newFile}`

        plan.push(`${lang}/${primary.oldTopic}/${oldFile} -> ${lang}/${destTopic}/${newFile}  (${group.length} manifest${group.length > 1 ? 's' : ''})`)

        if (apply) {
          mkdirSync(destDir, { recursive: true })
          if (existsSync(oldPath)) renameSync(oldPath, join(destDir, newFile))
        }
        filesMoved++

        group.forEach((m, i) => {
          const wantName = manifestNameFor(code, i)
          m.data.file = newFile
          m.data.key = newKey
          plan.push(`  ${lang}/${primary.oldTopic}/${m.name} -> ${lang}/${destTopic}/${wantName}  (id: ${m.data.id})`)
          if (apply) {
            writeFileSync(join(destDir, wantName), JSON.stringify(m.data, null, 2) + '\n')
            if (existsSync(m.path)) rmSync(m.path)
          }
          manifestsWritten++
        })
      }
    }
  }

  if (plan.length) console.log(plan.join('\n') + '\n')
  if (unattributedList.length) {
    console.warn(`unattributed (left in ro-archive, no current sidebar match): ${unattributedList.length}`)
    for (const u of unattributedList) console.warn(`  - ${u}`)
  }
  console.log(
    `media-rehome${apply ? '' : ' (DRY RUN)'}: ${filesMoved} file(s), ${manifestsWritten} manifest(s) written · ` +
      `unattributed ${unattributed} · languages: ${LANGS.join(', ')}`
  )

  if (apply) {
    for (const [path, sidebar] of sidebarCache) saveSidebar(path, sidebar)
    if (sidebarCache.size) console.log(`sidebars updated: ${[...sidebarCache.keys()].map((p) => p.replace(ROOT, '.')).join(', ')}`)
  } else {
    console.log('dry run — nothing written. Re-run with --apply to perform the move.')
  }
}

main()
