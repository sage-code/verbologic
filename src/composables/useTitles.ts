/**
 * useTitles — chapter/topic title audio lookup (shared module state).
 *
 * Titles live at media/<track>/<chapter>/<topic>/<code>/item.json with a title
 * kind ('chapter-title' | 'topic-title' | 'story-chapter' | 'story-topic') and
 * a per-locale `audio` map. The media indexer emits one payload per track —
 * public/data/media/<section>/titles.json — so each track's chapter and topic
 * tables light up their own title buttons. Title codes are globally unique
 * across tracks, so one lookup table per track is enough.
 *
 * Payloads are fetched lazily, once per track, and cached for the session.
 */
import type { MediaMedia, MediaTitles } from '~/types/media'

const EMPTY: MediaTitles = { schema: 0, generated: '', chapters: {}, topics: {} }

/** sectionPath (e.g. 'library/stories') -> titles payload. */
const bySection = ref<Record<string, MediaTitles>>({})
const requested = new Set<string>()

function request(section: string) {
  if (requested.has(section)) return
  requested.add(section)
  $fetch<MediaTitles>(`/data/media/${section}/titles.json`)
    .then((data) => {
      bySection.value = { ...bySection.value, [section]: data }
    })
    .catch(() => {
      // Payload not generated yet — titles stay "coming soon"; retry later.
      requested.delete(section)
    })
}

export function useTitles() {
  const store = useRoadmapStore()
  const section = computed(() => store.section)

  /**
   * Media for one chapter/topic code in the target language (null = none yet).
   * Reads the active track's payload; falls back to any loaded payload so a
   * code that only exists in another track still resolves.
   */
  function media(code: string, lang: string): MediaMedia | null {
    const own = bySection.value[section.value]
    const hit = own?.chapters[code]?.[lang] ?? own?.topics[code]?.[lang]
    if (hit) return hit
    for (const payload of Object.values(bySection.value) as MediaTitles[]) {
      const other = payload.chapters[code]?.[lang] ?? payload.topics[code]?.[lang]
      if (other) return other
    }
    return null
  }

  // Fetch the active track's payload on first use (and whenever the track changes).
  watch(
    section,
    (value: string | undefined) => {
      if (value) request(value)
    },
    { immediate: true }
  )

  return { media }
}
