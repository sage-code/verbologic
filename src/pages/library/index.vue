// Library — read-only panels for the languages the user has ordered/subscribed
// to, with per-language progress (credits consumed/left, words learned).
// Data arrives via libraryStore (localStorage now, Supabase in Phase 5);
// until then the page renders its localized empty state.
<script setup lang="ts">
import type { Enrollment } from '~/stores/libraryStore'
import { useLibraryStore } from '~/stores/libraryStore'
import { trackFor } from '~/data/tracks'

const copy = useCopy()
const { t } = useLocale()
const { lang, setLocale, isLoaded } = useLocale()
const { languages } = useNavigation()
const store = useLibraryStore()

// Preload UI chrome + local data on the client (mirrors the other pages).
onMounted(() => {
  store.hydrate()
  if (!isLoaded()) void setLocale(lang.value)
})

/** Language display name in the active interface language (code as fallback). */
function languageName(locale: string): string {
  return t(`languages.${locale}`) ?? locale.toUpperCase()
}

/** ISO country flag for a locale, falling back to the locale code itself. */
function flagFor(locale: string): string {
  return languages.find((l) => l.locale === locale)?.flag ?? locale
}

function tierLabel(tierId: Enrollment['tierId']): string {
  return copy(`library.tier_${tierId}`, tierId)
}

/** Words-learned percentage for the progress bar (0 without a word total). */
function progress(e: Enrollment): number {
  const meta = trackFor(e.locale)
  return meta.words > 0 ? Math.min(100, Math.round((e.wordsLearned / meta.words) * 100)) : 0
}
</script>

<template>
  <main class="mx-auto max-w-3xl">
    <h1 class="text-3xl font-bold text-content">{{ copy('library.title', 'Library') }}</h1>
    <p class="mt-2 text-muted">
      {{ copy('library.intro', 'Your languages and your progress in each — one panel per language.') }}
    </p>

    <!-- Empty state: nothing ordered/subscribed yet -->
    <div v-if="store.isEmpty" class="mt-8 rounded-2xl border border-edge bg-surface p-8 text-center">
      <p class="text-muted">{{ copy('library.empty', 'You have not ordered or subscribed to any language yet.') }}</p>
      <NuxtLink
        to="/pricing"
        class="mt-4 inline-block rounded-full bg-accent px-6 py-3 font-semibold text-on-accent shadow-sm transition hover:bg-accent-strong"
      >
        {{ copy('library.empty_cta', 'Browse languages') }}
      </NuxtLink>
    </div>

    <!-- One panel per owned language, stacked -->
    <ul v-else class="mt-8 space-y-4">
      <li
        v-for="e in store.sorted"
        :key="e.locale"
        class="rounded-2xl border border-edge bg-surface p-6"
      >
        <!-- Language identity + tier badge -->
        <div class="flex flex-wrap items-center gap-3">
          <LanguageFlag :code="flagFor(e.locale)" :label="languageName(e.locale)" size="md" />
          <h2 class="text-lg font-bold text-content">{{ languageName(e.locale) }}</h2>
          <span class="text-xs font-semibold tracking-wide text-faint">{{ e.locale.toUpperCase() }}</span>
          <span class="ml-auto rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
            {{ tierLabel(e.tierId) }}
          </span>
        </div>

        <!-- Progress stats -->
        <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div class="rounded-xl bg-soft p-4">
            <p class="text-2xl font-extrabold text-content">{{ e.creditsConsumed }}</p>
            <p class="text-xs text-muted">{{ copy('library.credits_consumed', 'Credits consumed') }}</p>
          </div>
          <div class="rounded-xl bg-soft p-4">
            <p class="text-2xl font-extrabold text-accent">{{ store.creditsLeft(e) }}</p>
            <p class="text-xs text-muted">{{ copy('library.credits_left', 'Credits left') }}</p>
          </div>
          <div class="rounded-xl bg-soft p-4">
            <p class="text-2xl font-extrabold text-content">{{ e.wordsLearned }}</p>
            <p class="text-xs text-muted">{{ copy('library.words_learned', 'Words learned') }}</p>
          </div>
        </div>

        <!-- Words-learned progress bar (only when the track has content) -->
        <div v-if="trackFor(e.locale).words > 0" class="mt-4">
          <div class="flex items-center justify-between text-xs text-muted">
            <span>{{ e.wordsLearned }} {{ copy('library.words_of', 'of') }} {{ trackFor(e.locale).words }}</span>
            <span>{{ progress(e) }}%</span>
          </div>
          <div class="mt-1 h-2 overflow-hidden rounded-full bg-soft">
            <div class="h-full rounded-full bg-accent transition-all" :style="{ width: `${progress(e)}%` }" />
          </div>
        </div>

        <!-- Track CTA -->
        <div class="mt-5">
          <NuxtLink
            v-if="trackFor(e.locale).route"
            :to="trackFor(e.locale).route!"
            class="inline-block rounded-full bg-accent px-5 py-2.5 font-semibold text-on-accent transition hover:bg-accent-strong"
          >
            {{ copy('library.continue', 'Continue learning') }}
          </NuxtLink>
          <span
            v-else
            class="inline-block cursor-not-allowed rounded-full border border-edge px-5 py-2.5 font-medium text-faint"
          >
            {{ copy('library.coming_soon', 'Track coming soon') }}
          </span>
        </div>
      </li>
    </ul>
  </main>
</template>
