import type { MediaNames } from './media'

/**
 * Sidebar types — the structure layer (src/data/sidebars/**). Sidebars are
 * build-inlined (like navigation.json) and carry NO item text: items are ids
 * resolved against the media repository (per-file manifests), the content
 * tree, or the legacy entity bridge at build time.
 */

/**
 * Topic layout kinds — the open topic's main pane is picked by THIS field,
 * never by the track: any of the three kinds can appear in any of the library
 * tracks (Dictionary · Lectures · Stories). Strictly one kind per topic —
 * scripts/validate-data.mjs enforces the per-kind item invariants:
 * - table   → every item resolves to a non-image record (audio/video rows)
 * - article → every item is a content doc (prose), no media manifests
 * - gallery → every item is an image manifest
 */
export const TOPIC_LAYOUTS = ['table', 'article', 'gallery'] as const
export type TopicLayout = (typeof TOPIC_LAYOUTS)[number]

export interface SidebarTopic {
  /** Topic code, e.g. 'C1T01'. */
  code: string
  names: MediaNames
  /** How the open topic renders its pane (TopicTable / TopicArticle / TopicGallery). */
  layout: TopicLayout
  /** Item ids (manifest ids, content doc ids, or legacy entity ids) in display order. */
  items: string[]
}

export interface SidebarSection {
  /** Chapter/section code, e.g. 'C1'. */
  code: string
  names: MediaNames
  topics: SidebarTopic[]
}

export interface Sidebar {
  /** Section id = the folder path, e.g. 'library/dictionary' / 'practice/games'. */
  id: string
  names: MediaNames
  /** One-line description per locale (used by the Practice preview cards). */
  descriptions?: MediaNames
  sections: SidebarSection[]
}

/** Media location config (src/data/media.config.json) — hand-maintained. */
export interface MediaConfig {
  /** R2 root, e.g. 'https://media.verbologic.com/'. */
  root: string
  /** Sidebar id → repository path under the root, e.g. 'library/dictionary' → 'audio/'. */
  sections: Record<string, string>
}

/** Runtime index (public/data/media/index.json) — counts + progress in one fetch. */
export interface MediaIndex {
  schema: number
  generated: string
  /** section → topic code → lang → record count. */
  counts: Record<string, Record<string, Record<string, number>>>
  /** section → topic code → lang → entity ids (bulk check-all/reset scopes). */
  ids: Record<string, Record<string, Record<string, string[]>>>
  /** entity_id → topic code (joins useProgress' learned ids to topics). */
  progress: Record<string, string>
}