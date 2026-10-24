// AbandonLanguageDialog — the confirmation shown when a language is removed
// from the Library. Removing is NOT forgetting: the enrollment flips to
// 'abandoned' and every learned word / listen count stays attached, so the
// language can be restored later with its progress intact.
//
// The one decision is what happens to the language's credit allocation:
//   · Recuperate (default) — the credits return to the shared pool and can be
//     allocated to another language.
//   · Forfeit — the credits are given up; the allocation still drops to zero.
// Either way the abandoned language's allocation becomes 0.
//
// Mounted with v-if by the Library page — a fresh mount resets the choice.
<script setup lang="ts">
import type { Enrollment } from '~/stores/libraryStore'
import { useLibraryStore } from '~/stores/libraryStore'

const props = defineProps<{
  /** The enrollment being abandoned. */
  enrollment: Enrollment
}>()

const emit = defineEmits<{ close: [] }>()

const copy = useCopy()
const { languageName } = useNavigation()
const store = useLibraryStore()

const language = computed(() => languageName(props.enrollment.locale))

/** Credits that would return to the pool — the language's current allocation. */
const reclaimable = computed(() => store.allocationFor(props.enrollment.locale))

/** Recuperate by default: giving up paid credits should be the opt-in. */
const recuperate = ref(true)

const busy = ref(false)

async function confirm() {
  if (busy.value) return
  busy.value = true
  await store.abandon(props.enrollment.locale, recuperate.value)
  busy.value = false
  emit('close')
}
</script>

<template>
  <AppDialog
    :title="copy('library.abandon_title', 'Remove language')"
    :close-label="copy('ui.close', 'Close')"
    @close="emit('close')"
  >
    <p class="text-sm text-muted">
      {{ copy('library.abandon_hint', 'Your progress is kept. You can add this language back later and continue where you left off.') }}
    </p>

    <!-- What is preserved — the reassurance that makes removing safe. -->
    <div class="mt-4 rounded-xl bg-soft p-4">
      <p class="text-xs text-muted">{{ copy('library.abandon_kept', 'Kept for') }} {{ language }}</p>
      <p class="mt-1 text-2xl font-extrabold text-content">{{ enrollment.wordsLearned }}</p>
      <p class="text-xs text-muted">{{ copy('library.words_learned', 'Words learned') }}</p>
    </div>

    <!-- The credit decision. Only meaningful when something is allocated. -->
    <fieldset v-if="reclaimable > 0" class="mt-3 rounded-xl bg-accent-soft p-4">
      <legend class="px-1 text-xs text-muted">
        {{ copy('library.abandon_credits', 'Credits allocated to this language') }}: ${{ reclaimable }}
      </legend>
      <label class="mt-2 flex cursor-pointer items-start gap-3">
        <input v-model="recuperate" type="radio" :value="true" class="mt-1" name="abandon-credits" />
        <span>
          <span class="block font-semibold text-content">
            {{ copy('library.abandon_recuperate', 'Recuperate the credits') }}
          </span>
          <span class="block text-xs text-muted">
            {{ copy('library.abandon_recuperate_hint', 'They return to your available credits and can be used for another language.') }}
          </span>
        </span>
      </label>
      <label class="mt-3 flex cursor-pointer items-start gap-3">
        <input v-model="recuperate" type="radio" :value="false" class="mt-1" name="abandon-credits" />
        <span>
          <span class="block font-semibold text-content">
            {{ copy('library.abandon_forfeit', 'Give up the credits') }}
          </span>
          <span class="block text-xs text-muted">
            {{ copy('library.abandon_forfeit_hint', 'The credits are lost. Your progress is still kept.') }}
          </span>
        </span>
      </label>
    </fieldset>

    <template #footer>
      <button
        type="button"
        class="flex-1 rounded-full bg-accent px-5 py-2.5 font-semibold text-on-accent transition hover:bg-accent-strong disabled:opacity-60"
        :disabled="busy"
        @click="confirm"
      >
        {{ copy('library.abandon_confirm', 'Remove language') }}
      </button>
      <button
        type="button"
        class="rounded-full border border-edge px-5 py-2.5 font-medium text-content transition hover:border-accent hover:text-accent"
        @click="emit('close')"
      >
        {{ copy('library.settings_cancel', 'Cancel') }}
      </button>
    </template>
  </AppDialog>
</template>
