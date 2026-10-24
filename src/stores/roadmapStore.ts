/**
 * roadmapStore — state for the roadmap template (/ro, /en, /learn/:locale):
 * per-track chapter/topic selection (structure from the build-inlined
 * sidebars), topic search (Fuse), the open topic's records (lazy per-topic
 * payloads built from the media manifests / content docs), dictionary search
 * (term or native-gloss prefix per topic, or dictionary-wide matches on
 * either language) and per-topic learned counts. The template lives in
 * src/components/roadmap/RoadmapShell.vue.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { InjectionKey, Ref } from 'vue'
import Fuse from 'fuse.js'
import type { FuseResult } from 'fuse.js'
import type { TrackId } from '~/data/tracks'
import type { MediaRecord, MediaRow } from '~/types/media'
import type { MediaIndex, SidebarSection, SidebarTopic, TopicLayout } from '~/types/sidebars'
import { useMedia } from '~/composables/useMedia'
import { matchesDictionaryQuery } from '~/lib/dictionarySearch'
import { LOCALES } from '~/data/locales'

/** Sidebar section per track id — the structure layer each track renders. */
const SECTION_BY_TRACK: Record<TrackId, string> = {
  dictionary: 'library/dictionary',
  lectures: 'library/lectures',
  stories: 'library/stories'
}

/** Topic row flattened with its owning chapter code — the search-index unit. */
export interface TopicRow extends SidebarTopic {
  chapterCode: string
}

/**
 * Progress handle shared down the roadmap tree (provided by RoadmapShell so
 * sidebar, topic list and word table read one single useProgress instance).
 */
export interface RoadmapProgress {
  learned: Ref<Set<string>>
  ready: Ref<boolean>
  isLearned: (entityId: string) => boolean
  toggleLearned: (entityId: string) => Promise<void>
  /** Counts one full listen; auto-marks the item learned at every 5th. */
  registerListen: (entityId: string) => Promise<void>
  /** Bulk learned-state change (the header's check-all / reset). */
  setLearnedMany: (entityIds: string[], learnedValue: boolean) => Promise<void>
  /** Forgets listen counts (page reset — the user wants to start over). */
  clearListens: (entityIds: string[]) => Promise<void>
}

export const PROGRESS_KEY: InjectionKey<RoadmapProgress> = Symbol('roadmap-progress')

export const useRoadmapStore = defineStore('roadmap', () => {
  const media = useMedia()
  const sidebars = useSidebars()
  const db = useContentDb()

  const track = ref<TrackId>('dictionary') // which track's structure is loaded
  const lang = ref('ro') // target language of the track

  /** The section the current track renders (build-inlined sidebar). */
  const section = computed(() => SECTION_BY_TRACK[track.value])
  const sidebar = computed(() => sidebars.get(section.value))
  const chapters = computed<SidebarSection[]>(() => sidebar.value.sections)

  const counts = ref<Record<string, Record<string, number>>>({}) // topic → lang → n
  /** topic → lang → entity ids (from the media index — bulk check-all/reset). */
  const indexIds = ref<Record<string, Record<string, string[]>>>({})
  const ready = ref(false)

  const chapterCode = ref<string | null>(null) // selected chapter
  const topicCode = ref<string | null>(null) // open topic (word table)
  /** Topic highlighted in the topic list (a single click there) but not yet
   *  open — the title bar's "Open Topic" button commits it (see pickTopic). */
  const pickedTopicCode = ref<string | null>(null)
  const topicQuery = ref('') // topic search box
  const wordQuery = ref('') // word filter box
  const records = ref<MediaRecord[]>([]) // word rows of the open topic
  const loadingTopic = ref(false)
  const recordsByCode = ref<Record<string, MediaRecord[]>>({})

  /**
   * Chapter TOC mode — the sidebar collapses to the plain chapter list and the
   * main pane lists the chapters (same table shell). Cleared by any chapter or
   * topic selection.
   */
  const showChapters = ref(false)

  function toggleChapters() {
    showChapters.value = !showChapters.value
  }

  // --- Table-layout state (the TopicTable pane's toolbar; see layouts/TopicTable) ---

  /** Committed search query — term or native-gloss prefix, or a substring of either. */
  const dictionaryQuery = ref('')
  /** 1-based page within the filtered rows. */
  const page = ref(1)
  /** Rows per page (toolbar select) — Fibonacci sizes, default 5.
   *  Small by default so the first page paints from a small payload: the
   *  reader sees rows immediately instead of waiting for a 13-row slice. */
  const pageSize = ref(5)

  /** Dictionary-wide search rows (the lazy search.json payload, lang-filtered). */
  const searchIndex = ref<MediaRow[]>([])
  const searchIndexReady = ref(false)
  const loadingSearch = ref(false)

  /** The UI language (the native gloss column) — reactive to the top-bar switcher. */
  const { lang: uiLang } = useLocale()

  /**
   * Search hits for the committed query.
   *
   * The rows are already the answer: the database path filtered them with
   * `pg_trgm` on the folded search text, and the bundled fallback path is
   * filtered here by the same `matchesDictionaryQuery` rule the client has
   * always used. Re-filtering the database rows would be wrong — they match on
   * every translation, which `matchesDictionaryQuery` also does, but the DB
   * folds diacritics server-side and the two must not disagree.
   */
  const searchResults = computed<MediaRow[]>(() => {
    if (!searchIndexReady.value) return []
    return searchIndex.value
  })

  /** Search active: a non-empty query is committed. */
  const searchActive = computed(() => dictionaryQuery.value.trim() !== '')

  /** Bare topic-list state (RoadmapShell's default pane): no topic open, no
   *  word search running, chapters TOC not shown. The one search box reads
   *  this to decide whether it's filtering topics (live) or words (live). */
  const topicListMode = computed(() => !topicCode.value && !searchActive.value && !showChapters.value)

  /** Dictionary rows: the search hits (query committed), or the open topic's rows. */
  const dictionaryRows = computed<MediaRow[]>(() => {
    if (searchActive.value) return searchResults.value
    return records.value
  })

  const pageCount = computed(() => Math.max(1, Math.ceil(dictionaryRows.value.length / pageSize.value)))

  /** The current page's rows — everything the dictionary table renders. */
  const pagedRows = computed<MediaRow[]>(() =>
    dictionaryRows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
  )

  function setDictionaryQuery(query: string) {
    dictionaryQuery.value = query
    page.value = 1
    if (query.trim()) void ensureSearchIndex()
  }

  /**
   * Run the search for the current query.
   *
   * Query-driven, not load-once: the database path is a `pg_trgm` query per
   * query, so latching a "ready" flag after the first search would pin the
   * results of the first query forever. The bundled fallback payload is cached
   * inside useMedia, so the offline path still fetches it only once.
   *
   * A sequence guard drops out-of-order responses: typing fast fires several
   * queries, and an earlier one must not overwrite a later one's results.
   */
  let searchSeq = 0
  async function ensureSearchIndex(): Promise<void> {
    const query = dictionaryQuery.value.trim()
    if (!query) {
      searchIndex.value = []
      searchIndexReady.value = false
      return
    }
    const seq = ++searchSeq
    loadingSearch.value = true
    try {
      const rows = await media.fetchSearch(section.value, lang.value, query)
      if (seq !== searchSeq) return // a newer query superseded this one
      searchIndex.value = rows
      searchIndexReady.value = true
    } finally {
      if (seq === searchSeq) loadingSearch.value = false
    }
  }

  function setPageSize(size: number) {
    pageSize.value = size
    page.value = 1
  }

  /** Jump to a page (clamped to the filtered range). */
  function setPage(target: number) {
    page.value = Math.min(Math.max(1, target), pageCount.value)
  }

  /**
   * True when a topic is visible for the active language.
   *
   * A `directional` topic is about ONE language, so it is visible only when the
   * active language matches its `target` — the German alphabet never shows up
   * while learning Romanian. A `reversible` topic (the default) is visible in
   * every language.
   */
  const topicVisible = (t: SidebarTopic): boolean =>
    t.mode !== 'directional' || !t.target || t.target === lang.value

  /**
   * Every chapter of the track with its topics scoped to the active language.
   * The sidebar, the chapters TOC and every progress scope read THIS, so a
   * language-owned topic (the German alphabet while learning Romanian) never
   * shows up beside the one that belongs to the current language. Empty
   * chapters render disabled, never hidden.
   */
  const visibleChapters = computed<SidebarSection[]>(() =>
    chapters.value.map((c: SidebarSection) => ({
      ...c,
      topics: c.topics.filter(topicVisible)
    }))
  )

  const chapter = computed(
    () => visibleChapters.value.find((c: SidebarSection) => c.code === chapterCode.value) ?? null
  )

  /** The open topic — null when the code belongs to another language's
   *  exclusive topic, so a deep link cannot open it here. */
  const topic = computed(
    () => chapter.value?.topics.find((t: SidebarTopic) => t.code === topicCode.value) ?? null
  )

  /**
   * The open topic's layout kind — the main pane is THIS, never the track
   * (any of table · article · gallery can appear in any library track).
   * Defaults to 'table' so a missing field degrades to the row table.
   */
  const topicLayout = computed<TopicLayout>(() => topic.value?.layout ?? 'table')

  /** All topics flattened with their chapter code — the search-index unit.
   *  Language-exclusive topics (`mode: 'directional'`) are already dropped by
   *  `visibleChapters`, so the topic list, chapter TOC, topic search and the
   *  next/prev walk all see one consistent set. */
  const allTopics = computed<TopicRow[]>(() =>
    visibleChapters.value.flatMap((c: SidebarSection) =>
      c.topics.map((t: SidebarTopic) => ({ ...t, chapterCode: c.code }))
    )
  )

  /** Topics with content in the active language — lists and walks show only these. */
  const populatedTopics = computed<TopicRow[]>(() =>
    allTopics.value.filter((t: TopicRow) => topicCount(t.code) > 0)
  )

  /** Chapters with at least one populated topic (the default chapter pick). */
  const populatedChapters = computed<SidebarSection[]>(() =>
    visibleChapters.value.filter((c: SidebarSection) =>
      c.topics.some((t: SidebarTopic) => topicCount(t.code) > 0)
    )
  )

  const topicIndex = computed(
    () =>
      new Fuse(allTopics.value, {
        keys: ['code', ...LOCALES.map((l: string) => `names.${l}`)],
        threshold: 0.35,
        ignoreLocation: true,
        isCaseSensitive: false
      })
  )

  /** Topics of the selected chapter, or fuzzy hits across all chapters — empty
   *  ones render disabled (content pending), never hidden. */
  const visibleTopics = computed<TopicRow[]>(() => {
    const query = topicQuery.value.trim()
    if (!query) return allTopics.value.filter((t: TopicRow) => t.chapterCode === chapterCode.value)
    return topicIndex.value.search(query).map((hit: FuseResult<TopicRow>) => hit.item)
  })

  /** Word rows of the open topic, filtered by the search box (term/gloss/tags). */
  const filteredRecords = computed<MediaRecord[]>(() => {
    const query = wordQuery.value.trim().toLowerCase()
    if (!query) return records.value
    return records.value.filter(
      (r: MediaRecord) =>
        r.term.toLowerCase().includes(query) ||
        (r.tags ?? []).some((tag: string) => tag.toLowerCase().includes(query)) ||
        // names values are null for locales without a translation yet
        Object.values(r.names).some((value: string | null) => value?.toLowerCase().includes(query))
    )
  })

  /** Content-backed records of the open topic (lecture/story cards). */
  const contentRecords = computed<MediaRecord[]>(() =>
    records.value.filter((r: MediaRecord) => r.content).sort((a: MediaRecord, b: MediaRecord) =>
      (a.content?.order ?? 0) - (b.content?.order ?? 0)
    )
  )

  /** Practice rows of the open topic — everything except the content cards. */
  const practiceRecords = computed<MediaRecord[]>(() =>
    filteredRecords.value.filter((r: MediaRecord) => !r.content)
  )

  /**
   * Whether every id of a scope (one topic's ids, or a chapter's pooled ids)
   * is marked learned — the single "done" rule every check/redo button in the
   * roadmap tree (topic list, chapters table, progress meter) must share.
   * Id-exact: the topic-CODE aggregate this replaced (matching learned ids
   * against progressIndex, a flat map with no section/chapter scoping) could
   * inflate its count when a code repeats across chapters/sections, desyncing
   * that "done" read from this one.
   */
  function scopeDone(ids: string[], learned: Set<string>): boolean {
    return ids.length > 0 && ids.every((id: string) => learned.has(id))
  }

  const chapterExists = (code: string) => chapters.value.some((c: SidebarSection) => c.code === code)
  const topicExists = (code: string) => allTopics.value.some((t: TopicRow) => t.code === code)

  /** Position of the open topic among the populated topics (-1 when none open). */
  function topicPosition(): number {
    return topicCode.value
      ? populatedTopics.value.findIndex((t: TopicRow) => t.code === topicCode.value)
      : -1
  }

  /** Whether a next/previous topic exists in the populated display order. */
  const hasNextTopic = computed(
    () => topicPosition() >= 0 && topicPosition() < populatedTopics.value.length - 1
  )
  const hasPrevTopic = computed(() => topicPosition() > 0)

  /** Open the next topic in display order (false at the end of the list). */
  async function nextTopic(): Promise<boolean> {
    const next = populatedTopics.value[topicPosition() + 1]
    if (!next) return false
    await openTopic(next.code)
    return true
  }

  /** Open the previous topic and land on its last page (the Previous step-back). */
  async function prevTopicLastPage(): Promise<boolean> {
    const at = topicPosition()
    if (at <= 0) return false
    await openTopic(populatedTopics.value[at - 1].code)
    page.value = pageCount.value
    return true
  }

  /**
   * Toolbar word-entry: when no word table is open, open the current chapter's
   * first topic (keeping any filter the user just typed). Returns true when a
   * word table is (now) open.
   */
  async function ensureWords(): Promise<boolean> {
    if (topicCode.value) {
      showChapters.value = false // a word table is open — close the chapter TOC
      return true
    }
    const first = visibleTopics.value[0] ?? allTopics.value[0]
    if (!first) return false
    await openTopic(first.code, { keepFilter: true })
    return true
  }

  /** Record total for one topic in the active language (from the runtime index). */
  function topicCount(code: string): number {
    return counts.value[code]?.[lang.value] ?? 0
  }

  /** Entity ids of one topic in the active language (bulk check-all/reset). */
  function topicIds(code: string): string[] {
    return indexIds.value[code]?.[lang.value] ?? []
  }

  /** Union of the entity ids of several topics (chapter/section scopes). */
  function scopeIds(codes: string[]): string[] {
    const out: string[] = []
    for (const code of codes) out.push(...topicIds(code))
    return out
  }

  async function init(
    targetLang: string,
    targetTrack: TrackId = 'dictionary',
    chapterFromQuery?: string,
    topicFromQuery?: string
  ) {
    if (!ready.value || lang.value !== targetLang || track.value !== targetTrack) {
      track.value = targetTrack
      lang.value = targetLang
      // Everything below is section/lang-scoped — never reuse across tracks.
      chapterCode.value = null
      topicCode.value = null
      records.value = []
      recordsByCode.value = {}
      dictionaryQuery.value = ''
      searchIndex.value = []
      searchIndexReady.value = false
      showChapters.value = false
      page.value = 1
      const index: MediaIndex = await media.fetchIndex()
      // Counts come from the database when it is reachable (one query for the
      // whole track); the bundled index is the offline fallback. `ids` has no
      // database equivalent yet — it is only used by bulk check-all/reset, which
      // still reads the bundled index.
      const dbCounts = await db.fetchCounts(track.value, lang.value)
      counts.value = dbCounts
        ? Object.fromEntries(
            Object.entries(dbCounts).map(([topic, n]) => [topic, { [lang.value]: n }])
          )
        : (index.counts[section.value] ?? {})
      indexIds.value = index.ids[section.value] ?? {}
      ready.value = true
    }
    if (topicFromQuery && topicExists(topicFromQuery)) {
      await openTopic(topicFromQuery)
    } else if (chapterFromQuery && chapterExists(chapterFromQuery)) {
      selectChapter(chapterFromQuery)
    } else if (!chapterCode.value || !chapterExists(chapterCode.value)) {
      chapterCode.value = populatedChapters.value[0]?.code ?? visibleChapters.value[0]?.code ?? null
    }
  }

  /** Pick a chapter in the TOC without leaving it — a single click there only
   *  highlights the chapter (the title bar names it) and readies the "open
   *  chapter" button; the TOC itself stays open until the user commits. */
  function pickChapter(code: string) {
    chapterCode.value = code
    topicCode.value = null
    pickedTopicCode.value = null
    records.value = []
    dictionaryQuery.value = ''
    page.value = 1
  }

  /** Highlight a topic in the topic list without opening it — a single click
   *  there; the title bar's "Open Topic" button commits it. */
  function pickTopic(code: string) {
    pickedTopicCode.value = code
  }

  /** Select a chapter and leave the TOC — the rail's click, a double-click on
   *  a TOC row, or a deep-link restore all commit straight to its topic list. */
  function selectChapter(code: string) {
    pickChapter(code)
    showChapters.value = false // a chapter pick closes the TOC
  }

  /**
   * Open a topic: select it, lazily fetch its word rows (filtered by lang).
   * `keepFilter` (the toolbar's word entry) skips the search-filter reset so
   * the query the user just committed survives the jump into the table.
   */
  async function openTopic(code: string, opts?: { keepFilter?: boolean }) {
    const row = allTopics.value.find((t: TopicRow) => t.code === code)
    if (!row) return
    chapterCode.value = row.chapterCode
    topicCode.value = code
    pickedTopicCode.value = null
    wordQuery.value = ''
    if (!opts?.keepFilter) dictionaryQuery.value = '' // dictionary layout filters reset per topic
    page.value = 1
    showChapters.value = false // opening a topic closes the TOC
    const cacheKey = `${section.value}:${lang.value}:${code}`
    if (!recordsByCode.value[cacheKey]) {
      loadingTopic.value = true
      try {
        // Online: the `units` page query for this language. Offline: the bundled
        // payload filtered to this language (the English fallback).
        recordsByCode.value[cacheKey] = await media.fetchTopic(section.value, code, lang.value)
      } finally {
        loadingTopic.value = false
      }
    }
    records.value = recordsByCode.value[cacheKey] ?? []
  }

  function closeTopic() {
    topicCode.value = null
    pickedTopicCode.value = null
    records.value = []
    dictionaryQuery.value = '' // dictionary filters reset when the topic closes
    page.value = 1
  }

  return {
    lang,
    chapters,
    showChapters,
    toggleChapters,
    hasNextTopic,
    hasPrevTopic,
    nextTopic,
    prevTopicLastPage,
    ensureWords,
    counts,
    ready,
    chapterCode,
    topicCode,
    pickedTopicCode,
    topicQuery,
    wordQuery,
    records,
    loadingTopic,
    track,
    section,
    dictionaryQuery,
    searchActive,
    topicListMode,
    searchResults,
    loadingSearch,
    page,
    pageSize,
    chapter,
    topic,
    topicLayout,
    allTopics,
    populatedTopics,
    visibleChapters,
    visibleTopics,
    filteredRecords,
    contentRecords,
    practiceRecords,
    dictionaryRows,
    pageCount,
    pagedRows,
    setDictionaryQuery,
    ensureSearchIndex,
    setPageSize,
    setPage,
    scopeDone,
    topicCount,
    topicIds,
    scopeIds,
    chapterExists,
    topicExists,
    init,
    pickChapter,
    selectChapter,
    pickTopic,
    openTopic,
    closeTopic
  }
})
