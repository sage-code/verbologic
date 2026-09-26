// Article page — /learn/:locale/:track/:topic/:id/:doc — prerendered per
// explanation-locale doc: content/track/trackLang/TOPIC/ID/locale.md (no
// angle brackets here — the SFC parser scans top-level tags).
// ANY track can host article topics (Dictionary · Lectures · Stories) — the
// route is track-agnostic and validates the track id. The content query runs
// at BUILD time (SSR/prerender) — the browser never loads the content
// database. The topic payload (video URL, related rows) is fetched
// client-side like every other media payload.
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowLeftIcon, ClockIcon, FilmIcon } from '@heroicons/vue/24/outline'
import { TRACK_IDS, type TrackId } from '~/data/tracks'
import ArticleRail from '~/components/roadmap/ArticleRail.vue'
import { LECTURE_ROWS_KEY } from '~/lib/lectureRows'
import { useMedia } from '~/composables/useMedia'
import type { MediaRecord, MediaRow, MediaRecords } from '~/types/media'

const route = useRoute()
const { lang: uiLang } = useLocale()
const copy = useCopy()
const media = useMedia()

const segment = (value: unknown): string => (Array.isArray(value) ? value[0] : (value as string) ?? '') ?? ''

const trackLang = computed(() => segment(route.params.locale))
const track = computed(() => segment(route.params.track))
const topicCode = computed(() => segment(route.params.topic))
const articleId = computed(() => segment(route.params.id))
const docLocale = computed(() => segment(route.params.doc))

// Unknown track id → hard 404 (keeps crawlers and deep links honest).
if (!(TRACK_IDS as readonly string[]).includes(track.value)) {
  throw createError({ statusCode: 404, statusMessage: 'Track not found', fatal: true })
}

/** The doc for this page's locale, else the canonical one (marked fallback). */
const { data: page, error } = await useAsyncData(
  `article-${track.value}-${trackLang.value}-${topicCode.value}-${articleId.value}-${docLocale.value}`,
  async () => {
    const mine = await queryCollection('articles')
      .where('article', '=', articleId.value)
      .where('topic', '=', topicCode.value)
      .where('track', '=', track.value)
      .where('locale', '=', docLocale.value)
      .first()
    if (mine) return { doc: mine, fallback: false }
    // Fall back to the canonical document: lectures → en, other tracks → the
    // track language (mirrors scripts/media-index.mjs' EN_CANONICAL rule).
    const canonicalLocale = track.value === 'lectures' ? 'en' : trackLang.value
    const canonical = await queryCollection('articles')
      .where('article', '=', articleId.value)
      .where('topic', '=', topicCode.value)
      .where('track', '=', track.value)
      .where('locale', '=', canonicalLocale)
      .first()
    return canonical ? { doc: canonical, fallback: true } : null
  }
)

if (error.value || !page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Article not found', fatal: true })
}

const doc = computed(() => page.value?.doc ?? null)
const isFallback = computed(() => page.value?.fallback ?? false)

/** Available docs of this article (the locale switcher chips). */
const availableLocales = computed<string[]>(() =>
  Object.keys((doc.value as { locales?: Record<string, unknown> } | null)?.locales ?? {})
)

// --- Topic payload (client-side): video URL, related rows, ::term lookups ---

const record = ref<MediaRecord | null>(null)
const rowsById = ref<Map<string, MediaRow>>(new Map())

onMounted(async () => {
  const list = await media
    .fetchTopic(`library/${track.value}`, topicCode.value)
    .catch(() => [] as MediaRecords)
  const article = list.find((r: MediaRecord) => r.id === articleId.value) ?? null
  record.value = article
  const map = new Map<string, MediaRow>()
  for (const row of list) map.set(row.entity_id, row)
  for (const row of article?.related ?? []) map.set(row.entity_id, row)
  rowsById.value = map
})

provide(LECTURE_ROWS_KEY, rowsById)

/** Localized titles per doc — deep links stay stable across translations. */
useSeoMeta({
  title: () => doc.value?.title ?? 'Article',
  description: () => doc.value?.summary ?? ''
})
</script>

<template>
  <main class="app-container grid gap-5 py-6 lg:grid-cols-[280px_minmax(0,1fr)]">
    <!-- Desktop: the track's chapter/topic rail stays beside the article -->
    <ArticleRail :lang="trackLang" :track="track as TrackId" :topic="topicCode" />

    <div class="min-w-0">
      <nav class="flex items-center gap-2 text-sm text-muted">
        <a :href="`/learn/${trackLang}/${track}`" class="inline-flex items-center gap-1.5 transition hover:text-accent">
          <ArrowLeftIcon class="h-4 w-4" aria-hidden="true" />
          {{ copy('roadmap.back_to_topics', 'All topics') }}
        </a>
        <span class="text-faint">/</span>
        <span class="font-code text-xs text-faint">{{ topicCode }}</span>
      </nav>

      <article class="mt-4 space-y-5">
        <header class="space-y-2">
          <h1 class="text-3xl font-bold text-content">{{ doc?.title }}</h1>
          <p v-if="doc?.summary" class="text-muted">{{ doc.summary }}</p>
          <div class="flex flex-wrap items-center gap-2 text-xs text-faint">
            <span v-if="doc?.minutes" class="inline-flex items-center gap-1">
              <ClockIcon class="h-3.5 w-3.5" aria-hidden="true" /> {{ doc.minutes }} min
            </span>
            <span
              class="rounded-full px-2 py-0.5"
              :class="doc?.status === 'reviewed' ? 'bg-accent-soft text-accent' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200'"
            >
              {{ doc?.status === 'reviewed' ? copy('lecture.reviewed', 'Reviewed') : copy('lecture.draft', 'Draft — review pending') }}
            </span>
            <span v-if="isFallback" class="rounded-full bg-soft px-2 py-0.5 text-muted">
              {{ copy('lecture.not_translated', 'Not translated yet — showing English') }}
            </span>
          </div>

          <!-- Locale switcher: every doc this article has -->
          <div v-if="availableLocales.length > 1" class="flex flex-wrap gap-1.5 pt-1">
            <a
              v-for="locale in availableLocales"
              :key="locale"
              :href="`/learn/${trackLang}/${track}/${topicCode}/${articleId}/${locale}`"
              class="rounded-full border px-2.5 py-0.5 font-code text-xs uppercase transition"
              :class="locale === docLocale ? 'border-accent bg-accent-soft text-accent' : 'border-edge text-muted hover:border-accent hover:text-accent'"
            >
              {{ locale }}
            </a>
          </div>
        </header>

        <!-- The embedded video — pending manifests render the coming-soon card -->
        <div
          v-if="record?.media.mime?.startsWith('video/')"
          class="overflow-hidden rounded-lg border border-edge bg-surface"
        >
          <video v-if="record.media.url" :src="record.media.url" controls preload="metadata" class="aspect-video w-full" />
          <div v-else class="flex aspect-video w-full items-center justify-center gap-2 text-sm text-faint">
            <FilmIcon class="h-5 w-5" aria-hidden="true" />
            {{ copy('ui.video_coming_soon', 'Video coming soon') }}
          </div>
        </div>

        <!-- The article prose — prerendered HTML (ContentRenderer hydrates it) -->
        <ContentRenderer v-if="doc" :value="doc" class="lecture-prose space-y-4 text-content" />

        <!-- Practise: the records the prose points at -->
        <section v-if="record?.related?.length" class="space-y-2">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-faint">
            {{ copy('lecture.practice', 'Practise these') }}
          </h2>
          <ul class="grid gap-2 sm:grid-cols-2">
            <li
              v-for="row in record.related"
              :key="row.entity_id"
              class="flex items-center gap-3 rounded-lg border border-edge bg-surface px-3 py-2"
            >
              <MediaViewer :src="row.media.url" :label="row.term" />
              <span class="min-w-0">
                <span class="block font-medium text-content">{{ row.names[uiLang] || row.term }}</span>
                <span v-if="row.ipa" class="block font-code text-xs text-muted">{{ row.ipa }}</span>
              </span>
            </li>
          </ul>
        </section>
      </article>
    </div>
  </main>
</template>