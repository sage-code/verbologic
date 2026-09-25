// RoadmapShell — the shared roadmap frame: store init, ?chapter=&topic= deep
// links, one useProgress instance provided to the tree, the credit/chapter
// meters, and the LAYOUT BY TOPIC: the open topic's `layout` field (table ·
// article · gallery) picks the main pane — in any track. The track only
// selects the sidebar section (SECTION_BY_TRACK); the no-topic states (chapters
// TOC table / topic list) are shared chrome. Rendered by /learn/:locale/:track
// (with :track) and the /ro · /en pages (default 'dictionary').
<script setup lang="ts">
import type { Component } from 'vue'
import { useRoadmapStore, PROGRESS_KEY } from '~/stores/roadmapStore'
import { useLibraryStore } from '~/stores/libraryStore'
import type { TrackId } from '~/data/tracks'
import type { TopicLayout } from '~/types/sidebars'
import TopicTable from './layouts/TopicTable.vue'
import TopicArticle from './layouts/TopicArticle.vue'
import TopicGallery from './layouts/TopicGallery.vue'
import ChaptersTable from './ChaptersTable.vue'
import WordSearchBar from './WordSearchBar.vue'
import { mediaName } from '~/composables/useMedia'

const props = withDefaults(defineProps<{ lang: string; track?: TrackId }>(), { track: 'dictionary' })

/** Topic layout registry — the pane is the topic's, never the track's. */
const TOPIC_LAYOUTS: Record<TopicLayout, Component> = {
  table: TopicTable,
  article: TopicArticle,
  gallery: TopicGallery
}

const store = useRoadmapStore()
const route = useRoute()
const router = useRouter()
const { t } = useLocale()
const progress = useProgress(() => props.lang)
const failed = ref(false)

// One progress instance shared by the frame tree.
provide(PROGRESS_KEY, progress)

const queryValue = (value: unknown) => (typeof value === 'string' && value ? value : undefined)

onMounted(async () => {
  try {
    await store.init(props.lang, props.track, queryValue(route.query.chapter), queryValue(route.query.topic))
    await progress.refresh()
  } catch {
    failed.value = true
  }
})

// Keep the URL in sync with the selection (deep links + browser back).
watch(
  () => [store.chapterCode, store.topicCode] as const,
  ([chapterCode, topicCode]: readonly [string | null, string | null]) => {
    const query: Record<string, string> = {}
    for (const [key, value] of Object.entries(route.query)) {
      if (typeof value === 'string') query[key] = value
    }
    if (chapterCode) query.chapter = chapterCode
    else delete query.chapter
    if (topicCode) query.topic = topicCode
    else delete query.topic
    void router.replace({ query })
  }
)

// --- The two meters (teleported into the page title row) — every track ---

const library = useLibraryStore()
const { lang: uiLang } = useLocale()
const copy = useCopy()

/** Credit meter enrollment for the target language (null for signed-out guests). */
const enrollment = computed(() => library.activeFor(store.lang))

/** The meters teleport into the page title row (#track-meters) — client-side
 *  only, like the whole frame (RoadmapShell gates on store.ready). */
const metersMounted = ref(false)
onMounted(() => (metersMounted.value = true))

onMounted(async () => {
  library.hydrate()
  const supabase = useSupabase()
  const userStore = useUserStore()
  const userId = userStore.user?.id
  if (!supabase || !userId) return
  // Signed-in refresh: the enrollments_overview row is authoritative.
  const { data } = await supabase
    .from('enrollments_overview')
    .select('*')
    .eq('user_id', userId)
    .eq('locale', store.lang)
    .maybeSingle()
  if (data) library.setFromOverview([data])
})

/** Credit meter fill: consumed share of the language's total credit. */
const creditPct = computed(() => {
  const e = enrollment.value
  return e && e.creditsTotal > 0 ? Math.min(100, Math.round((e.creditsConsumed / e.creditsTotal) * 100)) : 0
})

/** A topic is done when it has records and every one of them is learned. */
function topicDone(code: string): boolean {
  const total = store.topicCount(code)
  return total > 0 && store.learnedCount(code, progress.learned.value) >= total
}

/** Chapter Progress meter: completed topics of the chapter in focus. Only
 *  populated topics count — empty topics are ignored on both sides, so 100%
 *  stays reachable and individual words never move the needle. */
const chapterProgress = computed(() => {
  const c = store.chapter
  if (!c) return { done: 0, total: 0 }
  const populated = c.topics.filter((tp) => store.topicCount(tp.code) > 0)
  return {
    done: populated.filter((tp) => topicDone(tp.code)).length,
    total: populated.length
  }
})
const chapterPct = computed(() => {
  const p = chapterProgress.value
  return p.total > 0 ? Math.round((p.done / p.total) * 100) : 0
})

/**
 * The title above the persistent search bar — the thing in focus: the open
 * topic ('<code>: <title>'), else the selected chapter, else every chapter.
 * A committed word search names itself and counts its hits.
 */
const frameTitle = computed(() => {
  if (store.searchActive) {
    return `${copy('dictionary.search_results', 'Search results')} — ${store.searchResults.length}`
  }
  if (store.topic) {
    const code = store.topicCode ?? ''
    const name = mediaName(store.topic.names, uiLang.value, code)
    return code ? `${code}: ${name}` : name
  }
  if (store.chapter) {
    return mediaName(store.chapter.names, uiLang.value, store.chapter.code)
  }
  return copy('roadmap.all_chapters', 'All chapters')
})
</script>

<template>
  <div v-if="!store.ready" class="rounded-lg border border-edge bg-surface p-6 text-sm text-muted">
    {{ failed ? t('ui.no_results') || 'Not available yet.' : '…' }}
  </div>

  <!-- The content frame: flex-1 fills the page area between the frozen header
       and footer (so it is never shorter than the screen); the grid's stretch
       makes the rail exactly as tall as the content column. -->
  <div v-else class="grid flex-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
    <!-- Left: the chapter rail (RoadmapSidePane owns the height rule: same
         height as the content, own scrollbar). The TOPICS label row matches the
         banner height, so the rail top lines up with the toolbar/search bar. -->
    <RoadmapSidePane>
      <template #label>
        <div class="flex h-10 items-center justify-between gap-1">
          <p class="text-xs uppercase tracking-wide text-faint">{{ copy('roadmap.topics', 'Topics') }}</p>
          <button
            type="button"
            class="shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition"
            :class="
              store.showChapters
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-edge text-muted hover:border-accent hover:text-accent'
            "
            :aria-pressed="store.showChapters"
            @click="store.toggleChapters()"
          >
            {{
              store.showChapters
                ? copy('dictionary.open_chapter', 'Open chapters')
                : copy('dictionary.close_chapter', 'Close chapters')
            }}
          </button>
        </div>
      </template>

      <RoadmapSidebar :collapsed="store.showChapters" class="mt-1.5" />
    </RoadmapSidePane>

    <div class="min-w-0 space-y-1.5">
      <!-- The two meters: 50% of the free space right of the page title,
           right-aligned with the content edge, gap between them -->
      <Teleport v-if="metersMounted" to="#track-meters">
        <div v-if="enrollment" class="min-w-0 flex-1">
          <p class="text-[11px] leading-none text-muted">
            Credit: {{ enrollment.creditsConsumed }}$/{{ enrollment.creditsTotal }}$
          </p>
          <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-soft">
            <div class="h-full rounded-full bg-accent transition-all" :style="{ width: `${creditPct}%` }" />
          </div>
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-[11px] leading-none text-muted">
            {{ copy('dictionary.chapter_progress', 'Chapter progress') }}: {{ chapterProgress.done }}/{{ chapterProgress.total }}
          </p>
          <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-soft">
            <div class="h-full rounded-full bg-accent transition-all" :style="{ width: `${chapterPct}%` }" />
          </div>
        </div>
      </Teleport>

      <!-- The persistent top bar: the focus title above the word search —
           visible in EVERY state below (topic table · chapter TOC · topic
           list). Committing a query always filters WORDS, scoped to the
           topic/chapter in focus (or every chapter when nothing is). -->
      <h2 class="flex h-10 items-center truncate text-lg font-semibold text-content">
        {{ frameTitle }}
      </h2>
      <WordSearchBar />

      <!-- Committed word search with no topic open: the results table takes
           the pane (chapters/topics lists are never word-filtered) -->
      <TopicTable v-if="store.searchActive && !store.topicCode" />

      <!-- Open topic: the pane is the topic's LAYOUT (table · article · gallery) -->
      <component :is="TOPIC_LAYOUTS[store.topicLayout]" v-else-if="store.topicCode && store.topic" />

      <!-- Chapters TOC mode: the chapter table (toggled from the rail) -->
      <ChaptersTable v-else-if="store.showChapters" />

      <!-- No topic open: the topic list (populated topics only) -->
      <div v-else class="space-y-4">
        <RoadmapTopicSearch />
        <RoadmapTopicList />
      </div>
    </div>
  </div>
</template>
