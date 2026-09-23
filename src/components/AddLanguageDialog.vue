// AddLanguageDialog — "Select language" modal over AppDialog (round ✕ top-right,
// Escape / backdrop close, focus trap come from the shell). Single-select
// radiogroup of languages not currently visible in the Library — never-owned
// ones AND hidden ones. Confirm enrolls a new language via libraryStore.enroll()
// (deduped by activeFor) or RESTORES a hidden one (store.restore() — the
// enrollment was never touched, so the previous progress comes back), then closes.
// Mounted with v-if by the Library page — a fresh mount resets the selection.
<script setup lang="ts">
import { asTier } from '~/types/database'
import type { Enrollment } from '~/stores/libraryStore'
import { useLibraryStore } from '~/stores/libraryStore'

const emit = defineEmits<{ close: [] }>()

const copy = useCopy()
const { t } = useLocale()
const { languages, languageName } = useNavigation()
const store = useLibraryStore()

/**
 * Languages not currently visible in the Library — the only selectable set.
 * Includes hidden languages: picking one restores it (progress kept).
 */
const available = computed(() =>
  languages.filter((l) => !store.visible.some((e: Enrollment) => e.locale === l.locale))
)

/** Single selection — one locale code or '' while nothing is picked. */
const selected = ref('')

function confirm() {
  const locale = selected.value
  if (!locale) return
  // Hidden language — restore it; the enrollment (tier, credits, words,
  // timestamps) was never touched, so the previous progress comes back.
  if (store.activeFor(locale)) {
    store.restore(locale)
    emit('close')
    return
  }
  store.enroll({
    locale,
    tierId: asTier('prospect'),
    status: 'trial',
    creditsTotal: 0,
    creditsConsumed: 0,
    wordsLearned: 0
  })
  emit('close')
}
</script>

<template>
  <AppDialog
    :title="copy('library.select_title', 'Select language')"
    :close-label="copy('ui.close', 'Close')"
    @close="emit('close')"
  >
    <p class="text-sm text-muted">
      {{ copy('library.select_hint', 'Pick one language to add to your library.') }}
    </p>

    <!-- Single-select list: only languages not already owned -->
    <div
      v-if="available.length"
      role="radiogroup"
      :aria-label="copy('library.select_title', 'Select language')"
      class="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1"
    >
      <button
        v-for="l in available"
        :key="l.locale"
        type="button"
        role="radio"
        :aria-checked="selected === l.locale"
        class="flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition"
        :class="
          selected === l.locale
            ? 'border-accent bg-accent-soft'
            : 'border-edge bg-surface hover:border-edge-strong'
        "
        @click="selected = l.locale"
      >
        <LanguageFlag :code="l.flag" :label="languageName(l.locale)" size="md" />
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium text-content">{{ languageName(l.locale) }}</span>
          <!-- Hidden language: re-adding restores it with the previous progress -->
          <span v-if="store.isHidden(l.locale)" class="block text-xs font-medium text-accent">
            {{ copy('library.progress_kept', 'Progress kept') }}
          </span>
        </span>
        <span class="w-8 shrink-0 text-right font-code text-xs text-faint">{{ l.locale.toUpperCase() }}</span>
      </button>
    </div>

    <!-- Every language is already owned -->
    <p v-else class="mt-4 rounded-xl bg-soft p-4 text-center text-sm text-muted">
      {{ copy('library.all_added', 'All languages are already in your library.') }}
    </p>

    <template #footer>
      <button
        type="button"
        class="flex-1 rounded-full px-5 py-2.5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
        :class="selected ? 'bg-accent text-on-accent hover:bg-accent-strong' : 'bg-soft text-faint'"
        :disabled="!selected"
        @click="confirm"
      >
        {{ copy('library.add', 'Add') }}
      </button>
      <button
        type="button"
        class="rounded-full border border-edge px-5 py-2.5 font-medium text-content transition hover:border-accent hover:text-accent"
        @click="emit('close')"
      >
        {{ copy('ui.close', 'Close') }}
      </button>
    </template>
  </AppDialog>
</template>