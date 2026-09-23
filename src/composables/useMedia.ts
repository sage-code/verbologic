/**
 * useMedia — loads the media runtime payloads (public/data/media/**).
 * Client-only fetching (call from onMounted) so SSG prerendering never hits a
 * static-file 404; results are cached like useEntities/usePrices, with failed
 * lookups evicted so a later call retries instead of replaying the rejection.
 */
import type { MediaRecords, MediaSearchIndex } from '~/types/media'
import type { MediaIndex } from '~/types/sidebars'

const indexCache = new Map<string, Promise<MediaIndex>>()
const topicCache = new Map<string, Promise<MediaRecords>>()
const searchCache = new Map<string, Promise<MediaSearchIndex>>()

function cached<K, V>(cache: Map<K, Promise<V>>, key: K, load: () => Promise<V>): Promise<V> {
  const hit = cache.get(key)
  if (hit) return hit
  const pending = load().catch((error) => {
    cache.delete(key) // evict failures — a later call retries
    throw error
  })
  cache.set(key, pending)
  return pending
}

export function useMedia() {
  /** One-fetch runtime index: counts[section][topic][lang] + progress {entity_id: topic}. */
  const fetchIndex = () =>
    cached(indexCache, 'index', () => $fetch<MediaIndex>('/data/media/index.json'))

  /** Records for one sidebar section + topic (lazy, one small fetch). */
  const fetchTopic = (section: string, topic: string) =>
    cached(topicCache, `${section}:${topic}`, () =>
      $fetch<MediaRecords>(`/data/media/${section}/${topic}.json`)
    )

  /**
   * Dictionary-wide search payload for one sidebar section (lazy, one fetch):
   * every record in one file — the translation search loads it on demand.
   */
  const fetchSearch = (section: string) =>
    cached(searchCache, section, () => $fetch<MediaSearchIndex>(`/data/media/${section}/search.json`))

  return { fetchIndex, fetchTopic, fetchSearch }
}

/**
 * Display name for a localized-names map: the UI language first, then the
 * English canonical, then the fallback (usually the code itself).
 */
export function mediaName(names: Record<string, string> | undefined, uiLang: string, fallback: string): string {
  if (!names) return fallback
  return names[uiLang] || names.en || fallback
}
