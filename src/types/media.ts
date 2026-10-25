/**
 * Media runtime types — mirrors public/data/media/**, built by
 * scripts/media-index.mjs from the src/data/sidebars structure, the media
 * per-file manifests and the legacy entity bridge.
 *
 * Payloads are minified and carry only what the client reads (no `sha1`,
 * `bytes`, `source`, `section`, no build timestamp) — see
 * planning/performance-and-content-refactor.md §3 phase 1.
 */

/** Localized names keyed by UI locale (canonical order: en, ro, de, ru, it, es, fr, hu, pt).
 *  A locale with no translation yet is `null` in the manifests — every consumer
 *  must treat a missing/null entry as "no gloss", never assume a string. */
export type MediaNames = Record<string, string | null>

/** Media descriptor — R2 URL plus the delivery fact the viewers switch on. */
export interface MediaMedia {
  /** R2 media URL (config root + key), or null while upload is pending. */
  url: string | null
  /** Present on topic records (video/image viewers); absent on title audio. */
  mime?: string
}

/** One row in a topic table (dictionary word, lecture video, story image). */
export interface MediaRecord {
  /** Topic-scoped content code (for example, A023), shared across languages. */
  id: string
  /** Content class for the row badge (word/sentence/letter/…), or null. */
  kind?: string | null
  /** Target language of the record ('ro', 'en', …). */
  lang: string
  /** Text in the target language. */
  term: string
  /** Localized glosses; names[lang] === term. */
  names: MediaNames
  ipa?: string | null
  media: MediaMedia
  /**
   * Full-article read recording for this record's language
   * (`media/<track>/…/read/<locale>.mp3`). Null when the manifest has no read
   * map or the recording is still pending.
   */
  read?: MediaMedia | null
  /**
   * Every locale's read recording, keyed by locale.
   *
   * A directional topic emits ONE record (its target language) but its article
   * is explained in all nine locales, each with its own recording. The article
   * page picks the panel's language from here; `read` alone would leave the
   * other eight panels without a Read button.
   */
  reads?: Record<string, string> | null
  /**
   * Per-locale start offset (seconds) of each reading page in that locale's
   * recording. The article paginates one `##` section per page, so the player
   * seeks to `readSections[locale][page]` instead of replaying from the start.
   * Absent on recordings generated before this existed — the player then
   * starts at 0, exactly as before.
   */
  readSections?: Record<string, number[]> | null
  tags?: string[]
  /** Register/usage note (optional manifest field, e.g. 'hard c'). */
  context?: string | null
  /** Example usage (optional manifest field, e.g. the word the letter sounds in). */
  example?: string | null
  /** Topic code the record belongs to, e.g. 'C1T01'. */
  topic: string
  /** Language-independent progress identity: `<TOPIC>:<CODE>`. */
  entity_id: string
  /** Content docs (lectures/stories) — present only on content-backed records. */
  content?: ContentMeta
  /** Related records embedded at build time from the doc's front matter. */
  related?: MediaRow[]
}

export type MediaRecords = MediaRecord[]

/** Content docs (dictionary/lecture/story front matter) joined onto a media record. */
export interface ContentMeta {
  /** Locale of the canonical document ('en' for lectures, the track language for stories). */
  canonical: string
  /** Locales that have a document — absence means "not translated yet". */
  locales: string[]
  summary?: string | null
  order?: number
  minutes?: number | null
  /** Media manifest id of the embedded video, when the record has one. */
  video?: string | null
}

/**
 * Minimal row contract shared by the per-topic payloads (MediaRecord) and the
 * section search index (MediaSearchIndex) — exactly the fields the dictionary
 * table renders. MediaRecord is structurally assignable to it (MediaMedia is
 * a supertype of `{ url }`), so one row pipeline serves both sources.
 */
export interface MediaRow {
  /** Topic-scoped content code (for example, A023), shared across languages. */
  id: string
  /** Topic code the row belongs to, e.g. 'C3T01' (the search-results chip). */
  topic: string
  /** Language-independent progress identity: `<TOPIC>:<CODE>`. */
  entity_id: string
  /** Target language of the row ('ro', 'en', …). */
  lang: string
  term: string
  names: MediaNames
  ipa?: string | null
  context?: string | null
  /** Example word the row illustrates (phonetic rows: "Apfel" for the letter A). */
  example?: string | null
  media: { url: string | null }
  /** Full-article read recording for the row's language (null while pending). */
  read?: { url: string | null } | null
  /** Article docs — any row (word, expression, story…) may carry one; the
   *  table shows a read button when present. */
  content?: ContentMeta
}

/**
 * public/data/media/<section>/search.json — every record of one sidebar
 * section in a single payload (both target languages; the store filters by
 * the track language), powering the dictionary-wide translation search.
 */
export interface MediaSearchIndex {
  schema: number
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
  /** Chapter code (e.g. 'C1') → lang → media. */
  chapters: Record<string, Record<string, MediaMedia>>
  /** Topic code (e.g. 'C1T01') → lang → media. */
  topics: Record<string, Record<string, MediaMedia>>
}
