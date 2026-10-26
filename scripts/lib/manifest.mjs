/**
 * Manifest accessors for the `locales` + `files` shape.
 *
 * planning/performance-and-content-refactor.md §21: an item.json carries
 *
 *   locales: { <locale>: { name, description, ipa, ttsText, example, context } }
 *   files:   { "<folder>/<locale>.mp3": { bytes, sha1 } }
 *   images:  [ { file, bytes, sha1, page } ]
 *
 * `locales` is keyed by locale — one self-contained row each. `files` is keyed
 * by path and holds only the two facts that cannot be derived; a file's
 * presence IS its published status.
 *
 * `images` is a LIST, not a locale map: a story's illustrations are shared by
 * every language it is translated into, so they are generated once and reused.
 * `page` is the reading page the picture first appears on.
 *
 * Every script goes through this module so the shape is defined once.
 */

/** Manifest field → the folder its files live in. */
export const FOLDER = { audio: 'sound', read: 'read' }

/** The path a field's file for one locale lives at, relative to the item dir. */
export const filePath = (field, locale) => `${FOLDER[field]}/${locale}.mp3`

/** The path an illustration lives at, relative to the item dir. */
export const imagePath = (index) => `images/${index}.jpg`

/** The locale row, or an empty object when the locale has no content. */
export const localeRow = (item, locale) => item.locales?.[locale] ?? {}

/** A locale's display name (the old `names[locale]`). */
export const nameOf = (item, locale) => localeRow(item, locale).name

/** Every locale the item has a row for, in the item's own order. */
export const localesOf = (item) => Object.keys(item.locales ?? {})

/** The file facts for one field+locale, or null when the file is pending. */
export function fileFacts(item, field, locale) {
  return item.files?.[filePath(field, locale)] ?? null
}

/** True when the field's file for this locale has been published. */
export const isPublished = (item, field, locale) => fileFacts(item, field, locale) !== null

/**
 * The old descriptor shape, synthesized from `files` — for the code paths that
 * still think in terms of file/key/mime/bytes/sha1/status (media-sync's
 * differential baseline). `key` is left to the caller, which knows the item
 * directory; `file` is the path within it.
 */
export function descriptor(item, field, locale) {
  const path = filePath(field, locale)
  const facts = item.files?.[path]
  if (!facts) {
    return { file: null, key: null, mime: 'audio/mpeg', bytes: null, sha1: null, status: 'pending' }
  }
  return {
    file: path,
    key: null,
    mime: 'audio/mpeg',
    bytes: facts.bytes,
    sha1: facts.sha1,
    status: 'published'
  }
}

/** Record a published file. `facts` needs `bytes` and `sha1`. */
export function setFileFacts(item, field, locale, facts) {
  item.files ??= {}
  item.files[filePath(field, locale)] = { bytes: facts.bytes, sha1: facts.sha1 }
}

/** Drop a file (back to pending). */
export function clearFileFacts(item, field, locale) {
  if (item.files) delete item.files[filePath(field, locale)]
}

/** Set one locale field, creating the row when needed. Empty values are dropped. */
export function setLocaleField(item, locale, field, value) {
  if (value === null || value === undefined || value === '') {
    if (item.locales?.[locale]) {
      delete item.locales[locale][field]
      if (Object.keys(item.locales[locale]).length === 0) delete item.locales[locale]
    }
    return
  }
  item.locales ??= {}
  item.locales[locale] ??= {}
  item.locales[locale][field] = value
}

/** Every published file as `{ field, locale, path, bytes, sha1 }`. */
export function publishedFiles(item) {
  const out = []
  for (const [path, facts] of Object.entries(item.files ?? {})) {
    const [folder, base] = path.split('/')
    const field = Object.keys(FOLDER).find((f) => FOLDER[f] === folder)
    if (!field) continue
    out.push({ field, locale: base.replace(/\.mp3$/, ''), path, bytes: facts.bytes, sha1: facts.sha1 })
  }
  return out
}

/**
 * How many illustrations every story gets — the same at every level. Three
 * pictures change as the reader advances through the first three pages.
 * Mirrors STORY_IMAGE_COUNT in scripts/generate-story-images.py.
 */
export const STORY_IMAGE_COUNT = 3

/** The item's illustrations, in page order. */
export const imagesOf = (item) => item.images ?? []

/** Record one illustration. `facts` needs `bytes` and `sha1`. */
export function setImageFacts(item, index, page, facts) {
  item.images ??= []
  const path = imagePath(index)
  const existing = item.images.find((image) => image.file === path)
  if (existing) {
    Object.assign(existing, { bytes: facts.bytes, sha1: facts.sha1, page })
    return
  }
  item.images.push({ file: path, bytes: facts.bytes, sha1: facts.sha1, page })
  item.images.sort((a, b) => a.page - b.page)
}
