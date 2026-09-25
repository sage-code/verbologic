// TopicTable — the TABLE topic layout's pane: banner (topic code + title, or
// the search-results line), the shared toolbar and the open topic's paginated
// word table. Rendered by RoadmapShell whenever the OPEN TOPIC's `layout` is
// 'table' — in any track (Dictionary · Lectures · Stories), never by track
// selection. One table, three data sources: the open topic's rows, or the
// dictionary-wide search results (the toolbar's filter mode), which take
// precedence regardless of the topic underneath.
// Columns: name in the learning language (the File ID stays in the DOM as a
// hidden sr-only field) · IPA (Dictionary only — words are short, so the
// narrower columns still fit; the Lectures' expressions never show IPA) ·
// translation · per-row play button (blinks while its file plays, squares ■
// while it loops under Repeat) · learned toggle. The header's check-all scope
// is the visible page. Lectures rows get a fixed two-line height — long
// expressions wrap, short ones sit centered in an equal-height row.
<script setup lang="ts">
import { ArrowPathIcon, CheckIcon } from '@heroicons/vue/20/solid'
import { useRoadmapStore, PROGRESS_KEY } from '~/stores/roadmapStore'
import { useAudioQueue, type QueueItem } from '~/composables/useAudioQueue'
import { glossName } from '~/lib/dictionarySearch'
import { THEAD_STICKY_TOP } from '~/lib/roadmapRail'
import type { MediaNames, MediaRow } from '~/types/media'
import DictionaryToolbar from './DictionaryToolbar.vue'

const store = useRoadmapStore()
const progress = inject(PROGRESS_KEY)
const { lang: uiLang } = useLocale()
const { languageName } = useNavigation()
const copy = useCopy()
const queue = useAudioQueue()

const rows = computed<MediaRow[]>(() => store.pagedRows)

/** The row the queue is currently on (page run or single file). */
const activeId = computed(() => (queue.isPlaying.value ? queue.currentId.value : null))

/** The row's file is playing in a loop (Repeat was on when it started). */
const rowLooping = (r: MediaRow) => queue.loop.value && activeId.value === r.entity_id

/** Queue items for the current page — ids are the progress entity_ids. */
const queueItems = computed<QueueItem[]>(() =>
  rows.value.map((r: MediaRow) => ({ id: r.entity_id, url: r.media.url }))
)

/** Gloss in the user's language: UI locale first, then English canonical. */
const gloss = (r: MediaRow): string => glossName(r.names, r.lang, uiLang.value)

/** Column headers: the language learned first, then the language the glosses
 *  are actually shown in — the toolbar language, or English when it matches
 *  the target language (the gloss falls back to names.en in that case). */
const nameHeader = computed(() => languageName(store.lang))
const glossHeader = computed(() => languageName(uiLang.value !== store.lang ? uiLang.value : 'en'))

/** Dictionary track: words only — an IPA column fits beside the name. The
 *  Lectures' expressions never show IPA. */
const isDictionary = computed(() => store.track === 'dictionary')

const isLearned = (r: MediaRow) => (progress ? progress.isLearned(r.entity_id) : false)
const toggleLearned = (r: MediaRow) => void progress?.toggleLearned(r.entity_id)

/** The ids the header button acts on — the rows you can see (the open topic's
 *  page, or the current search-results page). */
const scopeIds = computed<string[]>(() => rows.value.map((r: MediaRow) => r.entity_id))

/** Every id in the current scope is marked done (drives the header button). */
const allScopeLearned = computed(
  () => scopeIds.value.length > 0 && scopeIds.value.every((id: string) => (progress ? progress.isLearned(id) : false))
)

/**
 * Header check-all / reset: one click marks the whole visible page done; when
 * everything is already done the same button resets — clears the learned state
 * AND the listen counts, so the 5-listen auto-check starts from zero. No
 * confirmation: the user learns to deal with it from mistakes.
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
function playRow(r: MediaRow) {
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

// Structural changes invalidate the run — stop the autoplay. The viewport
// stays where it is on page changes (no forced jump to the top).
watch(
  () => [store.page, store.pageSize, store.dictionaryQuery, store.searchInTranslation] as const,
  () => {
    if (queue.isPlaying.value) queue.stop()
  }
)
watch(
  () => [store.searchActive, store.topicCode] as const,
  () => queue.stop()
)
</script>
<template>
  <div class="space-y-1.5">
    <!-- The frame title + word search bar live in RoadmapShell (always
         visible); this pane starts at the table toolbar. -->
    <DictionaryToolbar :queue="queue" :items="queueItems" :on-cycle="onCycle" :on-item-ended="onItemEnded" />

    <div
      v-if="store.loadingTopic || store.loadingSearch"
      class="rounded-lg border border-edge bg-surface p-6 text-sm text-muted"
    >
      …
    </div>

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

    <!-- The paginated word table: name · translation · play · learned -->
    <div v-else class="overflow-clip rounded-lg border border-edge bg-surface shadow-sm">
      <table class="w-full border-collapse text-sm">
        <thead class="sticky z-10 bg-soft text-left text-xs uppercase tracking-wide text-faint" :class="THEAD_STICKY_TOP">
          <tr>
            <th class="px-3 py-2 font-medium">{{ nameHeader }}</th>
            <th v-if="isDictionary" class="px-3 py-2 font-medium">
              {{ copy('dictionary.col_ipa', 'IPA') }}
            </th>
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
            :class="[activeId === r.entity_id ? 'bg-accent-soft' : 'hover:bg-soft', isDictionary ? '' : 'expr-row']"
            @click="stopAutoplay"
          >
            <td class="px-3 py-2">
              <!-- File ID: kept in the DOM as a hidden (screen-reader-only)
                   field — no visible column anymore -->
              <span class="sr-only">{{ r.id }}</span>
              <span class="font-medium text-content">{{ r.term }}</span>
              <span v-if="r.context" class="mt-0.5 block text-xs text-faint" :title="r.context">{{ r.context }}</span>
              <!-- Search results come from every topic: the chip names the
                   row's topic and jumps straight into its word table -->
              <button
                v-if="store.searchActive"
                type="button"
                class="ml-1 rounded bg-soft px-1.5 py-0.5 font-code text-[10px] text-muted transition hover:bg-accent-soft hover:text-accent"
                :title="copy('dictionary.open_topic', 'Open topic')"
                @click.stop="store.openTopic(r.topic)"
              >
                {{ r.topic }}
              </button>
            </td>
            <!-- IPA column (Dictionary only) — muted mono, blank until the
                 transcription is authored on the entity -->
            <td v-if="isDictionary" class="whitespace-nowrap px-3 py-2 font-code text-xs text-muted">
              {{ r.ipa ?? '' }}
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
  </div>
</template>

<style scoped>
/* Expression rows (Lectures and any non-dictionary table): fixed two-line
 * height so long wrapped expressions and short ones render equal-height —
 * the text is vertically centered in both. */
.expr-row td {
  height: 3.4rem;
  vertical-align: middle;
}
</style>