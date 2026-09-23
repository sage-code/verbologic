// DictionaryLayout — the Dictionary track's layout (per-track layout registry
// in RoadmapShell). One table shell, three modes:
// - 'chapters' — the chapter TOC (toggled from the banner's Chapters button):
//   sidebar branches collapse; each row = chapter code · target-language title
//   · translation · title-audio button · learned/total progress. A row picks
//   the chapter.
// - 'topics'  — a chapter is selected: its topics in the same columns; a row
//   opens the topic's word table.
// - 'words'   — the open topic's paginated word table: File ID · name in the
//   learning language · translation · per-row play button (blinks while its
//   file plays, squares ■ while it loops under Repeat) · learned toggle.
// Toolbar: letter search (1–2 letters prefix-filter the rows), Fibonacci
// rows-per-page (3·5·8·13·21·34·55·89), prev/next pagination that walks into
// the next/previous topic when the page run is exhausted, one simple
// play/stop button (same size and shape in both states) and a persistent
// Repeat on/off toggle. Clicking any word row stops the autoplay; the page
// scrolls the playhead into view (no inner scroll cap — the table grows with
// the page size and the footer stays at the document bottom).
<script setup lang="ts">
import { ArrowPathIcon, CheckIcon } from '@heroicons/vue/20/solid'
import { useRoadmapStore, PROGRESS_KEY, type TopicRow } from '~/stores/roadmapStore'
import { useLibraryStore } from '~/stores/libraryStore'
import { useAudioQueue, type QueueItem } from '~/composables/useAudioQueue'
import { useTitles } from '~/composables/useTitles'
import { galleryName } from '~/composables/useGallery'
import type { GalleryNames, GalleryRecord } from '~/types/gallery'
import type { SidebarSection, SidebarTopic } from '~/types/sidebars'
import RoadmapSidebar from '../RoadmapSidebar.vue'
import DictionaryToolbar from './DictionaryToolbar.vue'

const store = useRoadmapStore()
const progress = inject(PROGRESS_KEY)
const { lang: uiLang } = useLocale()
const { languageName } = useNavigation()
const copy = useCopy()
const queue = useAudioQueue()
const titles = useTitles()
const library = useLibraryStore()

/** Credit meter enrollment for the target language (null for signed-out guests). */
const enrollment = computed(() => library.activeFor(store.lang))

/** The meters teleport into the page title row (#track-meters) — client-side
 *  only, like the whole layout (RoadmapShell gates on store.ready). */
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

/** Which table the main pane renders (chapters TOC → topics → words). */
const mode = computed<'chapters' | 'topics' | 'words'>(() =>
  store.showChapters ? 'chapters' : store.topicCode ? 'words' : 'topics'
)

/** Title in the learning language (the term) and in the UI language (the gloss). */
const targetName = (names: GalleryNames, fallback: string) => galleryName(names, store.lang, fallback)
const uiName = (names: GalleryNames, fallback: string) => galleryName(names, uiLang.value, fallback)

// --- Words mode ---------------------------------------------------------------

const rows = computed(() => store.pagedRows)

/** The row the queue is currently on (page run or single file). */
const activeId = computed(() => (queue.isPlaying.value ? queue.currentId.value : null))

/** The row's file is playing in a loop (Repeat was on when it started). */
const rowLooping = (r: GalleryRecord) => queue.loop.value && activeId.value === r.entity_id

const topicTitle = computed(() =>
  store.topic ? galleryName(store.topic.names, uiLang.value, store.topic.code) : ''
)

/** Queue items for the current page — ids are the progress entity_ids. */
const queueItems = computed<QueueItem[]>(() =>
  rows.value.map((r: GalleryRecord) => ({ id: r.entity_id, url: r.media.url }))
)

/** Gloss in the user's language: UI locale first, then English canonical. */
function gloss(r: GalleryRecord): string {
  if (uiLang.value !== r.lang && r.names[uiLang.value]) return r.names[uiLang.value]
  return r.names.en || ''
}

/** Column headers: the language learned first, then the language the glosses
 *  are actually shown in — the toolbar language, or English when it matches
 *  the target language (the gloss falls back to names.en in that case). */
const nameHeader = computed(() => languageName(store.lang))
const glossHeader = computed(() => languageName(uiLang.value !== store.lang ? uiLang.value : 'en'))

const learnedOf = (code: string) => (progress ? store.learnedCount(code, progress.learned.value) : 0)
const isLearned = (r: GalleryRecord) => (progress ? progress.isLearned(r.entity_id) : false)
const toggleLearned = (r: GalleryRecord) => void progress?.toggleLearned(r.entity_id)

/** The ids the header button acts on — the rows you can see: the open topic's
 *  page, the focused chapter's published topics, or every chapter (TOC). */
const scopeIds = computed<string[]>(() => {
  if (mode.value === 'words') return rows.value.map((r: GalleryRecord) => r.entity_id)
  if (mode.value === 'topics') {
    return store.chapter ? store.scopeIds(store.chapter.topics.map((t: SidebarTopic) => t.code)) : []
  }
  return store.scopeIds(store.chapters.flatMap((c: SidebarSection) => c.topics.map((t: SidebarTopic) => t.code)))
})

/** Every id in the current scope is marked done (drives the header button). */
const allScopeLearned = computed(
  () => scopeIds.value.length > 0 && scopeIds.value.every((id: string) => (progress ? progress.isLearned(id) : false))
)

/**
 * Header check-all / reset, on every view's table: one click marks the whole
 * scope done (page / chapter's topics / all chapters); when everything is
 * already done the same button resets — clears the learned state AND the
 * listen counts, so the 5-listen auto-check starts from zero. No confirmation:
 * the user learns to deal with it from mistakes.
 */
async function toggleScopeLearned() {
  if (!progress || scopeIds.value.length === 0) return
  const handle = progress // narrowed alias — TS keeps it inside the closures below
  const ids = scopeIds.value
  if (allScopeLearned.value) {
    await handle.setLearnedMany(ids, false)
    await handle.clearListens(ids)
  } else {
    await handle.setLearnedMany(
      ids.filter((id: string) => !handle.isLearned(id)),
      true
    )
  }
}

/** Row play button: one file only. Clicking the running row's button stops it. */
function playRow(r: GalleryRecord) {
  if (queue.isPlaying.value && queue.currentId.value === r.entity_id) queue.stop()
  else queue.playOne({ id: r.entity_id, url: r.media.url }, { onItemEnded })
}

/** Any row click stops the autoplay (the buttons stop propagation). */
function stopAutoplay() {
  if (queue.isPlaying.value) queue.stop()
}

/** Keep the playing row in view as the queue advances (window scrolling). */
function followActive(id: string | null) {
  if (!id) return
  document.getElementById(`dict-row-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

/** Loop lap: the list jumps back to the beginning. */
function onCycle() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

/** Count one completed listen — the 5th (10th, …) auto-marks the word learned. */
function onItemEnded(item: QueueItem) {
  void progress?.registerListen(item.id)
}

watch(activeId, (id: string | null) => {
  if (!id) return
  void nextTick(() => followActive(id))
})

// --- Chapters / topics mode ---------------------------------------------------

/** Records across one chapter's topics (the TOC progress badge). */
function chapterTotal(c: SidebarSection): number {
  return c.topics.reduce((n: number, tp: SidebarTopic) => n + store.topicCount(tp.code), 0)
}
function chapterLearned(c: SidebarSection): number {
  if (!progress) return 0
  return c.topics.reduce((n: number, tp: SidebarTopic) => n + store.learnedCount(tp.code, progress.learned.value), 0)
}

/** One row of the shared chapters/topics table. */
interface TitleRow {
  key: string
  code: string
  name: string
  translation: string
  progress: string
  open: () => void
}

const titleRows = computed<TitleRow[]>(() => {
  if (mode.value === 'chapters') {
    return store.chapters.map((c: SidebarSection) => ({
      key: c.code,
      code: c.code,
      name: targetName(c.names, c.code),
      translation: uiName(c.names, c.code),
      progress: `${chapterLearned(c)}/${chapterTotal(c)}`,
      open: () => store.selectChapter(c.code)
    }))
  }
  return store.visibleTopics.map((t: TopicRow) => ({
    key: t.code,
    code: t.code,
    name: targetName(t.names, t.code),
    translation: uiName(t.names, t.code),
    progress: `${learnedOf(t.code)}/${store.topicCount(t.code)}`,
    open: () => void store.openTopic(t.code)
  }))
})

/** Credit meter fill: consumed share of the language's total credit. */
const creditPct = computed(() => {
  const e = enrollment.value
  return e && e.creditsTotal > 0 ? Math.min(100, Math.round((e.creditsConsumed / e.creditsTotal) * 100)) : 0
})

/** A topic is done when it has records and every one of them is learned. */
function topicDone(code: string): boolean {
  const total = store.topicCount(code)
  return total > 0 && learnedOf(code) >= total
}

/** Chapter Progress meter: completed topics of the chapter in focus. Only
 *  published topics count — empty topics are ignored on both sides, so 100%
 *  stays reachable and individual words never move the needle. */
const chapterProgress = computed(() => {
  const c = store.chapter
  if (!c) return { done: 0, total: 0 }
  const published = c.topics.filter((tp: SidebarTopic) => store.topicCount(tp.code) > 0)
  return {
    done: published.filter((tp: SidebarTopic) => topicDone(tp.code)).length,
    total: published.length
  }
})
const chapterPct = computed(() => {
  const p = chapterProgress.value
  return p.total > 0 ? Math.round((p.done / p.total) * 100) : 0
})

/** Banner per mode: '<code>: <title>' (no 'Topic'/'Chapter' word) — the
 *  chapters TOC shows the localized "Chapters" label (the track name lives in
 *  the page title above, so "Dictionary" would read twice). */
const banner = computed(() => {
  if (mode.value === 'chapters') {
    return { code: '', title: copy('roadmap.chapters', 'Chapters') }
  }
  if (mode.value === 'topics') {
    return {
      code: store.chapterCode ?? '',
      title: store.chapter ? uiName(store.chapter.names, store.chapter.code) : ''
    }
  }
  return { code: store.topicCode ?? '', title: topicTitle.value }
})

// Structural changes invalidate the run — stop the autoplay. The viewport
// stays where it is on chapter/topic change (no forced jump to the top).
watch(() => store.topicCode, () => queue.stop())
watch(() => [store.page, store.pageSize, store.letterQuery] as const, () => {
  if (queue.isPlaying.value) queue.stop()
})
watch(mode, () => queue.stop())
</script>
<template>
  <div class="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
    <!-- Left: TOPICS label + the chapter toggle (right-aligned with the sidebar).
         The label row matches the banner height, so the sidebar top lines up
         with the toolbar/search bar; on large screens the sidebar panel
         stretches to the table's height (empty space below the list). -->
    <div class="min-w-0 lg:flex lg:flex-col">
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
              ? copy('dictionary.open_chapter', 'Open chapter')
              : copy('dictionary.close_chapter', 'Close chapter')
          }}
        </button>
      </div>

      <RoadmapSidebar
        :collapsed="store.showChapters"
        class="mt-1.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
      />
    </div>

    <div class="min-w-0 space-y-1.5">
      <!-- Banner: '<topic code>: <title>' with the page pill on the same line —
           the meters live in the page title row, teleported into #track-meters -->
      <header class="flex h-10 items-center justify-between gap-1.5">
        <h2 class="truncate text-lg font-semibold text-content">
          <span v-if="banner.code" class="font-code text-sm text-faint">{{ banner.code }}:</span>
          {{ banner.title }}
        </h2>
        <span
          class="inline-flex h-7 w-24 shrink-0 items-center justify-center rounded-full border border-edge bg-surface text-xs tabular-nums text-muted"
        >
          {{ copy('dictionary.page', 'Page') }}: {{ store.page }}/{{ store.pageCount }}
        </span>
      </header>

      <!-- The two meters: 50% of the free space right of the page title,
           right-aligned with the table edge, gap between them -->
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

      <DictionaryToolbar
        :queue="queue"
        :items="mode === 'words' ? queueItems : []"
        :on-cycle="onCycle"
        :on-item-ended="onItemEnded"
      />

      <!-- Words mode: the open topic's paginated word table -->
      <template v-if="mode === 'words'">
        <div v-if="store.loadingTopic" class="rounded-lg border border-edge bg-surface p-6 text-sm text-muted">…</div>

        <p
          v-else-if="rows.length === 0"
          class="rounded-lg border border-edge bg-surface px-4 py-6 text-sm text-muted"
        >
          {{
            store.dictionaryRows.length === 0
              ? copy('roadmap.no_words', 'No words in this topic yet — content is being prepared.')
              : copy('ui.no_results', 'No matches found.')
          }}
        </p>

        <div v-else class="overflow-clip rounded-lg border border-edge bg-surface shadow-sm">
          <table class="w-full border-collapse text-sm">
            <thead class="sticky top-[7rem] z-10 bg-soft text-left text-xs uppercase tracking-wide text-faint md:top-14">
              <tr>
                <th class="px-3 py-2 font-medium">{{ copy('dictionary.col_id', 'File ID') }}</th>
                <th class="px-3 py-2 font-medium">{{ nameHeader }}</th>
                <th class="hidden px-3 py-2 font-medium sm:table-cell">
                  {{ glossHeader }}
                </th>
                <th class="px-3 py-2 text-center font-medium">{{ copy('dictionary.col_audio', 'Audio') }}</th>
                <th class="px-3 py-2 text-center font-medium">
                  <!-- Check-all / reset: scope = the visible page; same height as
                       the data rows; marks every row done, then resets them -->
                  <button
                    type="button"
                    class="inline-flex h-8 w-8 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-40"
                    :class="
                      allScopeLearned
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-edge text-muted hover:border-accent hover:text-accent'
                    "
                    :disabled="!scopeIds.length"
                    :aria-pressed="allScopeLearned"
                    :title="
                      allScopeLearned
                        ? copy('dictionary.reset_page', 'Reset page progress')
                        : copy('dictionary.check_all', 'Mark all as learned')
                    "
                    @click.stop="toggleScopeLearned"
                  >
                    <ArrowPathIcon v-if="allScopeLearned" class="h-4 w-4" aria-hidden="true" />
                    <CheckIcon v-else class="h-4 w-4" aria-hidden="true" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in rows"
                :id="`dict-row-${r.entity_id}`"
                :key="r.entity_id"
                class="scroll-mt-24 border-t border-edge transition-colors"
                :class="activeId === r.entity_id ? 'bg-accent-soft' : 'hover:bg-soft'"
                @click="stopAutoplay"
              >
                <td class="whitespace-nowrap px-3 py-2 font-code text-xs text-faint">{{ r.id }}</td>
                <td class="px-3 py-2">
                  <span class="font-medium text-content">{{ r.term }}</span>
                  <span v-if="r.ipa" class="ml-1.5 rounded bg-soft px-1.5 py-0.5 text-xs text-muted">{{ r.ipa }}</span>
                  <span v-if="r.context" class="mt-0.5 block text-xs text-faint" :title="r.context">{{ r.context }}</span>
                </td>
                <td class="hidden px-3 py-2 text-muted sm:table-cell">{{ gloss(r) }}</td>
                <td class="px-3 py-2 text-center">
                  <button
                    type="button"
                    class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-edge bg-surface text-sm text-accent transition hover:bg-accent hover:text-on-accent disabled:cursor-not-allowed disabled:opacity-40"
                    :class="{ 'animate-pulse': activeId === r.entity_id }"
                    :disabled="!r.media.url"
                    :aria-label="`${copy('dictionary.play_single', 'Play')} ${r.term}`"
                    :title="r.media.url ? `${copy('dictionary.play_single', 'Play')} ${r.term}` : copy('ui.audio_coming_soon', 'Audio coming soon')"
                    @click.stop="playRow(r)"
                  >
                    <!-- Square while the word loops under Repeat, pause bars while it plays once -->
                    <span class="leading-none">{{ rowLooping(r) ? '■' : activeId === r.entity_id ? '❚❚' : '▶' }}</span>
                  </button>
                </td>
                <td class="px-3 py-2 text-center">
                  <button
                    type="button"
                    class="inline-flex h-8 w-8 items-center justify-center rounded-full border transition"
                    :class="
                      isLearned(r)
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-edge text-muted hover:border-accent hover:text-accent'
                    "
                    :aria-pressed="isLearned(r)"
                    :title="isLearned(r) ? copy('ui.learned', 'Learned') : copy('ui.mark_learned', 'Mark as learned')"
                    @click.stop="toggleLearned(r)"
                  >
                    <!-- Empty ring until learned (manual check or the 5-listen auto-check) -->
                    <CheckIcon v-if="isLearned(r)" class="h-4 w-4" aria-hidden="true" />
                    <span v-else class="h-3 w-3 rounded-full border border-current" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          </div>
      </template>

      <!-- Chapters/topics mode: the same column shell over title rows -->
      <div v-else class="overflow-clip rounded-lg border border-edge bg-surface shadow-sm">
        <table class="w-full border-collapse text-sm">
          <thead class="sticky top-[7rem] z-10 bg-soft text-left text-xs uppercase tracking-wide text-faint md:top-14">
            <tr>
              <th class="px-3 py-2 font-medium">{{ copy('dictionary.col_id', 'File ID') }}</th>
              <th class="px-3 py-2 font-medium">{{ nameHeader }}</th>
              <th class="hidden px-3 py-2 font-medium sm:table-cell">
                {{ glossHeader }}
              </th>
              <th class="px-3 py-2 text-center font-medium">{{ copy('dictionary.col_audio', 'Audio') }}</th>
              <th class="px-3 py-2 text-center font-medium">
                <!-- Check-all / reset for the whole scope: the focused chapter's
                     topics, or every chapter when the TOC is open -->
                <button
                  type="button"
                  class="inline-flex h-8 w-8 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-40"
                  :class="
                    allScopeLearned
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-edge text-muted hover:border-accent hover:text-accent'
                  "
                  :disabled="!scopeIds.length"
                  :aria-pressed="allScopeLearned"
                  :title="
                    allScopeLearned
                      ? copy('dictionary.reset_page', 'Reset page progress')
                      : copy('dictionary.check_all', 'Mark all as learned')
                  "
                  @click.stop="toggleScopeLearned"
                >
                  <ArrowPathIcon v-if="allScopeLearned" class="h-4 w-4" aria-hidden="true" />
                  <CheckIcon v-else class="h-4 w-4" aria-hidden="true" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in titleRows"
              :key="row.key"
              class="cursor-pointer border-t border-edge transition-colors hover:bg-soft"
              @click="row.open()"
            >
              <td class="whitespace-nowrap px-3 py-2 font-code text-xs text-faint">{{ row.code }}</td>
              <td class="px-3 py-2 font-medium text-content">{{ row.name }}</td>
              <td class="hidden px-3 py-2 text-muted sm:table-cell">{{ row.translation }}</td>
              <td class="px-3 py-2 text-center">
                <!-- Title audio: lights up via useTitles once the titles payload lands -->
                <button
                  type="button"
                  class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-edge bg-surface text-sm text-accent disabled:cursor-not-allowed disabled:opacity-40"
                  disabled
                  :title="copy('ui.audio_coming_soon', 'Audio coming soon')"
                  @click.stop
                >
                  <span class="leading-none">▶</span>
                </button>
              </td>
              <td class="px-3 py-2 text-center text-xs tabular-nums text-muted">{{ row.progress }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>