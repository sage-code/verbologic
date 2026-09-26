#!/usr/bin/env node
/**
 * media-migrate-ids.mjs — one-time migration: renumber every PUBLISHED audio
 * file under media/audio/<lang>/<TOPIC>/ to the sequential A001, A002, …
 * scheme (independent per topic + language), via scripts/lib/media-ids.mjs —
 * AND rename its sibling manifest .json file(s) to match, so the directory
 * listing reads A007.mp3 / A007.json side by side instead of the old
 * semantic id. Two dedup manifests sharing one file (letter_a / letter_a-2)
 * become A007.json (primary) and A007-2.json (dedup), ordered by their own
 * `id` so the assignment is stable across re-runs.
 *
 * The manifest `id` FIELD (R2 lookup key + `learned_items.entity_id`
 * progress key — see media/readme.md) is NEVER touched, only the on-disk
 * filename and the manifest's `file`/`key` content fields. media-index.mjs
 * resolves everything by `id`, never by filename, so this is purely a
 * directory-browsability rename. Pending items (no audio yet) still get a
 * reserved code and a renamed manifest (`file`/`key` stay null) — the same
 * slot is filled in later when the recording lands, no further rename.
 *
 * Safe to re-run: an audio file already named like a code (A007.mp3) does
 * not bump the counter again — its existing code is reused so a manifest
 * whose filename fell out of sync (e.g. a previous partial run) still gets
 * fixed up.
 *
 *   node scripts/media-migrate-ids.mjs                    # dry run: print the plan
 *   node scripts/media-migrate-ids.mjs --apply             # rename + write manifests + sidebars
 *   node scripts/media-migrate-ids.mjs --apply --lang=en   # restrict to one language
 */
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSidebar, saveSidebar, findTopic, bumpLastIndex, sidebarPathForTopic } from './lib/media-ids.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const AUDIO_ROOT = join(ROOT, 'media', 'audio')
const apply = process.argv.includes('--apply')
const langArg = process.argv.find((a) => a.startsWith('--lang='))
const LANGS = langArg ? langArg.slice('--lang='.length).split(',') : ['en', 'ro']

const ALREADY_MIGRATED = /^([AVP]\d{3})(?:-(\d+))?\./

function listTopicDirs(lang) {
  const dir = join(AUDIO_ROOT, lang)
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
}

/** Target manifest filename for one member of a group: primary -> "A007.json",
 *  the rest -> "A007-2.json", "A007-3.json", … (order = sorted by id). */
function manifestNameFor(code, indexInGroup) {
  return indexInGroup === 0 ? `${code}.json` : `${code}-${indexInGroup + 1}.json`
}

function main() {
  const sidebarCache = new Map() // sidebar path -> parsed sidebar (loaded once, saved once)
  const plan = []
  let audioRenamed = 0
  let manifestsRenamed = 0
  let manifestsTouched = 0
  let pendingRenamed = 0
  let missingFiles = 0

  for (const lang of LANGS) {
    for (const topicCode of listTopicDirs(lang)) {
      const topicDir = join(AUDIO_ROOT, lang, topicCode)
      const manifestNames = readdirSync(topicDir).filter((f) => f.endsWith('.json'))
      const manifests = manifestNames.map((name) => ({
        name,
        path: join(topicDir, name),
        data: JSON.parse(readFileSync(join(topicDir, name), 'utf-8'))
      }))

      // Group published manifests by their current key — a shared file (dedup
      // ids) renames once, for every manifest that points at it. Pending
      // manifests (no file yet) have no key to group by — handled below.
      const groups = new Map() // key -> manifest[]
      const pendingManifests = []
      for (const m of manifests) {
        if (m.data.status !== 'published' || !m.data.key) {
          pendingManifests.push(m)
          continue
        }
        if (!groups.has(m.data.key)) groups.set(m.data.key, [])
        groups.get(m.data.key).push(m)
      }

      // Deterministic order (current filename) so a fresh migration assigns
      // the same sequence to the same files on a re-run.
      const orderedKeys = [...groups.keys()].sort((a, b) =>
        groups.get(a)[0].data.file.localeCompare(groups.get(b)[0].data.file)
      )

      let sidebarPath
      try {
        sidebarPath = sidebarPathForTopic(topicCode)
      } catch (err) {
        console.error(`  ! ${err.message}, skipping ${lang}/${topicCode}`)
        continue
      }

      for (const key of orderedKeys) {
        // Stable member order within the group: by `id` (permanent), not by
        // filename — so the primary/dedup assignment never reshuffles.
        const group = groups.get(key).slice().sort((a, b) => a.data.id.localeCompare(b.data.id))
        const oldFile = group[0].data.file
        const already = ALREADY_MIGRATED.exec(oldFile)

        let code
        if (already) {
          code = already[1]
        } else {
          const oldPath = join(topicDir, oldFile)
          if (!existsSync(oldPath)) {
            console.error(`  ! missing file, skipping: ${lang}/${topicCode}/${oldFile}`)
            missingFiles++
            continue
          }
          if (!sidebarCache.has(sidebarPath)) sidebarCache.set(sidebarPath, loadSidebar(sidebarPath))
          const sidebar = sidebarCache.get(sidebarPath)
          const topic = findTopic(sidebar, topicCode)
          if (!topic) {
            console.error(`  ! topic '${topicCode}' not found in ${sidebarPath}, skipping`)
            continue
          }
          const ext = oldFile.slice(oldFile.lastIndexOf('.'))
          code = bumpLastIndex(topic, lang, 'audio')
          const newFile = `${code}${ext}`
          const newKey = `audio/${lang}/${topicCode}/${newFile}`

          plan.push(`${lang}/${topicCode}/${oldFile} -> ${newFile}`)
          if (apply) {
            renameSync(oldPath, join(topicDir, newFile))
            for (const m of group) {
              m.data.file = newFile
              m.data.key = newKey
            }
          }
          audioRenamed++
        }

        // Manifest filenames — fix up regardless of whether the audio file
        // was just renamed or already had its code (covers a prior partial run).
        group.forEach((m, i) => {
          const wantName = manifestNameFor(code, i)
          if (m.name !== wantName) {
            plan.push(`  ${lang}/${topicCode}/${m.name} -> ${wantName}  (id: ${m.data.id})`)
            if (apply) {
              renameSync(m.path, join(topicDir, wantName))
              writeFileSync(join(topicDir, wantName), JSON.stringify(m.data, null, 2) + '\n')
            }
            manifestsRenamed++
          } else if (apply) {
            writeFileSync(m.path, JSON.stringify(m.data, null, 2) + '\n')
          }
          manifestsTouched++
        })
      }

      // Pending items: no file to rename, but the manifest still gets a
      // reserved code — sorted by id so a re-run assigns the same slots.
      const orderedPending = pendingManifests.slice().sort((a, b) => a.data.id.localeCompare(b.data.id))
      for (const m of orderedPending) {
        if (ALREADY_MIGRATED.test(m.name)) continue
        if (!sidebarCache.has(sidebarPath)) sidebarCache.set(sidebarPath, loadSidebar(sidebarPath))
        const sidebar = sidebarCache.get(sidebarPath)
        const topic = findTopic(sidebar, topicCode)
        if (!topic) {
          console.error(`  ! topic '${topicCode}' not found in ${sidebarPath}, skipping`)
          continue
        }
        const code = bumpLastIndex(topic, lang, 'audio')
        const wantName = `${code}.json`
        plan.push(`${lang}/${topicCode}/${m.name} -> ${wantName}  (id: ${m.data.id}, pending)`)
        if (apply) renameSync(m.path, join(topicDir, wantName))
        pendingRenamed++
      }
    }
  }

  if (plan.length) console.log(plan.join('\n') + '\n')
  console.log(
    `media-migrate-ids${apply ? '' : ' (DRY RUN)'}: ${audioRenamed} audio file(s) renamed, ` +
      `${manifestsRenamed} manifest file(s) renamed (${manifestsTouched} manifests written), ` +
      `${pendingRenamed} pending manifest(s) reserved, ${missingFiles} missing file(s) · languages: ${LANGS.join(', ')}`
  )

  if (apply) {
    for (const [path, sidebar] of sidebarCache) saveSidebar(path, sidebar)
    if (sidebarCache.size) {
      console.log(`sidebars updated: ${[...sidebarCache.keys()].map((p) => p.replace(ROOT, '.')).join(', ')}`)
    }
  } else {
    console.log('dry run — nothing written. Re-run with --apply to perform the rename.')
  }
}

main()
