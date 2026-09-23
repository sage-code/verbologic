/**
 * Media runtime types — mirrors public/data/media/**, built by
 * scripts/media-index.mjs from the src/data/sidebars structure, the media
 * per-file manifests and the legacy entity bridge.
 */

export type MediaSource = 'legacy' | 'media' | 'content'

/** Localized names keyed by UI locale (canonical order: en, ro, de, ru, it, es, fr, hu, pt). */
export type MediaNames = Record<string, string>

/** Media descriptor — R2 URL plus delivery facts (prefix always matches the section's path). */
export interface MediaMedia {
  /** R2 media URL (config root + key), or null while upload is pending. */
  url: string | null
  mime: string
  bytes: number
  sha1: string | null
}

/** One row in a topic table (dictionary word, lecture video, story image). */
export interface MediaRecord {
  id: string
  /** Sidebar section the record belongs to, e.g. 'library/dictionary'. */
  section: string
  /** Content class for the row badge (word/sentence/letter/…), or null. */
  kind: string | null
  /** Target language of the record ('ro', 'en', …). */
  lang: string
  source: MediaSource
  /** Text in the target language. */
  term: string
  /** Localized glosses; names[lang] === term. */
  names: MediaNames
  ipa: string | null
  media: MediaMedia
  tags: string[]
  /** Register/usage note (optional manifest field, e.g. 'hard c'). */
  context: string | null
  /** Example usage (optional manifest field, e.g. the word the letter sounds in). */
  example: string | null
  /** Topic code the record belongs to, e.g. 'C1T01'. */
  topic: string
  /** Progress join key (learned_items.entity_id). */
  entity_id: string
  /** Content docs (lectures/stories) — present only on content-backed records. */
  content?: ContentMeta
  /** Related records embedded at build time from the doc's front matter. */
  related?: MediaRow[]
}

export type MediaRecords = MediaRecord[]

/** Review state of one locale document of a content-backed record (lecture/story). */
export interface ContentDocState {
  status: 'draft' | 'reviewed'
  /** True when the canonical document changed after this translation was made. */
  stale: boolean
}

/** Content docs (content/** front matter) joined onto a media record. */
export interface ContentMeta {
  /** Locale of the canonical document ('en' for lectures, the track language for stories). */
  canonical: string
  /** One entry per existing doc — absence means "not translated yet". */
  locales: Record<string, ContentDocState>
  summary: string | null
  order: number
  minutes: number | null
  /** Media manifest id of the embedded video, when the record has one. */
  video: string | null
}

/**
 * Minimal row contract shared by the per-topic payloads (MediaRecord) and the
 * section search index (MediaSearchIndex) — exactly the fields the dictionary
 * table renders. MediaRecord is structurally assignable to it (MediaMedia is
 * a supertype of `{ url }`), so one row pipeline serves both sources.
 */
export interface MediaRow {
  id: string
  /** Topic code the row belongs to, e.g. 'C3T01' (the search-results chip). */
  topic: string
  /** Progress join key (learned_items.entity_id). */
  entity_id: string
  /** Target language of the row ('ro', 'en', …). */
  lang: string
  term: string
  names: MediaNames
  ipa: string | null
  context: string | null
  media: { url: string | null }
}

/**
 * public/data/media/<section>/search.json — every record of one sidebar
 * section in a single payload (both target languages; the store filters by
 * the track language), powering the dictionary-wide translation search.
 */
export interface MediaSearchIndex {
  schema: number
  generated: string
  section: string
  records: MediaRow[]
}

/**
 * Chapter/topic title media (public/data/media/<section>/titles.json — the
 * pending titles payload). Keyed by sidebar code, then target language; absent
 * entries render the standard disabled "Audio coming soon" play button.
 */
export interface MediaTitles {
  schema: number
  generated: string
  /** Chapter code (e.g. 'C1') → lang → media. */
  chapters: Record<string, Record<string, MediaMedia>>
  /** Topic code (e.g. 'C1T01') → lang → media. */
  topics: Record<string, Record<string, MediaMedia>>
}
