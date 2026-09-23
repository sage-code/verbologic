/**
 * useSidebars — build-inlined access to the sidebar structure layer
 * (src/data/sidebars/**). Sidebars carry sections → topics → item ids and
 * localized section names — never item text (that lives in the media
 * per-file manifests, resolved at build time by scripts/media-index.mjs).
 *
 * Inlining (the navigation.json pattern) means zero runtime fetches for the
 * structure and no first-paint flash.
 */
import type { Sidebar } from '~/types/sidebars'

import dictionary from '~/data/sidebars/library/dictionary/sidebar.json'
import lectures from '~/data/sidebars/library/lectures/sidebar.json'
import stories from '~/data/sidebars/library/stories/sidebar.json'
import mentors from '~/data/sidebars/practice/mentors/sidebar.json'
import exercises from '~/data/sidebars/practice/exercises/sidebar.json'
import games from '~/data/sidebars/practice/games/sidebar.json'

const SIDEBARS = [dictionary, lectures, stories, mentors, exercises, games] as Sidebar[]

export function useSidebars() {
  /** The sidebar for a section id (e.g. 'library/dictionary') — throws if unknown. */
  function get(id: string): Sidebar {
    const sidebar = SIDEBARS.find((s) => s.id === id)
    if (!sidebar) throw new Error(`[sidebars] unknown section '${id}'`)
    return sidebar
  }

  /** All sidebars (registry order: library tracks, then practice modes). */
  const all = (): Sidebar[] => SIDEBARS

  /** The practice-mode sidebars (mentors · exercises · games). */
  const practice = (): Sidebar[] => SIDEBARS.filter((s) => s.id.startsWith('practice/'))

  return { get, all, practice }
}