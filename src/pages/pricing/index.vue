// Pricing — three tiers (Prospect · Starter · Prepaid Credit) over a
// multi-select language checklist. Per-language prices: public/data/prices.json.
// Free tier (price 0) never charges: it enrolls a prospect/trial per selected
// language and opens the Library. Paid tiers keep the checkout stub.
<script setup lang="ts">
import type { PriceTier } from '~/composables/usePrices'
import { asTier } from '~/types/database'

const { tiers, symbol, priceFor } = usePrices()
const { languages, languageName } = useNavigation()
const copy = useCopy()
const { lang, setLocale, isLoaded } = useLocale()
const store = useLibraryStore()

// Preload UI chrome + local enrollments on the client (mirrors the other pages).
// Hydrating FIRST matters: enroll() → persist() rewrites the whole localStorage
// array, so enrolling on an un-hydrated store would wipe saved enrollments.
onMounted(() => {
  store.hydrate()
  if (!isLoaded()) void setLocale(lang.value)
})

const selectedTierId = ref('')

const selectedTier = computed<PriceTier | null>(
  () => tiers.value.find((t) => t.id === selectedTierId.value) ?? tiers.value[0] ?? null
)

/** Locales the user checked (multi-select). */
const selected = ref<Set<string>>(new Set())

const hasSelection = computed(() => selected.value.size > 0)
const isCredits = computed(() => selectedTier.value?.unit === 'credits')
const isFree = computed(() => selectedTier.value?.price === 0)

/** Per-language price for the active tier (0 while pricing is loading). */
function priceAt(locale: string): number {
  return selectedTier.value ? priceFor(selectedTier.value, locale) : 0
}

function formatPrice(amount: number): string {
  if (isFree.value) return copy('pricing.free', 'Free')
  return isCredits.value ? `${amount} ${copy('pricing.credits', 'credits')}` : `${symbol.value}${amount}`
}

/** CTA label follows the tier: free = navigation, paid = purchase. */
const ctaLabel = computed(() => {
  if (isFree.value) return copy('pricing.cta_free', 'Open Library')
  if (isCredits.value) return copy('pricing.cta_topup', copy('pricing.pay', 'Pay Now'))
  return copy('pricing.cta_buy', copy('pricing.pay', 'Pay Now'))
})

const total = computed(() => [...selected.value].reduce((sum, locale) => sum + priceAt(locale), 0))

function toggle(locale: string, checked: boolean) {
  const next = new Set(selected.value)
  if (checked) next.add(locale)
  else next.delete(locale)
  selected.value = next
}

function reset() {
  selected.value = new Set()
}

async function ctaAction() {
  const tier = selectedTier.value
  if (!tier) return

  // Free plan: no payment — record a prospect/trial enrollment per selected
  // language (skipping ones already owned) and open the Library.
  if (isFree.value) {
    for (const locale of selected.value) {
      if (!store.activeFor(locale)) {
        store.enroll({
          locale,
          tierId: asTier(tier.id),
          status: 'trial',
          creditsTotal: 0,
          creditsConsumed: 0,
          wordsLearned: 0
        })
      }
    }
    await navigateTo('/library')
    return
  }

  // Payment-gateway stub — wired when billing lands (Supabase phase).
  console.info('[pricing] checkout', {
    tier: tier.id,
    languages: [...selected.value],
    total: total.value
  })
}
</script>

<template>
  <main class="mx-auto max-w-4xl">
    <header>
      <h1 class="text-3xl font-bold text-content">{{ copy('pricing.title', 'Pricing') }}</h1>
      <p class="mt-2 text-muted">{{ copy('pricing.tagline', 'Pick a tier, choose your languages, pay once.') }}</p>
    </header>

    <!-- prices.json missing or empty -->
    <p v-if="!tiers.length" class="mt-8 rounded-xl border border-edge bg-surface p-6 text-muted">
      {{ copy('pricing.empty', 'Pricing is being updated — please check back shortly.') }}
    </p>

    <template v-else>
      <!-- Tier selector -->
      <div class="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          v-for="tier in tiers"
          :key="tier.id"
          type="button"
          class="rounded-2xl border p-4 text-left transition"
          :class="tier.id === selectedTier?.id ? 'border-accent bg-accent-soft' : 'border-edge bg-surface hover:border-edge-strong'"
          :aria-pressed="tier.id === selectedTier?.id"
          @click="selectedTierId = tier.id"
        >
          <span class="block font-bold text-content">{{ copy(`pricing.tier_${tier.id}_name`, tier.name) }}</span>
          <span v-if="tier.tagline" class="block text-xs text-muted">{{ copy(`pricing.tier_${tier.id}_tagline`, tier.tagline) }}</span>
          <span v-if="tier.description" class="mt-1 block text-sm text-faint">{{ copy(`pricing.tier_${tier.id}_description`, tier.description) }}</span>
        </button>
      </div>

      <!-- Language checklist -->
      <section class="mt-8 overflow-hidden rounded-2xl border border-edge bg-surface">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-5 py-4">
          <h2 class="text-lg font-bold text-content">{{ copy('pricing.select', 'Select a language') }}</h2>
          <p class="text-sm text-muted">
            {{
              hasSelection
                ? `${selected.size} ${copy('pricing.selected', 'selected')} · ${copy('pricing.total', 'Total:')} ${formatPrice(total)}`
                : copy('pricing.continue', 'Select one or more languages to continue.')
            }}
          </p>
        </div>
        <ul class="divide-y divide-edge">
          <li v-for="l in languages" :key="l.locale" class="flex items-center gap-3 px-5 py-3">
            <input
              :id="`lang-${l.locale}`"
              type="checkbox"
              class="h-4 w-4 accent-accent"
              :checked="selected.has(l.locale)"
              @change="toggle(l.locale, ($event.target as HTMLInputElement).checked)"
            >
            <label :for="`lang-${l.locale}`" class="flex flex-1 cursor-pointer items-center gap-3">
              <LanguageFlag :code="l.flag" :label="languageName(l.locale)" size="md" />
              <span class="font-medium text-content">{{ languageName(l.locale) }}</span>
              <span class="text-xs text-faint">{{ l.code }}</span>
            </label>
            <span class="font-semibold text-accent">{{ formatPrice(priceAt(l.locale)) }}</span>
          </li>
        </ul>
        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-edge px-5 py-4">
          <p class="text-sm text-muted">
            {{ hasSelection ? `${copy('pricing.total', 'Total:')} ${formatPrice(total)}` : copy('pricing.none', 'Nothing selected yet.') }}
          </p>
          <div class="flex gap-2">
            <button
              type="button"
              class="rounded-full px-5 py-2.5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
              :class="hasSelection ? 'bg-accent text-on-accent hover:bg-accent-strong' : 'bg-soft text-faint'"
              :disabled="!hasSelection"
              @click="ctaAction"
            >
              {{ ctaLabel }}
            </button>
            <button
              type="button"
              class="rounded-full border px-5 py-2.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
              :class="hasSelection ? 'border-edge text-content hover:border-accent hover:text-accent' : 'border-edge text-faint'"
              :disabled="!hasSelection"
              @click="reset"
            >
              {{ copy('pricing.reset', 'Reset') }}
            </button>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>

