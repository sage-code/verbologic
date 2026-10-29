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
import type { ContentMeta, MediaRow } from '~/types/media'
import type { ContentUnitRow } from '~/types/database'
import { fold } from '~/lib/dictionarySearch'
import { LOCALES } from '~/data/locales'
import { useSidebars } from '~/composables/useSidebars'

/** Columns the table renders. Kept explicit so the payload stays small. */
const UNIT_COLUMNS = 'entity_id, locale, topic, term, ipa, names, audio_url, read_url'

/** PostgREST caps a response at 1000 rows by default; pages are far smaller. */
const PAGE_LIMIT = 100

/**
 * The `content` meta of a phonetic (alphabet) row, or null.
 *
 * A letter article is not Markdown — it renders from `src/data/alphabets`, so
 * its "which locales exist" answer comes from that data. Every authored entry
 * carries all nine locales, so the answer is simply "all of them"; reading the
 * sidebar (a few KB) rather than the alphabet files (6.7 MB) keeps the alphabet
 * data out of the main bundle, where only the article page needs it.
 */
function phoneticContentMeta(topic: string): ContentMeta | null {
  const { all } = useSidebars()
  for (const sidebar of all()) {
    for (const section of sidebar.sections) {
      for (const entry of section.topics) {
        if (entry.code !== topic) continue
        if (entry.phonetic !== true || entry.mode !== 'directional') return null
        return { canonical: 'en', locales: [...LOCALES], order: 0 }
      }
    }
  }
  return null
}

/**
 * Read-audio facts and story pictures that live only in the bundled payload.
 *
 * `units` has no `reads`/`readSections`/`images` columns, so a row built from the
 * database cannot carry them — but the article page needs them to pick the
 * panel's recording and to seek to the current page. This cache is filled from
 * the topic payload on first use and keyed by entity id.
 */
const readFacts = new Map<string, Partial<Pick<MediaRow, 'reads' | 'readSections' | 'images'>>>()

/** Remember a payload's read facts so DB-built rows can borrow them. */
export function rememberReadFacts(rows: MediaRow[]): void {
  for (const row of rows) {
    if (!row.reads && !row.readSections && !row.images) continue
    readFacts.set(row.entity_id, { reads: row.reads, readSections: row.readSections, images: row.images })
  }
}

/** Attach the payload's read facts to a DB-built row. */
function withReadFacts(row: MediaRow): MediaRow {
  const facts = readFacts.get(row.entity_id)
  if (!facts) return row
  return { ...row, reads: facts.reads ?? row.reads, readSections: facts.readSections ?? row.readSections, images: facts.images ?? row.images }
}

/** Map a `units` row onto the row contract the table already renders. */
export function unitToRow(unit: ContentUnitRow): MediaRow {
  // entity_id is `<TOPIC>:<CODE>`; the table's `id` is the code part.
  const code = unit.entity_id.includes(':') ? unit.entity_id.split(':').slice(1).join(':') : unit.entity_id
  return withReadFacts({
    id: code,
    topic: unit.topic,
    entity_id: unit.entity_id,
    lang: unit.locale,
    term: unit.term,
    names: (unit.names ?? {}) as Record<string, string | null>,
    ipa: unit.ipa,
    media: { url: unit.audio_url },
    read: unit.read_url ? { url: unit.read_url } : null
  })
}

export function useContentDb() {
  const supabase = useSupabase()
  const { markOffline } = useDbStatus()

  /**
   * Which locales have an article for each entity of a topic.
   *
   * `units` carries no `content` column, so the online path has to ask the
   * `articles` table — otherwise every row renders "No article yet" even when
   * the article exists. One query per topic, not per row.
   */
  async function articleLocales(topic: string): Promise<Map<string, string[]>> {
    return articleLocalesFor([topic])
  }

  /** `articleLocales` for several topics at once (search spans topics). */
  async function articleLocalesFor(topics: string[]): Promise<Map<string, string[]>> {
    const byEntity = new Map<string, string[]>()
    if (!supabase || !topics.length) return byEntity
    try {
      const filter = topics.map((topic) => `entity_id.like.${topic}:%`).join(',')
      const { data, error } = await (supabase as any)
        .from('article_docs')
        .select('entity_id, languages')
        .or(filter)
      if (error) return byEntity
      for (const row of (data ?? []) as { entity_id: string; languages: string[] }[]) {
        byEntity.set(row.entity_id, row.languages)
      }
    } catch {
      // A missing article list only costs the row its Read button; the table
      // itself still renders, so this is not an offline condition.
    }
    return byEntity
  }

  /** Attach the `content` meta the Read button keys on. */
  function attachContent(rows: MediaRow[], locales: Map<string, string[]>): MediaRow[] {
    for (const row of rows) {
      const phonetic = phoneticContentMeta(row.topic)
      if (phonetic) {
        row.content = phonetic
        continue
      }
      const found = locales.get(row.entity_id)
      if (found?.length) row.content = { canonical: 'en', locales: found }
    }
    return rows
  }

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
      const rows = (data ?? []).map((row) => unitToRow(row as ContentUnitRow))
      return attachContent(rows, await articleLocales(topic))
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
      const rows = (data ?? []).map((row) => unitToRow(row as ContentUnitRow))
      const topics = [...new Set(rows.map((row) => row.topic))]
      return attachContent(rows, await articleLocalesFor(topics))
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
