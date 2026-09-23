/**
 * roadmapStore — state for the roadmap template (/ro, /en, /learn/:locale):
 * per-track chapter/topic selection (structure from the build-inlined
 * sidebars), topic search (Fuse), the open topic's records (lazy per-topic
 * payloads built from the media manifests / content docs), dictionary search
 * (term prefix per topic, or dictionary-wide translation matches) and
 * per-topic learned counts. The template lives in
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
import { fold, matchesDictionaryQuery } from '~/lib/dictionarySearch'

const LOCALES = ['en', 'ro', 'de', 'ru', 'it', 'es', 'fr', 'hu', 'pt']

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

  const track = ref<TrackId>('dictionary') // which track's structure is loaded
  const lang = ref('ro') // target language of the track

  /** The section the current track renders (build-inlined sidebar). */
  const section = computed(() => SECTION_BY_TRACK[track.value])
  const sidebar = computed(() => sidebars.get(section.value))
  const chapters = computed<SidebarSection[]>(() => sidebar.value.sections)

  const counts = ref<Record<string, Record<string, number>>>({}) // topic → lang → n
  /** topic → lang → entity ids (from the media index — bulk check-all/reset). */
  const indexIds = ref<Record<string, Record<string, string[]>>>({})
  const progressIndex = ref<Record<string, string>>({})
  const ready = ref(false)

  const chapterCode = ref<string | null>(null) // selected chapter
  const topicCode = ref<string | null>(null) // open topic (word table)
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

  /** Committed search query — term prefix, or translation substring in filter mode. */
  const dictionaryQuery = ref('')
  /** 1-based page within the filtered rows. */
  const page = ref(1)
  /** Rows per page (toolbar select) — Fibonacci sizes, default 13. */
  const pageSize = ref(13)

  /**
   * Translation-search mode (the toolbar's filter button): ON = dictionary-wide
   * substring match on the rendered translation; OFF = term prefix on the open
   * topic. The mode persists across topics (like Repeat); the query resets.
   */
  const searchInTranslation = ref(false)
  /** Dictionary-wide search rows (the lazy search.json payload, lang-filtered). */
  const searchIndex = ref<MediaRow[]>([])
  const searchIndexReady = ref(false)
  const loadingSearch = ref(false)

  /** The UI language (the translation column) — reactive to the top-bar switcher. */
  const { lang: uiLang } = useLocale()

  /**
   * Dictionary-wide translation hits: the search.json rows (filtered by the
   * track language) whose rendered gloss contains the committed query.
   */
  const searchResults = computed<MediaRow[]>(() => {
    if (!searchIndexReady.value) return []
    return searchIndex.value.filter((r: MediaRow) =>
      matchesDictionaryQuery(r, dictionaryQuery.value, true, uiLang.value)
    )
  })

  /** Search active: the filter is ON and a non-empty query is committed. */
  const searchActive = computed(() => searchInTranslation.value && dictionaryQuery.value.trim() !== '')

  /** Dictionary rows: the search hits (filter on), or the open topic's rows. */
  const dictionaryRows = computed<MediaRow[]>(() => {
    if (searchActive.value) return searchResults.value
    const query = dictionaryQuery.value
    if (!fold(query)) return records.value
    return records.value.filter((r: MediaRecord) => matchesDictionaryQuery(r, query, false, uiLang.value))
  })

  const pageCount = computed(() => Math.max(1, Math.ceil(dictionaryRows.value.length / pageSize.value)))

  /** The current page's rows — everything the dictionary table renders. */
  const pagedRows = computed<MediaRow[]>(() =>
    dictionaryRows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
  )

  function setDictionaryQuery(query: string) {
    dictionaryQuery.value = query
    page.value = 1
    if (searchInTranslation.value && query.trim()) void ensureSearchIndex()
  }

  /** Toggle the translation-search mode (the toolbar's filter button). */
  function setSearchMode(on: boolean) {
    searchInTranslation.value = on
    page.value = 1
    if (on) void ensureSearchIndex()
  }

  /** Load the section search payload once (no-op once loaded / loading). */
  async function ensureSearchIndex(): Promise<void> {
    if (searchIndexReady.value || loadingSearch.value) return
    loadingSearch.value = true
    try {
      const payload = await media.fetchSearch(section.value)
      searchIndex.value = payload.records.filter((r) => r.lang === lang.value)
      searchIndexReady.value = true
    } finally {
      loadingSearch.value = false
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

  const chapter = computed(() => chapters.value.find((c: SidebarSection) => c.code === chapterCode.value) ?? null)
  const topic = computed(() => chapter.value?.topics.find((t: SidebarTopic) => t.code === topicCode.value) ?? null)

  /**
   * The open topic's layout kind — the main pane is THIS, never the track
   * (any of table · article · gallery can appear in any library track).
   * Defaults to 'table' so a missing field degrades to the row table.
   */
  const topicLayout = computed<TopicLayout>(() => topic.value?.layout ?? 'table')

  /** All topics flattened with their chapter code — the search-index unit. */
  const allTopics = computed<TopicRow[]>(() =>
    chapters.value.flatMap((c: SidebarSection) => c.topics.map((t: SidebarTopic) => ({ ...t, chapterCode: c.code })))
  )

  /** Topics with content in the active language — lists and walks show only these. */
  const populatedTopics = computed<TopicRow[]>(() =>
    allTopics.value.filter((t: TopicRow) => topicCount(t.code) > 0)
  )

  /** Chapters with at least one populated topic (the sidebar/TOC hide the rest). */
  const visibleChapters = computed<SidebarSection[]>(() =>
    chapters.value.filter((c: SidebarSection) => c.topics.some((t: SidebarTopic) => topicCount(t.code) > 0))
  )

  const topicIndex = computed(
    () =>
      new Fuse(allTopics.value, {
        keys: ['code', ...LOCALES.map((l: string) => `names.${l}`)],
        threshold: 0.35,
        ignoreLocation: true
      })
  )

  /** Populated topics of the selected chapter, or fuzzy hits across all chapters. */
  const visibleTopics = computed<TopicRow[]>(() => {
    const query = topicQuery.value.trim()
    if (!query) return populatedTopics.value.filter((t: TopicRow) => t.chapterCode === chapterCode.value)
    return topicIndex.value
      .search(query)
      .map((hit: FuseResult<TopicRow>) => hit.item)
      .filter((t: TopicRow) => topicCount(t.code) > 0)
  })

  /** Word rows of the open topic, filtered by the search box (term/gloss/tags). */
  const filteredRecords = computed<MediaRecord[]>(() => {
    const query = wordQuery.value.trim().toLowerCase()
    if (!query) return records.value
    return records.value.filter(
      (r: MediaRecord) =>
        r.term.toLowerCase().includes(query) ||
        r.tags.some((tag: string) => tag.toLowerCase().includes(query)) ||
        Object.values(r.names).some((value: string) => value.toLowerCase().includes(query))
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

  /** Learned count for one topic: how many of its word ids are learned. */
  function learnedCount(code: string, learned: Set<string>): number {
    let count = 0
    for (const id of learned) if (progressIndex.value[id] === code) count++
    return count
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
    const first = visibleTopics.value[0] ?? chapter.value?.topics[0] ?? allTopics.value[0]
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
      searchInTranslation.value = false
      searchIndex.value = []
      searchIndexReady.value = false
      showChapters.value = false
      page.value = 1
      const index: MediaIndex = await media.fetchIndex()
      counts.value = index.counts[section.value] ?? {}
      indexIds.value = index.ids[section.value] ?? {}
      progressIndex.value = index.progress
      ready.value = true
    }
    if (topicFromQuery && topicExists(topicFromQuery)) {
      await openTopic(topicFromQuery)
    } else if (chapterFromQuery && chapterExists(chapterFromQuery)) {
      selectChapter(chapterFromQuery)
    } else if (!chapterCode.value || !chapterExists(chapterCode.value)) {
      chapterCode.value = visibleChapters.value[0]?.code ?? null
    }
  }

  function selectChapter(code: string) {
    chapterCode.value = code
    topicCode.value = null
    records.value = []
    dictionaryQuery.value = '' // filters reset with the selection
    page.value = 1
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
    wordQuery.value = ''
    if (!opts?.keepFilter) dictionaryQuery.value = '' // dictionary layout filters reset per topic
    page.value = 1
    showChapters.value = false // opening a topic closes the TOC
    const cacheKey = `${section.value}:${lang.value}:${code}`
    if (!recordsByCode.value[cacheKey]) {
      loadingTopic.value = true
      try {
        const list = await media.fetchTopic(section.value, code)
        recordsByCode.value[cacheKey] = list.filter((r) => r.lang === lang.value)
      } finally {
        loadingTopic.value = false
      }
    }
    records.value = recordsByCode.value[cacheKey] ?? []
  }

  function closeTopic() {
    topicCode.value = null
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
    progressIndex,
    ready,
    chapterCode,
    topicCode,
    topicQuery,
    wordQuery,
    records,
    loadingTopic,
    track,
    section,
    dictionaryQuery,
    searchInTranslation,
    searchActive,
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
    setSearchMode,
    ensureSearchIndex,
    setPageSize,
    setPage,
    learnedCount,
    topicCount,
    topicIds,
    scopeIds,
    chapterExists,
    topicExists,
    init,
    selectChapter,
    openTopic,
    closeTopic
  }
})
