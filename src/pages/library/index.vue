// Library — "Your Library": one panel per owned language with per-language
// progress (credits consumed/left, words learned) and three track buttons
// (Dictionary · Lectures · Stories) opening /learn/:locale/:track.
// The + Add Language button opens the single-select language dialog, which
// enrolls through libraryStore.enroll() — the same write seam the old pricing
// checkout used. Data source: libraryStore — the enrollments_overview view
// when signed in to Supabase, localStorage otherwise.
<script setup lang="ts">
import type { Component } from 'vue'
import { XMarkIcon } from '@heroicons/vue/20/solid'
import { AcademicCapIcon, BookmarkIcon, BookOpenIcon, Cog6ToothIcon, PlusIcon } from '@heroicons/vue/24/outline'
import type { Enrollment } from '~/stores/libraryStore'
import { useLibraryStore } from '~/stores/libraryStore'
import { TRACK_IDS, isTrackLive, trackFor, type TrackId } from '~/data/tracks'

const copy = useCopy()
const { lang, setLocale, isLoaded } = useLocale()
const { languages, languageName } = useNavigation()
const store = useLibraryStore()
const supabase = useSupabase()
const userStore = useUserStore()

// Add Language dialog visibility (the dialog mounts fresh each open).
const addOpen = ref(false)

// Locale whose credit-settings dialog is open (null = closed; the dialog
// mounts fresh each open, so the draft allocation always starts current).
const settingsLocale = ref<string | null>(null)

/** The enrollment for the open settings dialog, if still visible. */
const settingsEnrollment = computed(
  () => (settingsLocale.value ? (store.activeFor(settingsLocale.value) ?? null) : null)
)

// Preload UI chrome + local data on the client (mirrors the other pages).
// hydrate() MUST run before any dialog-driven enroll(): enroll() → persist()
// rewrites the whole localStorage array, so enrolling on an un-hydrated store
// would wipe saved enrollments.
onMounted(() => {
  store.hydrate()
  if (!isLoaded()) void setLocale(lang.value)
  void loadFromSupabase()
})

/** Signed-in refresh: the enrollments_overview view is authoritative. */
async function loadFromSupabase() {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  if (!data.session) return
  const { data: rows, error } = await supabase
    .from('enrollments_overview')
    .select('*')
    .eq('user_id', data.session.user.id)
    .order('updated_at', { ascending: false })
  if (error) {
    console.warn('[library] overview load failed', error.message)
    return
  }
  if (rows) store.setFromOverview(rows)
}

/** ISO country flag for a locale, falling back to the locale code itself. */
function flagFor(locale: string): string {
  return languages.find((l) => l.locale === locale)?.flag ?? locale
}

/** Words-learned percentage for the progress bar (0 without a word total). */
function progress(e: Enrollment): number {
  const meta = trackFor(e.locale)
  return meta.words > 0 ? Math.min(100, Math.round((e.wordsLearned / meta.words) * 100)) : 0
}

/** Icon + copy per track id — mirrors the /learn/:locale/:track pages. */
const TRACK_META: Record<TrackId, { icon: Component; key: string; fallback: string }> = {
  dictionary: { icon: BookOpenIcon, key: 'track.dictionary_title', fallback: 'Dictionary' },
  lectures: { icon: AcademicCapIcon, key: 'track.lectures_title', fallback: 'Lectures' },
  stories: { icon: BookmarkIcon, key: 'track.stories_title', fallback: 'Stories' }
}
</script>

<template>
  <main class="mx-auto max-w-3xl">
    <!-- Title row: heading left, discreet Add Language action right
         (hidden while the library is empty — the big accent button in the
         empty-state card is the entry point then). bg-body blends with the
         page background: dark on dark theme, almost white on light. -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-3xl font-bold text-content">{{ copy('library.title', 'Your Library') }}</h1>
      <button
        v-if="!store.isEmpty"
        type="button"
        class="inline-flex items-center gap-2 rounded-full border border-edge bg-body px-4 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-accent"
        @click="addOpen = true"
      >
        <PlusIcon class="h-4 w-4" aria-hidden="true" />
        {{ copy('library.add_language', 'Add Language') }}
      </button>
    </div>
    <p class="mt-2 text-muted">{{ copy('library.subtitle', 'Manage your languages and view your progress.') }}</p>

    <!-- Empty state: nothing visible — either nothing added, or everything hidden -->
    <div v-if="store.isEmpty" class="mt-8 rounded-2xl border border-edge bg-surface p-8 text-center">
      <p class="text-muted">{{ copy('library.empty_intro', 'Add one or more languages and start learning.') }}</p>
      <p v-if="store.hiddenCount > 0" class="mt-2 text-sm text-faint">
        {{ copy('library.hidden_hint', 'Hidden languages keep their progress — add them back any time.') }}
      </p>
      <button
        type="button"
        class="mt-4 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 font-semibold text-on-accent shadow-sm transition hover:bg-accent-strong"
        @click="addOpen = true"
      >
        <PlusIcon class="h-5 w-5" aria-hidden="true" />
        {{ copy('library.add_language', 'Add Language') }}
      </button>
    </div>

    <!-- One panel per visible language, stacked -->
    <ul v-else class="mt-8 space-y-4">
      <li
        v-for="e in store.visible"
        :key="e.locale"
        class="rounded-2xl border border-edge bg-surface p-6"
      >
        <!-- Language identity + hide button (top-right; hides, never forgets) -->
        <div class="flex flex-wrap items-center gap-3">
          <LanguageFlag :code="flagFor(e.locale)" :label="languageName(e.locale)" size="md" />
          <h2 class="text-lg font-bold text-content">{{ languageName(e.locale) }}</h2>
          <span class="text-xs font-semibold tracking-wide text-faint">{{ e.locale.toUpperCase() }}</span>
          <!-- Gear: per-language credit settings (round, left-aligned next to
               the identity; the ✕ stays at the far right) -->
          <button
            type="button"
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-edge text-muted transition hover:border-accent hover:text-accent"
            :aria-label="`${copy('library.settings_title', 'Credit settings')} — ${languageName(e.locale)}`"
            :title="copy('library.settings_title', 'Credit settings')"
            @click="settingsLocale = e.locale"
          >
            <Cog6ToothIcon class="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-edge text-muted transition hover:border-accent hover:text-accent"
            :aria-label="`${copy('library.hide', 'Hide')} ${languageName(e.locale)}`"
            :title="copy('library.hide_hint', 'Hide from your library — progress is kept')"
            @click="store.hide(e.locale)"
          >
            <XMarkIcon class="h-5 w-5" aria-hidden="true" />
          </button>
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

        <!-- Three track buttons: Dictionary · Lectures · Stories -->
        <div class="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <template v-for="id in TRACK_IDS" :key="id">
            <NuxtLink
              v-if="isTrackLive(e.locale, id)"
              :to="trackFor(e.locale).tracks[id]!"
              class="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 font-semibold text-on-accent transition hover:bg-accent-strong"
            >
              <component :is="TRACK_META[id].icon" class="h-5 w-5 shrink-0" aria-hidden="true" />
              {{ copy(TRACK_META[id].key, TRACK_META[id].fallback) }}
            </NuxtLink>
            <span
              v-else
              class="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-full border border-edge px-4 py-2.5 font-medium text-faint"
              :aria-disabled="true"
              :title="copy('track.coming_soon_title', 'This track is coming soon')"
            >
              <component :is="TRACK_META[id].icon" class="h-5 w-5 shrink-0" aria-hidden="true" />
              {{ copy(TRACK_META[id].key, TRACK_META[id].fallback) }}
            </span>
          </template>
        </div>
      </li>
    </ul>

    <!-- Single-select "Select language" dialog (round ✕ top-right via AppDialog) -->
    <AddLanguageDialog v-if="addOpen" @close="addOpen = false" />

    <!-- Per-language credit settings (gear button; Apply commits, Cancel/✕ discards) -->
    <LanguageCreditSettings
      v-if="settingsEnrollment"
      :enrollment="settingsEnrollment"
      @close="settingsLocale = null"
    />
  </main>
</template>
