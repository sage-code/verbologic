#!/usr/bin/env node
/**
 * Convert media manifest ids from semantic slugs to short content codes.
 *
 * Content codes are scoped to a topic and shared by its language variants.
 * Physical media filenames and R2 keys are deliberately left unchanged.
 * The entity_id is topic-scoped and language-independent. The previous
 * progress id is retained separately as legacy_entity_id for migration.
 *
 *   node scripts/media-reid-manifests.mjs          # dry run
 *   node scripts/media-reid-manifests.mjs --apply  # update manifests, sidebars, and article ids
 */
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import grayMatter from 'gray-matter'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MEDIA = join(ROOT, 'media')
const SIDEBARS = join(ROOT, 'src', 'data', 'sidebars')
const CONTENT = join(ROOT, 'content')
const apply = process.argv.includes('--apply')
const CODE = /^([AVP])(\d{3})(?:-(\d+))?$/
const TITLES = new Set(['chapter-title', 'topic-title'])
const key = (topic, id) => `${topic}\n${id}`

function walkFiles(dir, predicate) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walkFiles(path, predicate) : predicate(path) ? [path] : []
  })
}

function fail(message) {
  throw new Error(message)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function sourceForManifest(manifest) {
  return manifest.legacy_entity_id ?? manifest.entity_id ?? manifest.id
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function replaceVariants(text, terms, replacement) {
  const variants = [...new Set(Object.values(terms).filter((term) => typeof term === 'string' && term))]
    .sort((a, b) => b.length - a.length)
  return variants.reduce(
    (result, term) => result.replace(new RegExp(escapeRegex(term), 'gi'), replacement),
    text
  )
}

function replaceBoldTerms(body, terms) {
  const variants = [...new Set(Object.values(terms).filter((term) => typeof term === 'string' && term))]
    .sort((a, b) => b.length - a.length)
  return variants.reduce((result, term) => {
    const expression = new RegExp(`\\*\\*(${escapeRegex(term)})\\*\\*`, 'gi')
    return result.replace(expression, (_match, value) => {
      const capitalize = value[0] === value[0].toLocaleUpperCase()
      return `:target-term${capitalize ? '{capitalize="true"}' : ''}`
    })
  }, body)
}

function main() {
  const manifests = []
  for (const path of walkFiles(MEDIA, (file) => file.endsWith('.json'))) {
    const data = readJson(path)
    if (!data.id || TITLES.has(data.kind)) continue
    const filenameCode = basename(path, '.json')
    const parsedFile = CODE.exec(filenameCode)
    const parsedId = CODE.exec(data.id)
    const candidate = parsedId ? data.id : parsedFile?.[0]
    if (!candidate) fail(`cannot derive a media code from ${relative(ROOT, path)} (id: ${data.id})`)
    manifests.push({
      path,
      data,
      topic: basename(dirname(path)),
      sourceId: sourceForManifest(data),
      lang: data.lang ?? '',
      candidate
    })
  }

  const sourceGroups = new Map()
  for (const item of manifests) {
    const groupKey = key(item.topic, item.sourceId)
    const group = sourceGroups.get(groupKey) ?? {
      topic: item.topic,
      sourceId: item.sourceId,
      members: []
    }
    group.members.push(item)
    sourceGroups.set(groupKey, group)
  }

  const sidebars = walkFiles(SIDEBARS, (path) => basename(path) === 'sidebar.json').map((path) => ({
    path,
    data: readJson(path)
  }))
  const referenced = new Map()
  for (const sidebar of sidebars) {
    for (const section of sidebar.data.sections ?? []) {
      for (const topic of section.topics ?? []) {
        for (const id of topic.items ?? []) {
          const itemKey = key(topic.code, id)
          referenced.set(itemKey, (referenced.get(itemKey) ?? 0) + 1)
        }
      }
    }
  }

  const ownersByCode = new Map()
  for (const group of sourceGroups.values()) {
    const preferred = [...group.members].sort((a, b) => {
      const priority = (lang) => (lang === 'ro' ? 0 : lang === 'en' ? 1 : 2)
      return priority(a.lang) - priority(b.lang) || a.lang.localeCompare(b.lang)
    })[0]
    group.code = preferred.candidate
    const codeKey = key(group.topic, group.code)
    const owners = ownersByCode.get(codeKey) ?? []
    owners.push(group)
    ownersByCode.set(codeKey, owners)
  }

  const maxByTopicPrefix = new Map()
  for (const group of sourceGroups.values()) {
    const parsed = CODE.exec(group.code)
    const counterKey = key(group.topic, parsed[1])
    maxByTopicPrefix.set(counterKey, Math.max(maxByTopicPrefix.get(counterKey) ?? 0, Number(parsed[2])))
  }
  for (const sidebar of sidebars) {
    for (const section of sidebar.data.sections ?? []) {
      for (const topic of section.topics ?? []) {
        for (const [lang, counts] of Object.entries(topic.lastIndex ?? {})) {
          for (const [type, value] of Object.entries(counts ?? {})) {
            const prefix = type === 'audio' ? 'A' : type === 'video' ? 'V' : type === 'image' ? 'P' : null
            if (prefix && Number.isFinite(value)) {
              const counterKey = key(topic.code, prefix)
              maxByTopicPrefix.set(counterKey, Math.max(maxByTopicPrefix.get(counterKey) ?? 0, value))
            }
          }
        }
      }
    }
  }

  const remappedCollisions = []
  for (const [codeKey, owners] of ownersByCode) {
    if (owners.length < 2) continue
    const topic = owners[0].topic
    owners.sort((a, b) => {
      const aRefs = referenced.get(key(topic, a.sourceId)) ?? 0
      const bRefs = referenced.get(key(topic, b.sourceId)) ?? 0
      if (aRefs !== bRefs) return bRefs - aRefs
      const aRo = a.members.some((member) => member.lang === 'ro')
      const bRo = b.members.some((member) => member.lang === 'ro')
      if (aRo !== bRo) return aRo ? -1 : 1
      return a.sourceId.localeCompare(b.sourceId)
    })
    for (const group of owners.slice(1)) {
      const parsed = CODE.exec(group.code)
      const counterKey = key(topic, parsed[1])
      const next = (maxByTopicPrefix.get(counterKey) ?? 0) + 1
      maxByTopicPrefix.set(counterKey, next)
      const replacement = `${parsed[1]}${String(next).padStart(3, '0')}`
      remappedCollisions.push(`${topic}: ${group.code} (${group.sourceId}) -> ${replacement}`)
      group.code = replacement
    }
    ownersByCode.set(codeKey, [owners[0]])
    for (const group of owners.slice(1)) {
      const replacementKey = key(topic, group.code)
      const replacementOwners = ownersByCode.get(replacementKey) ?? []
      replacementOwners.push(group)
      ownersByCode.set(replacementKey, replacementOwners)
    }
  }

  const idMap = new Map()
  for (const group of sourceGroups.values()) {
    const oldIds = new Set([group.sourceId, ...group.members.map((member) => member.data.id)])
    for (const oldId of oldIds) {
      const mapKey = key(group.topic, oldId)
      const existing = idMap.get(mapKey)
      if (existing && existing !== group.code) {
        fail(`ambiguous id '${oldId}' in topic ${group.topic}: ${existing} vs ${group.code}`)
      }
      idMap.set(mapKey, group.code)
    }
  }
  const entityIdByTopicCode = new Map(
    [...sourceGroups.values()].map((group) => [
      key(group.topic, group.code),
      `${group.topic}:${group.code}`
    ])
  )
  const termsByTopicCode = new Map()
  for (const group of sourceGroups.values()) {
    const terms = {}
    for (const member of group.members) {
      for (const [locale, term] of Object.entries(member.data.names ?? {})) {
        if (typeof term === 'string' && term) terms[locale] ??= term
      }
    }
    termsByTopicCode.set(key(group.topic, group.code), terms)
  }

  const manifestChanges = manifests.filter((item) => {
    const group = sourceGroups.get(key(item.topic, item.sourceId))
    return item.data.id !== group.code ||
      item.data.entity_id !== `${item.topic}:${group.code}` ||
      item.data.legacy_entity_id !== item.sourceId
  })
  const sidebarChanges = []
  for (const sidebar of sidebars) {
    let changed = false
    for (const section of sidebar.data.sections ?? []) {
      for (const topic of section.topics ?? []) {
        topic.items = (topic.items ?? []).map((id) => {
          const replacement = idMap.get(key(topic.code, id))
          if (replacement && replacement !== id) changed = true
          return replacement ?? id
        })
      }
    }
    if (changed) sidebarChanges.push(sidebar)
  }

  const contentFiles = walkFiles(CONTENT, (path) => path.endsWith('.md'))
  const contentChanges = []
  const destinationSources = new Map()
  for (const path of contentFiles) {
    const parts = relative(CONTENT, path).split(/[\\/]/)
    const isDictionary = parts[0] === 'dictionary' && parts.length === 4
    const topic = isDictionary ? parts[1] : parts.length === 5 ? parts[2] : null
    const articleId = isDictionary ? parts[2] : parts.length === 5 ? parts[3] : null
    if (!topic || !articleId) continue
    const replacement = idMap.get(key(topic, articleId)) ?? articleId
    const entityId = entityIdByTopicCode.get(key(topic, replacement))
    const raw = readFileSync(path, 'utf8')
    const parsed = grayMatter(raw)
    let changed = replacement !== articleId ||
      (entityId !== undefined && parsed.data.entity_id !== entityId)

    parsed.data.article = replacement
    if (entityId) parsed.data.entity_id = entityId
    if (Array.isArray(parsed.data.related)) {
      parsed.data.related = parsed.data.related.map((id) => idMap.get(key(topic, id)) ?? id)
    }
    if (isDictionary) {
      const terms = termsByTopicCode.get(key(topic, replacement))
      if (terms && JSON.stringify(parsed.data.terms) !== JSON.stringify(terms)) {
        parsed.data.terms = terms
        changed = true
      }
      if (terms) {
        const title = replaceVariants(parsed.data.title ?? '', terms, '{{term}}')
        const body = replaceBoldTerms(parsed.content, terms)
        if (title !== parsed.data.title || body !== parsed.content) changed = true
        parsed.data.title = title
        parsed.content = body
      }
    }
    if (!changed) continue
    const actualDestination = join(dirname(dirname(path)), replacement, parts.at(-1))
    const collisionSource = destinationSources.get(actualDestination)
    if (collisionSource && collisionSource !== path) {
      fail(`multiple article docs target ${relative(ROOT, actualDestination)}`)
    }
    destinationSources.set(actualDestination, path)
    contentChanges.push({
      path,
      destination: actualDestination,
      data: parsed.data,
      body: parsed.content,
      isDictionary
    })
  }

  const canonicalByArticle = new Map()
  for (const change of contentChanges) {
    const parts = relative(CONTENT, change.path).split(/[\\/]/)
    const isDictionary = parts[0] === 'dictionary' && parts.length === 4
    const locale = parts.at(-1).replace(/\.md$/, '')
    const topic = isDictionary ? parts[1] : parts[2]
    if (isDictionary && locale === 'en') {
      canonicalByArticle.set(key(topic, change.data.article), grayMatter.stringify(change.body, change.data))
    }
  }
  for (const change of contentChanges) {
    const parts = relative(CONTENT, change.path).split(/[\\/]/)
    const isDictionary = parts[0] === 'dictionary' && parts.length === 4
    const locale = parts.at(-1).replace(/\.md$/, '')
    const topic = isDictionary ? parts[1] : parts[2]
    const canonical = isDictionary ? canonicalByArticle.get(key(topic, change.data.article)) : null
    if (canonical && locale !== 'en' && change.data.sourceSha) {
      change.data.sourceSha = createHash('sha1').update(canonical).digest('hex')
    }
    change.output = grayMatter.stringify(change.body, change.data)
  }

  for (const change of contentChanges) {
    if (existsSync(change.destination) && change.path !== change.destination) {
      fail(`article destination already exists: ${relative(ROOT, change.destination)}`)
    }
  }

  console.log(`media-reid-manifests${apply ? '' : ' (DRY RUN)'}: ${manifestChanges.length} manifest(s), ${sidebarChanges.length} sidebar(s), ${contentChanges.length} article(s)`)
  for (const collision of remappedCollisions) console.log(`  collision: ${collision}`)
  if (!apply) {
    console.log('dry run — nothing written. Re-run with --apply to perform the migration.')
    return
  }

  for (const change of contentChanges) {
    mkdirSync(dirname(change.destination), { recursive: true })
    writeFileSync(change.destination, change.output)
  }
  for (const change of contentChanges) {
    if (existsSync(change.path) && change.path !== change.destination) {
      unlinkSync(change.path)
    }
  }
  for (const directory of new Set(contentChanges.map((change) => dirname(change.path)))) {
    try {
      rmdirSync(directory)
    } catch (error) {
      if (error.code !== 'ENOTEMPTY' && error.code !== 'ENOENT') throw error
    }
  }

  for (const item of manifestChanges) {
    const group = sourceGroups.get(key(item.topic, item.sourceId))
    item.data.legacy_entity_id ??= item.sourceId
    item.data.entity_id = `${item.topic}:${group.code}`
    item.data.id = group.code
    writeFileSync(item.path, JSON.stringify(item.data, null, 2) + '\n')
  }
  for (const sidebar of sidebarChanges) {
    writeFileSync(sidebar.path, JSON.stringify(sidebar.data, null, 2) + '\n')
  }
  console.log('Migration complete. Media filenames, R2 keys, and audio bytes were not changed.')
}

main()
