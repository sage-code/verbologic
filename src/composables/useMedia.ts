/**
 * useMedia — loads the media runtime payloads (public/data/media/**).
 * Client-only fetching (call from onMounted) so SSG prerendering never hits a
 * static-file 404; results are cached like useEntities/usePrices, with failed
 * lookups evicted so a later call retries instead of replaying the rejection.
 *
 * ## The database seam (Phase 6)
 *
 * Content comes from Supabase's `units` table when it is reachable, and from the
 * bundled payloads when it is not. These three functions are the ONLY place the
 * client reads content, so the branch lives here and nowhere else:
 *
 *   online   → useContentDb() queries the table (a page of rows, ~1.4 KB)
 *   offline  → the bundled payloads (the English fallback the site ships)
 *
 * The bundled payloads are therefore load-bearing, not dead weight: they are the
 * offline mode. That is why they are not deleted.
 */
import type { MediaRecords, MediaRow, MediaSearchIndex } from '~/types/media'
import type { MediaIndex } from '~/types/sidebars'
import { localizeMediaRecords, localizeMediaSearch } from '~/lib/localMedia'

const indexCache = new Map<string, Promise<MediaIndex>>()
const topicCache = new Map<string, Promise<MediaRecords>>()
/** The bundled search payload only — the DB search is not cached (see fetchSearch). */
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

/** `library/dictionary` → `dictionary` (the `units.track` value). */
function trackOf(section: string): string {
  return section.includes('/') ? section.split('/').pop()! : section
}

export function useMedia() {
  const db = useContentDb()

  /** One-fetch runtime index: counts[section][topic][lang] + progress {entity_id: topic}. */
  const fetchIndex = () =>
    cached(indexCache, 'index', () => $fetch<MediaIndex>('/data/media/index.json'))

  /**
   * Records for one sidebar section + topic, in one language.
   *
   * Online: the `units` page query. Offline (or on any query failure): the
   * bundled payload, filtered to the requested language — which is exactly the
   * English fallback when the database is down.
   */
  const fetchTopic = (section: string, topic: string, locale?: string) =>
    cached(topicCache, `${section}:${topic}:${locale ?? '*'}`, async () => {
      if (locale) {
        const rows = await db.fetchTopicPage(trackOf(section), topic, locale)
        if (rows) return rows as MediaRecords
      }
      const bundled = await $fetch<MediaRecords>(`/data/media/${section}/${topic}.json`).then(
        localizeMediaRecords
      )
      return locale ? bundled.filter((r) => r.lang === locale) : bundled
    })

  /**
   * Dictionary-wide search for one section + language.
   *
   * Online: a `pg_trgm` query against `units.search_text` (folded, so it matches
   * across diacritics and translations). Offline: the bundled search payload —
   * the 2.1 MB file that Phase 6 exists to stop shipping on the happy path.
   *
   * NOT cached: the query changes on every keystroke, so a cache keyed by query
   * would grow without bound, and caching a fallback result would pin the
   * offline answer for that query even after the database came back.
   */
  const fetchSearch = async (section: string, locale?: string, query?: string): Promise<MediaRow[]> => {
    if (locale && query && query.trim()) {
      const rows = await db.search(trackOf(section), locale, query)
      if (rows) return rows
    }
    const bundled = await cached(searchCache, section, () =>
      $fetch<MediaSearchIndex>(`/data/media/${section}/search.json`).then(localizeMediaSearch)
    )
    return locale ? bundled.records.filter((r) => r.lang === locale) : bundled.records
  }

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
