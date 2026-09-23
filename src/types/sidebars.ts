import type { GalleryNames } from './gallery'

/**
 * Sidebar types — the structure layer (src/data/sidebars/**). Sidebars are
 * build-inlined (like navigation.json) and carry NO item text: items are ids
 * resolved against the gallery repository (per-file manifests) or the legacy
 * entity bridge at build time.
 */

export interface SidebarTopic {
  /** Topic code, e.g. 'C1T01'. */
  code: string
  names: GalleryNames
  /** Gallery file ids (manifest ids, or legacy entity ids) in display order. */
  items: string[]
}

export interface SidebarSection {
  /** Chapter/section code, e.g. 'C1'. */
  code: string
  names: GalleryNames
  topics: SidebarTopic[]
}

export interface Sidebar {
  /** Section id = the folder path, e.g. 'library/dictionary' / 'practice/games'. */
  id: string
  names: GalleryNames
  /** One-line description per locale (used by the Practice preview cards). */
  descriptions?: GalleryNames
  sections: SidebarSection[]
}

/** Gallery location config (src/data/gallery.config.json) — hand-maintained. */
export interface GalleryConfig {
  /** R2 root, e.g. 'https://media.verbologic.com/'. */
  root: string
  /** Sidebar id → repository path under the root, e.g. 'library/dictionary' → 'audio/'. */
  sections: Record<string, string>
}

/** Runtime index (public/data/gallery/index.json) — counts + progress in one fetch. */
export interface GalleryIndex {
  schema: number
  generated: string
  /** section → topic code → lang → record count. */
  counts: Record<string, Record<string, Record<string, number>>>
  /** section → topic code → lang → entity ids (bulk check-all/reset scopes). */
  ids: Record<string, Record<string, Record<string, string[]>>>
  /** entity_id → topic code (joins useProgress' learned ids to topics). */
  progress: Record<string, string>
}