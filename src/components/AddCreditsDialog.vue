// AddCreditsDialog — per-language top-up (the + button on a Library panel).
// Shows the current balance, offers selectable credit packs, and buys the
// picked one via libraryStore.topUp (dummy purchase until payment lands —
// the store also upserts the enrollment to Supabase when signed in).
// Mounted with v-if — a fresh mount resets the pack selection.
<script setup lang="ts">
import { CreditCardIcon } from '@heroicons/vue/20/solid'
import type { Enrollment } from '~/stores/libraryStore'
import { useLibraryStore } from '~/stores/libraryStore'

const props = defineProps<{ enrollment: Enrollment }>()
const emit = defineEmits<{ close: [] }>()

const copy = useCopy()
const { languageName } = useNavigation()
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
  store.topUp(props.enrollment.locale, picked.value)
  bought.value = true
}
</script>

<template>
  <AppDialog
    :title="copy('library.credits_title', 'Add credits')"
    :close-label="copy('ui.close', 'Close')"
    @close="emit('close')"
  >
    <!-- Language + current balance -->
    <div class="flex items-center justify-between gap-3 rounded-xl bg-soft p-4">
      <p class="font-semibold text-content">{{ languageName(enrollment.locale) }}</p>
      <p class="text-sm text-muted">
        {{ copy('library.credits_left', 'Credits left') }}:
        <span class="font-bold text-accent">{{ store.creditsLeft(enrollment) }}</span>
      </p>
    </div>

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
      {{ copy('library.topup_done', 'Added {n} credits to {lang}.').replace('{n}', String(picked)).replace('{lang}', languageName(enrollment.locale)) }}
      {{ copy('library.credits_left', 'Credits left') }}:
      {{ store.creditsLeft(enrollment) }}
    </p>

    <template #footer>
      <button
        v-if="!bought"
        type="button"
        class="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 font-semibold text-on-accent transition hover:bg-accent-strong"
        @click="buy"
      >
        <CreditCardIcon class="h-5 w-5 shrink-0" aria-hidden="true" />
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
