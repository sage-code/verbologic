/**
 * useGallery — loads the gallery runtime payloads (public/data/gallery/**).
 * Client-only fetching (call from onMounted) so SSG prerendering never hits a
 * static-file 404; results are cached like useEntities/usePrices, with failed
 * lookups evicted so a later call retries instead of replaying the rejection.
 */
import type { GalleryRecords } from '~/types/gallery'
import type { GalleryIndex } from '~/types/sidebars'

const indexCache = new Map<string, Promise<GalleryIndex>>()
const topicCache = new Map<string, Promise<GalleryRecords>>()

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

export function useGallery() {
  /** One-fetch runtime index: counts[section][topic][lang] + progress {entity_id: topic}. */
  const fetchIndex = () =>
    cached(indexCache, 'index', () => $fetch<GalleryIndex>('/data/gallery/index.json'))

  /** Records for one sidebar section + topic (lazy, one small fetch). */
  const fetchTopic = (section: string, topic: string) =>
    cached(topicCache, `${section}:${topic}`, () =>
      $fetch<GalleryRecords>(`/data/gallery/${section}/${topic}.json`)
    )

  return { fetchIndex, fetchTopic }
}

/**
 * Display name for a localized-names map: the UI language first, then the
 * English canonical, then the fallback (usually the code itself).
 */
export function galleryName(names: Record<string, string> | undefined, uiLang: string, fallback: string): string {
  if (!names) return fallback
  return names[uiLang] || names.en || fallback
}
