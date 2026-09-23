// Learn track page — /learn/:locale/:track over the three per-language tracks
// (Dictionary · Lectures · Stories). Dictionary renders the shared RoadmapShell
// template when the language has live content (ro/en); every other combination
// shows the localized coming-soon card. All 27 language × track combinations
// are prerendered (see nuxt.config.ts nitro.prerender.routes).
<script setup lang="ts">
// NOTE: `computed` is imported explicitly (not the Nuxt auto-import) — on this
// dynamic-route page the auto-imported binding resolves to `any`, which breaks
// the typed `computed<TrackId>` below under `noImplicitAny`.
import { computed, type Component } from 'vue'
import { AcademicCapIcon, BookmarkIcon, BookOpenIcon } from '@heroicons/vue/24/outline'
import { TRACK_IDS, isTrackLive, type TrackId } from '~/data/tracks'

const route = useRoute()
const copy = useCopy()
const { lang: uiLang, setLocale, isLoaded } = useLocale()
const { languages, languageName } = useNavigation()

// Preload UI chrome on the client (mirrors the other pages).
onMounted(() => {
  if (!isLoaded()) void setLocale(uiLang.value)
})

/** First segment for a possibly-repeated route param. */
const segment = (value: string | string[]): string =>
  (Array.isArray(value) ? value[0] : value) ?? ''

const locale = computed<string>(() => segment(route.params.locale))
const track = computed<string>(() => segment(route.params.track))

const knownLocale = computed(() => languages.some((l) => l.locale === locale.value))
const knownTrack = computed(() => (TRACK_IDS as readonly string[]).includes(track.value))

// Unknown language or track id → hard 404 (keeps crawlers and deep links honest).
if (!knownLocale.value || !knownTrack.value) {
  throw createError({ statusCode: 404, statusMessage: 'Track not found', fatal: true })
}

const trackId = computed<TrackId>(() => track.value as TrackId)

/** ISO country flag for a locale, falling back to the locale code itself. */
const flagFor = (loc: string): string => languages.find((l) => l.locale === loc)?.flag ?? loc

/** Track titles + icons — one entry per TRACK_IDS entry. */
const TRACK_META: Record<TrackId, { icon: Component; titleKey: string; fallback: string }> = {
  dictionary: { icon: BookOpenIcon, titleKey: 'track.dictionary_title', fallback: 'Dictionary' },
  lectures: { icon: AcademicCapIcon, titleKey: 'track.lectures_title', fallback: 'Lectures' },
  stories: { icon: BookmarkIcon, titleKey: 'track.stories_title', fallback: 'Stories' }
}

const meta = computed(() => TRACK_META[trackId.value])
const title = computed(() => copy(meta.value.titleKey, meta.value.fallback))
const live = computed(() => isTrackLive(locale.value, trackId.value))
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-4">
    <header class="flex flex-wrap items-center gap-3">
      <LanguageFlag :code="flagFor(locale)" :label="languageName(locale)" size="md" />
      <h1 class="text-2xl font-bold text-content">
        {{ languageName(locale) }} — {{ title }}
      </h1>
      <component :is="meta.icon" class="h-6 w-6 text-accent" aria-hidden="true" />
      <!-- Meter slot: DictionaryLayout teleports its two progress meters here —
           right half of the free space, right-aligned with the table edge -->
      <div class="hidden flex-1 justify-end sm:flex">
        <div id="track-meters" class="flex w-1/2 items-end gap-4" />
      </div>
    </header>

    <!-- Live track: the shared roadmap template (chapter sidebar → topics → words) -->
    <section v-if="live" class="mt-3">
      <!-- :key forces a remount when the locale param changes — RoadmapShell
           loads its store data in onMounted only. :track selects the per-track
           layout (Dictionary has its own; Lectures/Stories use the fallback). -->
      <RoadmapShell :key="locale" :lang="locale" :track="trackId" />
    </section>

    <!-- Coming soon: the track has no live content for this language yet -->
    <section v-else class="mt-3 rounded-2xl border border-edge bg-surface p-8 text-center">
      <component :is="meta.icon" class="mx-auto h-10 w-10 text-faint" aria-hidden="true" />
      <h2 class="mt-3 text-lg font-bold text-content">
        {{ copy('track.coming_soon_title', 'This track is coming soon') }}
      </h2>
      <p class="mx-auto mt-2 max-w-md text-sm text-muted">
        {{ copy('track.coming_soon_body', 'We are preparing this track. Check back soon — your progress is safe.') }}
      </p>
    </section>
  </main>
</template>