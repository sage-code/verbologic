// DictionaryToolbar — the table layout's control row (TopicTable): Fibonacci
// rows-per-page select (3·5·8·13·21·34·55·89), prev/next pagination that
// walks into the next/previous topic when the page run is exhausted
// (page-only while search results are shown), the page pill, one simple
// play/stop button (same size and shape in both states; ▶ plays the page, ■
// stops any run) and a persistent Repeat on/off toggle that stays set across
// Stop. The word SEARCH itself lives one level up — WordSearchBar in
// RoadmapShell, visible in every state.
<script setup lang="ts">
import { useRoadmapStore } from '~/stores/roadmapStore'
import { useAudioQueue, type QueueItem } from '~/composables/useAudioQueue'

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
/** Title audio is not wired yet — outside 'words' mode there is nothing to play. */
const playable = computed(() => props.items.length > 0)

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
    <!-- Search: the draft commits only on Enter / the filter button (no live
         filtering). @search also covers the native clear (✕) of type=search -->
    <input
      v-model="draft"
      type="search"
      class="min-w-0 flex-1 rounded-lg border border-edge-strong bg-surface px-3 py-2 text-sm text-content placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
      :placeholder="searchPlaceholder"
      :aria-label="searchPlaceholder"
      @keydown.enter.prevent="commit"
      @search="commit"
    />

    <!-- Filter: toggles translation-search mode (highlighted while active) and
         applies the draft — searching the translation column dictionary-wide -->
    <button
      type="button"
      class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition"
      :class="
        translationMode
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-edge text-muted hover:border-accent hover:text-accent'
      "
      :aria-pressed="translationMode"
      :title="copy('dictionary.filter_translation', 'Search translations')"
      @click="toggleFilter"
    >
      <FunnelIcon class="h-4 w-4" aria-hidden="true" />
    </button>

    <!-- Rows per page (Fibonacci sizes): "#Items/Page:" on desktop, "#" on mobile -->
    <label for="dict-per-page" class="hidden shrink-0 text-xs text-muted sm:inline">#Items/Page:</label>
    <label for="dict-per-page" class="shrink-0 text-xs text-muted sm:hidden">#</label>
    <select
      id="dict-per-page"
      :value="store.pageSize"
      class="shrink-0 rounded-lg border border-edge-strong bg-surface px-2 py-2 text-xs text-content focus:border-accent focus:outline-none"
      :aria-label="copy('dictionary.per_page', 'Per page')"
      @change="store.setPageSize(Number(($event.target as HTMLSelectElement).value))"
    >
      <option v-for="size in PAGE_SIZES" :key="size" :value="size">{{ size }}</option>
    </select>

    <!-- Previous / Next: round « » fast-back / fast-forward icons — no
         translated label needed; the edges walk to the previous/next topic -->
    <button
      type="button"
      class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-edge text-base text-content transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
      :disabled="!canPrev"
      :title="prevLabel"
      @click="goPrev"
    >
      «
    </button>
    <button
      type="button"
      class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-edge text-base text-content transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
      :disabled="!canNext"
      :title="nextLabel"
      @click="goNext"
    >
      »
    </button>

    <!-- Page pill (moved from the old banner): current page / page count -->
    <span
      class="inline-flex h-9 min-w-[5.5rem] shrink-0 items-center justify-center rounded-full border border-edge bg-surface px-2 text-xs tabular-nums text-muted"
    >
      {{ copy('dictionary.page', 'Page') }}: {{ store.page }}/{{ store.pageCount }}
    </span>

    <!-- Play / Stop: one button, same size and rounded corners in both
         states — blue only when it can actually play (a word list is loaded);
         neutral outline otherwise (title audio pending / no words yet) -->
    <button
      type="button"
      class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm transition disabled:cursor-not-allowed"
      :class="playable ? 'bg-accent text-on-accent hover:opacity-90' : 'border-edge bg-surface text-faint'"
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
      class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm transition"
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
</template>