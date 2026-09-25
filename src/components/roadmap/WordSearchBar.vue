// WordSearchBar — the roadmap's persistent word search: the input + the
// translation-filter funnel, shown above the main pane in EVERY state
// (topic table · chapter TOC · topic list). Committing a query (Enter or the
// funnel) always filters WORDS — never chapters or topics — inside the
// current scope: the open topic, else the selected chapter, else every
// chapter (the learning use-case: all words starting with "a" across
// chapters). Clearing the field returns to the state's own content.
<script setup lang="ts">
import { FunnelIcon } from '@heroicons/vue/20/solid'
import { useRoadmapStore } from '~/stores/roadmapStore'

const store = useRoadmapStore()
const copy = useCopy()

/** Translation-search mode (the funnel) — substring on the translation;
 *  off = term prefix (the first letters). */
const translationMode = computed(() => store.searchInTranslation)

/** Placeholder/aria tracks the mode: the term's first letters, or the translation. */
const searchPlaceholder = computed(() =>
  translationMode.value
    ? copy('dictionary.translation_filter', 'Search the translation…')
    : copy('dictionary.letter_filter', 'Type the first letters…')
)

/**
 * The search draft — committed to the store only on Enter / the funnel (no
 * live filtering). Synced from the store so a scope change that resets the
 * filter clears the field.
 */
const draft = ref(store.dictionaryQuery)
watch(
  () => store.dictionaryQuery,
  (query: string) => {
    draft.value = query
  }
)

/** Commit: load the search index once, then hand the store the query. */
async function commit() {
  await store.ensureSearchIndex()
  store.setDictionaryQuery(draft.value)
}

/** The funnel toggles translation-search mode AND applies the draft. */
function toggleFilter() {
  store.setSearchMode(!translationMode.value)
  void commit()
}
</script>

<template>
  <!-- Same control-row styling as the table toolbar below it -->
  <div class="flex flex-wrap items-center gap-2 rounded-lg border border-edge bg-surface p-2 shadow-sm">
    <input
      v-model="draft"
      type="search"
      class="min-w-0 flex-1 rounded-lg border border-edge-strong bg-surface px-3 py-2 text-sm text-content placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
      :placeholder="searchPlaceholder"
      :aria-label="searchPlaceholder"
      @keydown.enter.prevent="commit"
      @search="commit"
    >

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
  </div>
</template>
