// DictionaryToolbar — the table layout's control row (TopicTable): Fibonacci
// rows-per-page select (3·5·8·13·21·34·55·89), prev/next pagination that
// walks into the next/previous topic when the page run is exhausted
// (page-only while search results are shown), the page pill, one simple
// play/stop button (same size and shape in both states; ▶ plays the page, ■
// stops any run) and a persistent Repeat on/off toggle that stays set across
// Stop — all packed to the RIGHT. The word SEARCH box (WordSearchBar, bare)
// is the row's first child and grows to fill the left side.
<script setup lang="ts">
import { useRoadmapStore } from '~/stores/roadmapStore'
import { useAudioQueue, type QueueItem } from '~/composables/useAudioQueue'
import WordSearchBar from '../WordSearchBar.vue'

const store = useRoadmapStore()
const copy = useCopy()

const props = defineProps<{
  queue: ReturnType<typeof useAudioQueue>
  items: QueueItem[]
  /** Called on each loop lap (the layout jumps the list back to the top). */
  onCycle?: () => void
  /** Fired per finished item — the layout counts listens for auto-completion. */
  onItemEnded?: (item: QueueItem) => void
}>()

/** Memorization pause between rows of a page run. */
const GAP_MS = 1200

/** Fibonacci rows-per-page values — 8 positions starting at 3. */
const PAGE_SIZES = [3, 5, 8, 13, 21, 34, 55, 89]

/** Any running queue (page run or looping single row) squares the button. */
const playing = computed(() => props.queue.isPlaying.value)
/** Repeat is a plain on/off flag — it persists across Stop, so the button
 *  reflects the setting, never a transient blinking state. */
const repeatOn = computed(() => props.queue.loop.value)
/** Title audio is not wired yet — outside 'words' mode there is nothing to
 *  play. While searching/filtering, a single hit isn't worth a play run —
 *  play only lights up once there's more than one result. */
const playable = computed(() => (store.searchActive ? props.items.length > 1 : props.items.length > 0))

/** Labels: plain pagination, or the topic walk at the page edges. */
const nextLabel = computed(() =>
  store.searchActive || store.page < store.pageCount
    ? copy('dictionary.next', 'Next')
    : copy('dictionary.next_topic', 'Next topic')
)
const prevLabel = computed(() =>
  store.searchActive || store.page > 1
    ? copy('dictionary.prev', 'Previous')
    : copy('dictionary.prev_topic', 'Previous topic')
)
/** Next stays live outside words mode — it opens the current chapter's first topic. */
const canNext = computed(() =>
  store.searchActive
    ? store.page < store.pageCount
    : !store.topicCode
      ? store.allTopics.length > 0
      : store.page < store.pageCount || store.hasNextTopic
)
const canPrev = computed(() =>
  store.searchActive
    ? store.page > 1
    : !store.topicCode
      ? store.allTopics.length > 0
      : store.page > 1 || store.hasPrevTopic
)

function togglePlay() {
  if (!playable.value) return
  props.queue.toggle(props.items, {
    gapMs: GAP_MS,
    loop: props.queue.loop.value,
    onCycle: props.onCycle,
    onItemEnded: props.onItemEnded
  })
}

function toggleLoop() {
  props.queue.setLoop(!props.queue.loop.value)
}

/** Next page — or the next topic once the last page is exhausted. Always
 *  enters the word table first: closes the chapter TOC and expands the
 *  chapter in the sidebar, so navigation never depends on the sidebar. */
async function goNext() {
  if (store.searchActive) {
    if (store.page < store.pageCount) store.setPage(store.page + 1)
    return
  }
  if (!(await store.ensureWords())) return
  if (store.page < store.pageCount) store.setPage(store.page + 1)
  else await store.nextTopic()
}

/** Previous page — or the previous topic's last page when on page 1. Always
 *  enters the word table first (same as Next). */
async function goPrev() {
  if (store.searchActive) {
    if (store.page > 1) store.setPage(store.page - 1)
    return
  }
  if (!(await store.ensureWords())) return
  if (store.page > 1) store.setPage(store.page - 1)
  else await store.prevTopicLastPage()
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 rounded-lg border border-edge bg-surface p-2 shadow-sm">
    <!-- The search box: first, responsive — fills the left side; when the
         row is too narrow it keeps the top line and the controls wrap below -->
    <WordSearchBar bare />

    <!-- Controls group: beside the search it takes only its content width
         (grow 1 vs the search's 1000); wrapped onto its own line it spans the
         full width — "# [13] /Page" first on the left, the buttons on the right -->
    <div class="flex max-w-full grow flex-wrap items-center gap-2">
      <!-- Rows per page (Fibonacci sizes), read as "# [13] /Page" on every screen -->
      <label for="dict-per-page" class="shrink-0 text-xs text-muted">#</label>
      <select
        id="dict-per-page"
        :value="store.pageSize"
        class="shrink-0 rounded-lg border border-edge-strong bg-surface px-2 py-2 text-xs text-content focus:border-accent focus:outline-none"
        :aria-label="copy('dictionary.per_page', 'Per page')"
        @change="store.setPageSize(Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="size in PAGE_SIZES" :key="size" :value="size">{{ size }}</option>
      </select>
      <span class="-ml-1 shrink-0 text-xs text-muted">/{{ copy('dictionary.page', 'Page') }}</span>

      <div class="ml-auto flex flex-wrap items-center justify-end gap-2">
        <!-- Previous / Next: round « » fast-back / fast-forward icons — no
             translated label needed; the edges walk to the previous/next topic -->
        <button
          type="button"
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-edge text-base text-content transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="!canPrev"
          :title="prevLabel"
          @click="goPrev"
        >
          «
        </button>
        <button
          type="button"
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-edge text-base text-content transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="!canNext"
          :title="nextLabel"
          @click="goNext"
        >
          »
        </button>

        <!-- Page pill (moved from the old banner): current page / page count -->
        <span
          class="inline-flex h-8 min-w-[5.5rem] shrink-0 items-center justify-center rounded-full border border-edge bg-surface px-2 text-xs tabular-nums text-muted"
        >
          {{ copy('dictionary.page', 'Page') }}: {{ store.page }}/{{ store.pageCount }}
        </span>

        <!-- Play / Stop: same outline look as the row play buttons and Repeat
             (no fill, both themes) — accent icon when it can play, tinted like
             Repeat-on while running, faint when there is nothing to play -->

        <button
          type="button"
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm transition disabled:cursor-not-allowed"
          :class="
            !playable
              ? 'border-edge text-faint'
              : playing
                ? 'border-transparent bg-red-800 text-white'
                : 'border-edge text-accent hover:border-accent'
          "
          :disabled="!playable"
          :aria-pressed="playing"
          :title="!playable ? copy('ui.audio_coming_soon', 'Audio coming soon') : playing ? copy('roadmap.stop', 'Stop') : copy('dictionary.play', 'Play')"
          @click="togglePlay"
        >
          <span class="leading-none">{{ playing ? '■' : '▶' }}</span>
        </button>

        <!-- Repeat: a persistent on/off toggle — set it before or after play;
             it stays on across Stop and loops page runs and single rows alike -->
        <button
          type="button"
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm transition"
          :class="
            repeatOn
              ? 'border-accent bg-accent-soft text-accent'
              : 'border-edge text-muted hover:border-accent hover:text-accent'
          "
          :aria-pressed="repeatOn"
          :title="copy('dictionary.loop', 'Repeat')"
          @click="toggleLoop"
        >
          ⟳
        </button>
      </div>
    </div>
  </div>
</template>