/**
 * useMedia — loads the media runtime payloads (public/data/media/**).
 * Client-only fetching (call from onMounted) so SSG prerendering never hits a
 * static-file 404; results are cached like useEntities/usePrices, with failed
 * lookups evicted so a later call retries instead of replaying the rejection.
 *
 * ## The database seam (Phase 6)
 *
 * From Phase 6 the dictionary content comes from Supabase, queried one page at
 * a time. These three functions are the ONLY place the client reads content, so
 * they are the seam: `fetchTopic`/`fetchSearch` will query the `units` table and
 * fall back to the bundled payloads when the database is unreachable.
 *
 * Today they read the bundled payloads unconditionally, which is exactly the
 * fallback path — so the offline behaviour is already correct and Phase 6 only
 * adds the online branch. `useDbStatus()` is the flag that decides which branch
 * runs; it is not consulted here yet because there is only one branch.
 */
import type { MediaRecords, MediaSearchIndex } from '~/types/media'
import type { MediaIndex } from '~/types/sidebars'
import { localizeMediaRecords, localizeMediaSearch } from '~/lib/localMedia'

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

  /**
   * Records for one sidebar section + topic.
   *
   * The bundled payload is the offline fallback: it carries every language, so
   * the English content is always available even when the database is down.
   */
  const fetchTopic = (section: string, topic: string) =>
    cached(topicCache, `${section}:${topic}`, () =>
      $fetch<MediaRecords>(`/data/media/${section}/${topic}.json`).then(localizeMediaRecords)
    )

  /**
   * Dictionary-wide search payload for one sidebar section (lazy, one fetch):
   * every record in one file — the translation search loads it on demand.
   *
   * This is the 2.19 MB payload Phase 6 replaces with a `pg_trgm` query. It
   * stays as the offline fallback, which is why the file is not deleted yet.
   */
  const fetchSearch = (section: string) =>
    cached(searchCache, section, () =>
      $fetch<MediaSearchIndex>(`/data/media/${section}/search.json`).then(localizeMediaSearch)
    )

  return { fetchIndex, fetchTopic, fetchSearch }
}

/**
 * Display name for a localized-names map: the UI language first, then the
 * English canonical, then the fallback (usually the code itself). A locale
 * with no translation yet is `null` in the manifests, so both lookups are
 * null-safe.
 */
export function mediaName(
  names: Record<string, string | null> | undefined,
  uiLang: string,
  fallback: string
): string {
  if (!names) return fallback
  return names[uiLang] || names.en || fallback
}
