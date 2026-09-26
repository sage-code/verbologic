// WordSearchBar — the roadmap's ONE persistent search box. It's
// context-aware rather than two separate inputs: in the bare topic-list
// state (no topic open, no chapter TOC, nothing searched yet) it live-filters
// TOPIC titles (fuzzy, both languages — see roadmapStore's topicIndex);
// everywhere else it live-filters WORDS across the WHOLE track (every
// chapter/topic, never just the one in focus) — 1-2 letters is a prefix scan
// on the term, 3+ looks like a whole word and matches either language (see
// matchesDictionaryQuery). Clearing the field returns to the state's own
// content.
//
// `bare`: when the pane below is the table layout (DictionaryToolbar), this
// renders as an input + magnifier button with no box of its own, meant to be
// dropped INTO that toolbar's row as its FIRST child — grow-[1000] + basis-[8.4rem] (30% under the old 12rem), so
// plain flex-wrap decides by the row's ACTUAL rendered width (not a viewport
// breakpoint, which can stay narrow even on a wide screen behind a fixed
// sidebar): it grows to fill the left side when the controls fit beside it,
// full width on its own line when they don't. Every other pane (chapters
// TOC · article · gallery · topic list) has no toolbar to share a row with,
// so RoadmapShell renders the default (non-bare) boxed version there instead.
<script setup lang="ts">
import { useRoadmapStore } from '~/stores/roadmapStore'

withDefaults(defineProps<{ bare?: boolean }>(), { bare: false })

const store = useRoadmapStore()
const copy = useCopy()

const searchPlaceholder = computed(() =>
  store.topicListMode
    ? copy('roadmap.search_topics', 'Search topics…')
    : copy('dictionary.letter_filter', 'Type the first letters, or a whole word…')
)

/** The draft mirrors whichever query is currently "live" — topic or word —
 *  so switching state (e.g. opening a topic) doesn't leave a stale value. */
const draft = ref(store.topicListMode ? store.topicQuery : store.dictionaryQuery)
watch(
  () => (store.topicListMode ? store.topicQuery : store.dictionaryQuery),
  (query: string) => {
    draft.value = query
  }
)

/** Debounce delays: a lone first letter waits for more typing and only
 *  filters if the user pauses; longer queries filter sooner; clearing the
 *  field restores the content right away. */
const DELAY_FIRST_LETTER_MS = 1000
const DELAY_TYPING_MS = 400
const DELAY_CLEAR_MS = 150

/** Debounced live filter: topics while browsing, words everywhere else. */
let timer: ReturnType<typeof setTimeout> | undefined
function onInput() {
  clearTimeout(timer)
  const length = draft.value.trim().length
  const delay = length === 0 ? DELAY_CLEAR_MS : length === 1 ? DELAY_FIRST_LETTER_MS : DELAY_TYPING_MS
  timer = setTimeout(apply, delay)
}
function apply() {
  if (store.topicListMode) {
    store.topicQuery = draft.value
    return
  }
  void store.ensureSearchIndex().then(() => store.setDictionaryQuery(draft.value))
}

/** Enter applies immediately — no need to wait out the debounce. */
function commitNow() {
  clearTimeout(timer)
  apply()
}
</script>

<template>
  <div v-if="bare" class="flex min-w-0 shrink grow-[1000] basis-[8.4rem] items-center gap-2">
    <input
      id="roadmap-word-search"
      v-model="draft"
      type="search"
      class="min-w-0 flex-1 rounded-lg border border-edge-strong bg-surface px-3 py-2 text-sm text-content placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
      :placeholder="searchPlaceholder"
      :aria-label="searchPlaceholder"
      @input="onInput"
      @keydown.enter.prevent="commitNow"
      @search="commitNow"
    >
    <!-- Magnifier: applies the query now (same as Enter) -->
    <button
      type="button"
      class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-edge text-content transition hover:border-accent hover:text-accent"
      :title="copy('roadmap.search_label', 'Search')"
      :aria-label="copy('roadmap.search_label', 'Search')"
      @click="commitNow"
    >
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    </button>
  </div>
  <div v-else class="flex flex-wrap items-center gap-2 rounded-lg border border-edge bg-surface p-2 shadow-sm">
    <input
      v-model="draft"
      type="search"
      class="min-w-0 flex-1 rounded-lg border border-edge-strong bg-surface px-3 py-2 text-sm text-content placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
      :placeholder="searchPlaceholder"
      :aria-label="searchPlaceholder"
      @input="onInput"
      @keydown.enter.prevent="commitNow"
      @search="commitNow"
    >
  </div>
</template>
