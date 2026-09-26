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
// renders as a plain input with no box of its own, meant to be dropped INTO
// that toolbar's row as its first child — full width (its own row) below lg,
// flex-1 (shares the row, everything else packs to its right) from lg up.
// Every other pane (chapters TOC · article · gallery · topic list) has no
// toolbar to share a row with, so RoadmapShell renders the default (non-bare)
// boxed version there instead.
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

/** Debounced live filter: topics while browsing, words everywhere else. */
let timer: ReturnType<typeof setTimeout> | undefined
function onInput() {
  clearTimeout(timer)
  timer = setTimeout(apply, 150)
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
  <input
    v-if="bare"
    v-model="draft"
    type="search"
    class="w-full min-w-0 flex-none rounded-lg border border-edge-strong bg-surface px-3 py-2 text-sm text-content placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 lg:w-auto lg:flex-1 lg:basis-48"
    :placeholder="searchPlaceholder"
    :aria-label="searchPlaceholder"
    @input="onInput"
    @keydown.enter.prevent="commitNow"
    @search="commitNow"
  >
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
