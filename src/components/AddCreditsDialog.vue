// AddCreditsDialog — buy credits into the user-level POOL (the coin button
// next to Add Language in the Library header). One balance for every
// language: the pool is then split per language with the gear button
// (LanguageCreditSettings), which can also take credits back into the pool.
// Packs are selectable radio rows; Buy adds to the pool via
// libraryStore.addCredits (dummy purchase until payment lands) and shows the
// new balance inline. Mounted with v-if — a fresh mount resets the pick.
<script setup lang="ts">
import { BanknotesIcon } from '@heroicons/vue/20/solid'
import { useLibraryStore } from '~/stores/libraryStore'

const emit = defineEmits<{ close: [] }>()

const copy = useCopy()
const store = useLibraryStore()

/** Selectable packs — radio-style rows, one picked at a time. */
const PACKS = [
  { credits: 100, price: '$9.99' },
  { credits: 500, price: '$39.99' }
]
const picked = ref(PACKS[0].credits)

/** True after a successful purchase — shows the confirmation inline. */
const bought = ref(false)

function buy() {
  store.addCredits(picked.value)
  bought.value = true
}
</script>

<template>
  <AppDialog
    :title="copy('library.credits_title', 'Add credits')"
    :close-label="copy('ui.close', 'Close')"
    @close="emit('close')"
  >
    <!-- Current pool: total bought vs. still unallocated -->
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-soft p-4">
      <div>
        <p class="text-xs text-muted">{{ copy('library.pool_total', 'Credits in pool') }}</p>
        <p class="mt-0.5 text-2xl font-extrabold text-content">{{ store.creditPool }}</p>
      </div>
      <div class="text-right">
        <p class="text-xs text-muted">{{ copy('library.settings_total', 'Total credit available') }}</p>
        <p class="mt-0.5 text-2xl font-extrabold text-accent">{{ store.poolAvailable }}</p>
      </div>
    </div>
    <p class="mt-2 text-xs text-faint">
      {{ copy('library.pool_hint', 'One balance for all languages — allocate per language with the gear button on each panel.') }}
    </p>

    <!-- Packs: pick one, buy it -->
    <div
      v-if="!bought"
      role="radiogroup"
      :aria-label="copy('library.credits_title', 'Add credits')"
      class="mt-4 space-y-2"
    >
      <button
        v-for="p in PACKS"
        :key="p.credits"
        type="button"
        role="radio"
        :aria-checked="picked === p.credits"
        class="flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition"
        :class="picked === p.credits ? 'border-accent bg-accent-soft' : 'border-edge bg-surface hover:border-edge-strong'"
        @click="picked = p.credits"
      >
        <span class="font-semibold text-content">
          {{ p.credits }} {{ copy('library.credits_unit', 'credits') }}
        </span>
        <span class="font-medium text-muted">{{ p.price }}</span>
      </button>
    </div>

    <!-- Confirmation replaces the pack list + button -->
    <p
      v-else
      class="mt-4 rounded-xl bg-accent-soft px-4 py-3 text-sm font-medium text-accent"
      role="status"
      aria-live="polite"
    >
      {{ copy('library.topup_done', 'Added {n} credits to your pool.').replace('{n}', String(picked)) }}
      {{ copy('library.settings_total', 'Total credit available') }}:
      {{ store.poolAvailable }}
    </p>

    <template #footer>
      <button
        v-if="!bought"
        type="button"
        class="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 font-semibold text-on-accent transition hover:bg-accent-strong"
        @click="buy"
      >
        <BanknotesIcon class="h-5 w-5 shrink-0" aria-hidden="true" />
        {{ copy('library.buy', 'Buy') }}
      </button>
      <button
        type="button"
        class="rounded-full border border-edge px-5 py-2.5 font-medium text-content transition hover:border-accent hover:text-accent"
        @click="emit('close')"
      >
        {{ copy(bought ? 'ui.close' : 'library.cancel', bought ? 'Close' : 'Cancel') }}
      </button>
    </template>
  </AppDialog>
</template>
