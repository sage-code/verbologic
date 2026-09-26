// ChaptersTable — the chapters TOC mode: one row per chapter (code · title ·
// translation · title-audio · a Done button that marks/resets the whole
// chapter). A row click picks the chapter (see pickChapter); a double-click
// opens it straight to its topic list. Toggled from the frame's Chapters
// button (store.toggleChapters) and rendered by RoadmapShell for EVERY
// track — chapter overview is roadmap chrome, not a topic layout.
<script setup lang="ts">
import { ArrowPathIcon, CheckIcon } from '@heroicons/vue/20/solid'
import { useRoadmapStore, PROGRESS_KEY, type TopicRow } from '~/stores/roadmapStore'
import { mediaName } from '~/composables/useMedia'
import { THEAD_STICKY_TOP } from '~/lib/roadmapRail'
import type { MediaNames, MediaRow } from '~/types/media'
import type { SidebarSection, SidebarTopic } from '~/types/sidebars'

const store = useRoadmapStore()
const progress = inject(PROGRESS_KEY)
const { lang: uiLang } = useLocale()
const { languageName } = useNavigation()
const copy = useCopy()

/** Title in the learning language (the term) and in the UI language (the gloss). */
const targetName = (names: MediaNames, fallback: string) => mediaName(names, store.lang, fallback)
const uiName = (names: MediaNames, fallback: string) => mediaName(names, uiLang.value, fallback)

const learnedOf = (code: string) => (progress ? store.learnedCount(code, progress.learned.value) : 0)

/** Column headers — the same shell as the word table. */
const nameHeader = computed(() => languageName(store.lang))
const glossHeader = computed(() => languageName(uiLang.value !== store.lang ? uiLang.value : 'en'))

/** Records across one chapter's topics (drives the row's Done button). */
function chapterTotal(c: SidebarSection): number {
  return c.topics.reduce((n: number, tp: SidebarTopic) => n + store.topicCount(tp.code), 0)
}
function chapterLearned(c: SidebarSection): number {
  if (!progress) return 0
  return c.topics.reduce((n: number, tp: SidebarTopic) => n + store.learnedCount(tp.code, progress.learned.value), 0)
}
function chapterIds(c: SidebarSection): string[] {
  return store.scopeIds(c.topics.map((tp: SidebarTopic) => tp.code))
}

/** Row Done button: marks the whole chapter learned, or resets it (and its
 *  listen counts) when it's already fully learned — same semantics as the
 *  header's check-all. */
async function toggleChapterDone(c: SidebarSection) {
  if (!progress) return
  const ids = chapterIds(c)
  if (ids.length === 0) return
  if (chapterLearned(c) >= chapterTotal(c)) {
    await progress.setLearnedMany(ids, false)
    await progress.clearListens(ids)
  } else {
    await progress.setLearnedMany(
      ids.filter((id: string) => !progress!.isLearned(id)),
      true
    )
  }
}

/** One row of the chapters table. */
interface TitleRow {
  key: string
  code: string
  name: string
  translation: string
  /** Every topic in the chapter is fully learned (drives the row's Done button). */
  done: boolean
  /** No topic has content in the active language — row renders disabled. */
  disabled: boolean
  /** Click: pick the chapter — highlights it and readies the title bar's
   *  "open chapter" button, but stays in the TOC (see pickChapter). */
  pick: () => void
  /** Double-click: pick AND leave the TOC straight for its topic list. */
  open: () => void
  /** Done button: mark/reset the whole chapter. */
  toggleDone: () => Promise<void>
}

const titleRows = computed<TitleRow[]>(() =>
  store.visibleChapters.map((c: SidebarSection) => ({
    key: c.code,
    code: c.code,
    name: targetName(c.names, c.code),
    translation: uiName(c.names, c.code),
    done: chapterTotal(c) > 0 && chapterLearned(c) >= chapterTotal(c),
    disabled: chapterTotal(c) === 0,
    pick: () => store.pickChapter(c.code),
    open: () => store.selectChapter(c.code),
    toggleDone: () => toggleChapterDone(c)
  }))
)

/** The ids the header button acts on — every chapter's every topic. */
const scopeIds = computed<string[]>(() =>
  store.scopeIds(store.chapters.flatMap((c: SidebarSection) => c.topics.map((t: SidebarTopic) => t.code)))
)

/** Every id in the current scope is marked done (drives the header button). */
const allScopeLearned = computed(
  () => scopeIds.value.length > 0 && scopeIds.value.every((id: string) => (progress ? progress.isLearned(id) : false))
)

/** Header check-all / reset over the whole track (same semantics as the table's). */
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
</script>
<template>
  <div class="space-y-1.5">
    <header class="flex h-10 items-center">
      <h2 class="truncate text-lg font-semibold text-content">{{ copy('roadmap.chapters', 'Chapters') }}</h2>
    </header>

    <div class="overflow-clip rounded-lg border border-edge bg-surface shadow-sm">
      <table class="w-full border-collapse text-sm">
        <thead class="sticky z-10 bg-soft text-left text-xs uppercase tracking-wide text-faint" :class="THEAD_STICKY_TOP">
          <tr>
            <th class="px-3 py-2 font-medium">{{ copy('dictionary.col_id', 'File ID') }}</th>
            <th class="px-3 py-2 font-medium">{{ nameHeader }}</th>
            <th class="hidden px-3 py-2 font-medium sm:table-cell">
              {{ glossHeader }}
            </th>
            <th class="px-3 py-2 text-center font-medium">{{ copy('dictionary.col_audio', 'Audio') }}</th>
            <th class="px-3 py-2 text-center font-medium">
              <!-- Check-all / reset for the whole track scope -->
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
            class="border-t border-edge transition-colors"
            :class="[
              row.disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-soft',
              !row.disabled && store.chapterCode === row.code ? 'bg-accent-soft' : ''
            ]"
            :title="
              row.disabled
                ? copy('practice.coming_soon', 'Coming soon')
                : copy('roadmap.double_click_open', 'Double-click to open')
            "
            @click="!row.disabled && row.pick()"
            @dblclick="!row.disabled && row.open()"
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
            <td class="px-3 py-2 text-center">
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-40"
                :class="
                  row.done
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-edge text-muted hover:border-accent hover:text-accent'
                "
                :disabled="row.disabled"
                :aria-pressed="row.done"
                :title="
                  row.done
                    ? copy('dictionary.reset_page', 'Reset chapter progress')
                    : copy('dictionary.check_all', 'Mark chapter as learned')
                "
                @click.stop="row.toggleDone()"
              >
                <ArrowPathIcon v-if="row.done" class="h-4 w-4" aria-hidden="true" />
                <CheckIcon v-else class="h-4 w-4" aria-hidden="true" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>