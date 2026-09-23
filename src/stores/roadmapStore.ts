/**
 * roadmapStore — state for the roadmap template (/ro, /en, /learn/:locale):
 * chapter/topic selection (structure from the build-inlined library/dictionary
 * sidebar), topic search (Fuse), the open topic's word records (lazy per-topic
 * payloads built from the gallery manifests / legacy bridge), word filtering
 * and per-topic learned counts. The template lives in
 * src/components/roadmap/RoadmapShell.vue.
 */
import { defineStore } from 'pinia'
import type { InjectionKey, Ref } from 'vue'
import Fuse from 'fuse.js'
import type { FuseResult } from 'fuse.js'
import type { GalleryRecord } from '~/types/gallery'
import type { GalleryIndex, SidebarSection, SidebarTopic } from '~/types/sidebars'
import { useGallery } from '~/composables/useGallery'

const LOCALES = ['en', 'ro', 'de', 'ru', 'it', 'es', 'fr', 'hu', 'pt']

/** The sidebar section the roadmap template renders. */
const SECTION = 'library/dictionary'

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
  const gallery = useGallery()
  const sidebar = useSidebars().get(SECTION)

  const lang = ref('ro') // target language of the track
  const chapters = ref<SidebarSection[]>(sidebar.sections) // structure is build-inlined
  const counts = ref<Record<string, Record<string, number>>>({}) // topic → lang → n
  /** topic → lang → entity ids (from the gallery index — bulk check-all/reset). */
  const indexIds = ref<Record<string, Record<string, string[]>>>({})
  const progressIndex = ref<Record<string, string>>({})
  const ready = ref(false)

  const chapterCode = ref<string | null>(null) // selected chapter
  const topicCode = ref<string | null>(null) // open topic (word table)
  const topicQuery = ref('') // topic search box
  const wordQuery = ref('') // word filter box
  const records = ref<GalleryRecord[]>([]) // word rows of the open topic
  const loadingTopic = ref(false)
  const recordsByCode = ref<Record<string, GalleryRecord[]>>({})

  /**
   * Chapter TOC mode — the sidebar collapses to the plain chapter list and the
   * main pane lists the chapters (same table shell). Cleared by any chapter or
   * topic selection.
   */
  const showChapters = ref(false)

  function toggleChapters() {
    showChapters.value = !showChapters.value
  }

  // --- Dictionary-layout state (per-track layout; see layouts/DictionaryLayout) ---

  /** Letter filter — prefix match on the term (1–2 letters typical). */
  const letterQuery = ref('')
  /** 1-based page within the filtered rows. */
  const page = ref(1)
  /** Rows per page (toolbar select) — Fibonacci sizes, default 13. */
  const pageSize = ref(13)

  /** Lowercase + diacritics folded ('ă'→'a', 'ș'→'s') for prefix matching. */
  function fold(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
  }

  /** Dictionary rows: the open topic's records, filtered by letter prefix. */
  const dictionaryRows = computed<GalleryRecord[]>(() => {
    const query = fold(letterQuery.value)
    if (!query) return records.value
    return records.value.filter((r: GalleryRecord) => fold(r.term).startsWith(query))
  })

  const pageCount = computed(() => Math.max(1, Math.ceil(dictionaryRows.value.length / pageSize.value)))

  /** The current page's rows — everything the dictionary table renders. */
  const pagedRows = computed<GalleryRecord[]>(() =>
    dictionaryRows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
  )

  function setLetterQuery(query: string) {
    letterQuery.value = query
    page.value = 1
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

  /** All topics flattened with their chapter code — the search-index unit. */
  const allTopics = computed<TopicRow[]>(() =>
    chapters.value.flatMap((c: SidebarSection) => c.topics.map((t: SidebarTopic) => ({ ...t, chapterCode: c.code })))
  )

  const topicIndex = computed(
    () =>
      new Fuse(allTopics.value, {
        keys: ['code', ...LOCALES.map((l: string) => `names.${l}`)],
        threshold: 0.35,
        ignoreLocation: true
      })
  )

  /** Topics of the selected chapter, or fuzzy search hits across all chapters. */
  const visibleTopics = computed<TopicRow[]>(() => {
    const query = topicQuery.value.trim()
    if (!query) return allTopics.value.filter((t: TopicRow) => t.chapterCode === chapterCode.value)
    return topicIndex.value.search(query).map((hit: FuseResult<TopicRow>) => hit.item)
  })

  /** Word rows of the open topic, filtered by the search box (term/gloss/tags). */
  const filteredRecords = computed<GalleryRecord[]>(() => {
    const query = wordQuery.value.trim().toLowerCase()
    if (!query) return records.value
    return records.value.filter(
      (r: GalleryRecord) =>
        r.term.toLowerCase().includes(query) ||
        r.tags.some((tag: string) => tag.toLowerCase().includes(query)) ||
        Object.values(r.names).some((value: string) => value.toLowerCase().includes(query))
    )
  })

  /** Learned count for one topic: how many of its word ids are learned. */
  function learnedCount(code: string, learned: Set<string>): number {
    let count = 0
    for (const id of learned) if (progressIndex.value[id] === code) count++
    return count
  }

  const chapterExists = (code: string) => chapters.value.some((c: SidebarSection) => c.code === code)
  const topicExists = (code: string) => allTopics.value.some((t: TopicRow) => t.code === code)

  /** Position of the open topic in the flat display order (-1 when none open). */
  function topicPosition(): number {
    return topicCode.value
      ? allTopics.value.findIndex((t: TopicRow) => t.code === topicCode.value)
      : -1
  }

  /** Whether a next/previous topic exists in the flat display order. */
  const hasNextTopic = computed(
    () => topicPosition() >= 0 && topicPosition() < allTopics.value.length - 1
  )
  const hasPrevTopic = computed(() => topicPosition() > 0)

  /** Open the next topic in display order (false at the end of the list). */
  async function nextTopic(): Promise<boolean> {
    const next = allTopics.value[topicPosition() + 1]
    if (!next) return false
    await openTopic(next.code)
    return true
  }

  /** Open the previous topic and land on its last page (the Previous step-back). */
  async function prevTopicLastPage(): Promise<boolean> {
    const at = topicPosition()
    if (at <= 0) return false
    await openTopic(allTopics.value[at - 1].code)
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
    await openTopic(first.code, { keepLetterFilter: true })
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

  async function init(targetLang: string, chapterFromQuery?: string, topicFromQuery?: string) {
    if (!ready.value || lang.value !== targetLang) {
      lang.value = targetLang
      recordsByCode.value = {} // records are lang-filtered — never reuse across languages
      const index: GalleryIndex = await gallery.fetchIndex()
      counts.value = index.counts[SECTION] ?? {}
      indexIds.value = index.ids[SECTION] ?? {}
      progressIndex.value = index.progress
      ready.value = true
    }
    if (topicFromQuery && topicExists(topicFromQuery)) {
      await openTopic(topicFromQuery)
    } else if (chapterFromQuery && chapterExists(chapterFromQuery)) {
      selectChapter(chapterFromQuery)
    } else if (!chapterCode.value || !chapterExists(chapterCode.value)) {
      chapterCode.value = chapters.value[0]?.code ?? null
    }
  }

  function selectChapter(code: string) {
    chapterCode.value = code
    topicCode.value = null
    records.value = []
    letterQuery.value = '' // filters reset with the selection
    page.value = 1
    showChapters.value = false // a chapter pick closes the TOC
  }

  /**
   * Open a topic: select it, lazily fetch its word rows (filtered by lang).
   * `keepLetterFilter` (the toolbar's word entry) skips the letter-filter
   * reset so the query the user just typed survives the jump into the table.
   */
  async function openTopic(code: string, opts?: { keepLetterFilter?: boolean }) {
    const row = allTopics.value.find((t: TopicRow) => t.code === code)
    if (!row) return
    chapterCode.value = row.chapterCode
    topicCode.value = code
    wordQuery.value = ''
    if (!opts?.keepLetterFilter) letterQuery.value = '' // dictionary layout filters reset per topic
    page.value = 1
    showChapters.value = false // opening a topic closes the TOC
    const cacheKey = `${lang.value}:${code}`
    if (!recordsByCode.value[cacheKey]) {
      loadingTopic.value = true
      try {
        const list = await gallery.fetchTopic(SECTION, code)
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
    letterQuery.value = '' // dictionary filters reset when the topic closes
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
    letterQuery,
    page,
    pageSize,
    chapter,
    topic,
    allTopics,
    visibleTopics,
    filteredRecords,
    dictionaryRows,
    pageCount,
    pagedRows,
    setLetterQuery,
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
