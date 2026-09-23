/**
 * useTitles — chapter/topic title audio lookup (shared module state).
 * Titles live at gallery/audio/<lang>/<CODE>/<CODE>.mp3 next to a <CODE>.json
 * manifest (kind: 'chapter-title' | 'topic-title'); the gallery indexer will
 * emit public/data/gallery/library/dictionary/titles.json (GalleryTitles).
 * Until that payload exists the fetch fails and every lookup returns null, so
 * title rows render the standard disabled "Audio coming soon" play button —
 * dropping the payload in is enough to light the buttons up, no code change.
 */
import type { GalleryMedia, GalleryTitles } from '~/types/gallery'

const EMPTY: GalleryTitles = { schema: 0, generated: '', chapters: {}, topics: {} }

// Module-level singleton — one fetch shared by every consumer.
const titles = ref<GalleryTitles>({ ...EMPTY })
let requested = false

function request() {
  if (requested) return
  requested = true
  $fetch<GalleryTitles>('/data/gallery/library/dictionary/titles.json')
    .then((data) => {
      titles.value = data
    })
    .catch(() => {
      // Payload not generated yet — titles stay "coming soon"; retry later.
      requested = false
    })
}

export function useTitles() {
  request()

  /** Media for one chapter/topic code in the target language (null = none yet). */
  function media(code: string, lang: string): GalleryMedia | null {
    return titles.value.chapters[code]?.[lang] ?? titles.value.topics[code]?.[lang] ?? null
  }

  return { media }
}