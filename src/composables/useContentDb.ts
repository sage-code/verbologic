/**
 * contentDb — the Supabase-backed content reads (Phase 6).
 *
 * The dictionary/lectures/stories content lives in the `units` table, one row
 * per (entity_id, locale). This module is the ONLY place the client queries it,
 * so the offline fallback lives in one place too: every function here returns
 * `null` when the database is unreachable, and the caller then uses the bundled
 * payloads (see useMedia).
 *
 * Why a page query and not the whole topic: the point of Phase 6 is that the
 * payload stops scaling with content. A page of 5 rows is ~1.4 KB over the
 * wire, against 24 KB for a whole topic payload and 2.1 MB for search.json.
 *
 * Row shape: `units` stores the shared 9-language `names` map once per row, so a
 * row already carries every gloss the table renders — no join needed.
 */
import type { MediaRow } from '~/types/media'
import type { ContentUnitRow } from '~/types/database'
import { fold } from '~/lib/dictionarySearch'

/** Columns the table renders. Kept explicit so the payload stays small. */
const UNIT_COLUMNS = 'entity_id, locale, topic, term, ipa, names, audio_url, read_url'

/** PostgREST caps a response at 1000 rows by default; pages are far smaller. */
const PAGE_LIMIT = 100

/** Map a `units` row onto the row contract the table already renders. */
export function unitToRow(unit: ContentUnitRow): MediaRow {
  // entity_id is `<TOPIC>:<CODE>`; the table's `id` is the code part.
  const code = unit.entity_id.includes(':') ? unit.entity_id.split(':').slice(1).join(':') : unit.entity_id
  return {
    id: code,
    topic: unit.topic,
    entity_id: unit.entity_id,
    lang: unit.locale,
    term: unit.term,
    names: (unit.names ?? {}) as Record<string, string | null>,
    ipa: unit.ipa,
    media: { url: unit.audio_url },
    read: unit.read_url ? { url: unit.read_url } : null
  }
}

export function useContentDb() {
  const supabase = useSupabase()
  const { markOffline } = useDbStatus()

  /**
   * One page of a topic's rows for one language.
   *
   * Returns `null` when the database is unavailable or the query fails, so the
   * caller can fall back to the bundled payload. An empty array is a real
   * answer ("this topic has no rows in this language") and is NOT a failure.
   */
  async function fetchTopicPage(
    track: string,
    topic: string,
    locale: string,
    { limit = PAGE_LIMIT, offset = 0 }: { limit?: number; offset?: number } = {}
  ): Promise<MediaRow[] | null> {
    if (!supabase || !import.meta.client) return null
    try {
      const { data, error } = await supabase
        .from('units')
        .select(UNIT_COLUMNS)
        .eq('track', track)
        .eq('topic', topic)
        .eq('locale', locale)
        .order('order', { ascending: true })
        .range(offset, offset + limit - 1)
      if (error) {
        markOffline()
        return null
      }
      return (data ?? []).map((row) => unitToRow(row as ContentUnitRow))
    } catch {
      markOffline()
      return null
    }
  }

  /**
   * Search one language's rows with `pg_trgm`.
   *
   * Queries `search_text`, NOT `term`: that column holds the diacritic-folded
   * term plus every folded translation, so it reproduces what the bundled
   * client search does — "mult" finds "mulțumesc", and "hello" finds the
   * Romanian row for "salut". A plain `ilike` on `term` misses both.
   *
   * The needle is folded the same way (lowercase, diacritics stripped) so the
   * two sides compare like for like.
   *
   * Returns `null` on failure so the caller can fall back to search.json.
   */
  async function search(
    track: string,
    locale: string,
    query: string,
    { limit = 200 }: { limit?: number } = {}
  ): Promise<MediaRow[] | null> {
    if (!supabase || !import.meta.client) return null
    const needle = fold(query)
    if (!needle) return []
    try {
      const { data, error } = await supabase
        .from('units')
        .select(UNIT_COLUMNS)
        .eq('track', track)
        .eq('locale', locale)
        .ilike('search_text', `%${needle}%`)
        .limit(limit)
      if (error) {
        markOffline()
        return null
      }
      return (data ?? []).map((row) => unitToRow(row as ContentUnitRow))
    } catch {
      markOffline()
      return null
    }
  }

  /**
   * Per-topic row counts for one track + language — the sidebar's "12 words"
   * badges and the chapter progress meter.
   *
   * One query for the whole track rather than one per topic: the counts are
   * small (a few hundred integers) and a per-topic query would be N round-trips.
   * Returns `null` on failure so the caller keeps the bundled index.
   */
  async function fetchCounts(track: string, locale: string): Promise<Record<string, number> | null> {
    if (!supabase || !import.meta.client) return null
    try {
      const { data, error } = await supabase
        .from('units')
        .select('topic')
        .eq('track', track)
        .eq('locale', locale)
        .limit(10_000)
      if (error) {
        markOffline()
        return null
      }
      const counts: Record<string, number> = {}
      for (const row of data ?? []) {
        const topic = (row as { topic: string }).topic
        counts[topic] = (counts[topic] ?? 0) + 1
      }
      return counts
    } catch {
      markOffline()
      return null
    }
  }

  return { fetchTopicPage, search, fetchCounts }
}
