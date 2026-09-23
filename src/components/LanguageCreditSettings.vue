// LanguageCreditSettings — per-language credit settings modal over AppDialog
// (round ✕ top-right, Escape / backdrop close, focus trap come from the shell).
// Shows the language's TOTAL CREDIT AVAILABLE (remaining balance minus the
// allocated slice) and the CREDIT ALLOCATED to that language (a draft value,
// labeled with the language name known at dialog start). Inside the allocated
// card sits a stepper: [−] [step] [+]. The step field starts at 10$ and can be
// switched to 1, 5, 10 or 20. [−] moves credits from the allocation back to
// the available total; [+] moves credits from the available total into the
// allocation. The keyboard fine-tunes too: ↑/↓ = ±$1, PageUp/PageDown = ±$10.
// Apply commits the draft via libraryStore.setAllocation(); Cancel (or ✕ /
// Escape / backdrop) discards — nothing moves until Apply.
// Mounted with v-if by the Library page — a fresh mount resets the draft.
<script setup lang="ts">
import type { Enrollment } from '~/stores/libraryStore'
import { useLibraryStore } from '~/stores/libraryStore'

const props = defineProps<{
  /** The enrollment whose credits are being allocated. */
  enrollment: Enrollment
}>()

const emit = defineEmits<{ close: [] }>()

const copy = useCopy()
const { languageName } = useNavigation()
const store = useLibraryStore()

/** The language is fixed when the dialog starts — used in the allocated label. */
const language = computed(() => languageName(props.enrollment.locale))

/** Selectable transfer steps for the [−]/[+] stepper. */
const STEP_OPTIONS = [1, 5, 10, 20] as const

/** Chosen transfer step (starts at $10). */
const step = ref<number>(10)

/** Ceiling for the allocation: the language's whole remaining balance. */
const maxAlloc = computed(() => store.creditsLeft(props.enrollment))

/** Draft allocation — nothing is committed until Apply. */
const allocated = ref(Math.min(store.allocationFor(props.enrollment.locale), maxAlloc.value))

/** Total credit available (unallocated slice of the balance), tracked live. */
const totalAvailable = computed(() => maxAlloc.value - allocated.value)

function clamp(v: number): number {
  return Math.max(0, Math.min(v, maxAlloc.value))
}

/** [−]: move `step` credits from the allocation back to the available total. */
function moveToAvailable() {
  allocated.value = clamp(allocated.value - step.value)
}

/** [+]: move `step` credits from the available total into the allocation. */
function moveToAllocated() {
  allocated.value = clamp(allocated.value + step.value)
}

/** Apply: commit the draft allocation and close. */
function apply() {
  store.setAllocation(props.enrollment.locale, allocated.value)
  emit('close')
}

/**
 * Keyboard control: ↑/↓ move the allocation by $1, PageUp/PageDown by $10.
 * Document-level (the dialog mounts with v-if) with preventDefault so
 * PageUp/PageDown never scroll the locked page underneath.
 */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    allocated.value = clamp(allocated.value + 1)
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    allocated.value = clamp(allocated.value - 1)
  } else if (e.key === 'PageUp') {
    e.preventDefault()
    allocated.value = clamp(allocated.value + 10)
  } else if (e.key === 'PageDown') {
    e.preventDefault()
    allocated.value = clamp(allocated.value - 10)
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <AppDialog
    :title="copy('library.settings_title', 'Credit settings')"
    :close-label="copy('ui.close', 'Close')"
    @close="emit('close')"
  >
    <p class="text-sm text-muted">
      {{ copy('library.settings_hint', 'Arrows: ±$1 · Page Up/Down: ±$10') }}
    </p>

    <!-- Total credit available (moves live as the allocation changes) -->
    <div class="mt-4 rounded-xl bg-soft p-4">
      <p class="text-xs text-muted">{{ copy('library.settings_total', 'Total credit available') }}</p>
      <p class="mt-1 text-2xl font-extrabold text-content">${{ totalAvailable }}</p>
    </div>

    <!-- Credit allocated to this language (draft value + [−] [step] [+] stepper) -->
    <div class="mt-3 rounded-xl bg-accent-soft p-4">
      <p class="text-xs text-muted">
        {{ copy('library.settings_allocated', 'Credit allocated to') }} {{ language }}
      </p>
      <div class="mt-2 flex items-center justify-between gap-3">
        <p class="text-2xl font-extrabold text-accent">${{ allocated }}</p>
        <div class="flex items-center gap-2">
          <!-- [−]: allocated → available -->
          <button
            type="button"
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-edge text-xl font-bold text-content transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            :aria-label="copy('library.settings_minus', 'Move to available')"
            :disabled="allocated <= 0"
            @click="moveToAvailable"
          >
            −
          </button>
          <!-- Step field: 1 / 5 / 10 / 20 ($), default 10 -->
          <select
            v-model.number="step"
            class="h-10 rounded-full border border-edge bg-surface px-4 text-center font-semibold text-content transition hover:border-edge-strong"
            :aria-label="copy('library.settings_step', 'Step')"
          >
            <option v-for="n in STEP_OPTIONS" :key="n" :value="n">{{ n }}$</option>
          </select>
          <!-- [+]: available → allocated -->
          <button
            type="button"
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-edge text-xl font-bold text-content transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            :aria-label="copy('library.settings_plus', 'Move to allocation')"
            :disabled="totalAvailable <= 0"
            @click="moveToAllocated"
          >
            +
          </button>
        </div>
      </div>
    </div>

    <template #footer>
      <!-- Apply commits the draft allocation; Cancel discards it -->
      <button
        type="button"
        class="flex-1 rounded-full bg-accent px-5 py-2.5 font-semibold text-on-accent transition hover:bg-accent-strong"
        @click="apply"
      >
        {{ copy('library.settings_apply', 'Apply') }}
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