/**
 * Gallery runtime types — mirrors public/data/gallery/**, built by
 * scripts/gallery-index.mjs from the src/data/sidebars structure, the gallery
 * per-file manifests and the legacy entity bridge.
 */

export type GallerySource = 'legacy' | 'gallery'

/** Localized names keyed by UI locale (canonical order: en, ro, de, ru, it, es, fr, hu, pt). */
export type GalleryNames = Record<string, string>

/** Media descriptor — R2 URL plus delivery facts (prefix always matches the section's path). */
export interface GalleryMedia {
  /** R2 media URL (config root + key), or null while upload is pending. */
  url: string | null
  mime: string
  bytes: number
  sha1: string | null
}

/** One row in a topic table (dictionary word, lecture video, story image). */
export interface GalleryRecord {
  id: string
  /** Sidebar section the record belongs to, e.g. 'library/dictionary'. */
  section: string
  /** Content class for the row badge (word/sentence/letter/…), or null. */
  kind: string | null
  /** Target language of the record ('ro', 'en', …). */
  lang: string
  source: GallerySource
  /** Text in the target language. */
  term: string
  /** Localized glosses; names[lang] === term. */
  names: GalleryNames
  ipa: string | null
  media: GalleryMedia
  tags: string[]
  /** Register/usage note (optional manifest field, e.g. 'hard c'). */
  context: string | null
  /** Example usage (optional manifest field, e.g. the word the letter sounds in). */
  example: string | null
  /** Topic code the record belongs to, e.g. 'C1T01'. */
  topic: string
  /** Progress join key (learned_items.entity_id). */
  entity_id: string
}

export type GalleryRecords = GalleryRecord[]

/**
 * Chapter/topic title media (public/data/gallery/<section>/titles.json — the
 * pending titles payload). Keyed by sidebar code, then target language; absent
 * entries render the standard disabled "Audio coming soon" play button.
 */
export interface GalleryTitles {
  schema: number
  generated: string
  /** Chapter code (e.g. 'C1') → lang → media. */
  chapters: Record<string, Record<string, GalleryMedia>>
  /** Topic code (e.g. 'C1T01') → lang → media. */
  topics: Record<string, Record<string, GalleryMedia>>
}
