// Article page — /learn/:locale/:track/:topic/:id/:doc. Dictionary and lecture
// Markdown are shared across target languages; the route locale selects that
// language's records while the final segment selects the explanation text.
// Article prose is queried at build time; media records load client-side.
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowLeftIcon, ArrowRightIcon, ArrowsRightLeftIcon, ClockIcon, FilmIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { TRACK_IDS, type TrackId } from '~/data/tracks'
import ArticleRail from '~/components/roadmap/ArticleRail.vue'
import { LECTURE_ROWS_KEY } from '~/lib/lectureRows'
import { DICTIONARY_TERM_KEY } from '~/lib/dictionary-term'
import { glossName } from '~/lib/dictionarySearch'
import { useMedia } from '~/composables/useMedia'
import type { MediaRecord, MediaRow } from '~/types/media'

definePageMeta({ key: (pageRoute) => pageRoute.path })

const route = useRoute()
const { lang: uiLang } = useLocale()
const { languageName } = useNavigation()
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

/** The Markdown doc for this locale, else its canonical translation. */
const { data: markdownPage, error: markdownError } = await useAsyncData(
  `article-${track.value}-${trackLang.value}-${topicCode.value}-${articleId.value}-${docLocale.value}`,
  async () => {
    const docs = await queryCollection('articles')
      .where('article', '=', articleId.value)
      .where('topic', '=', topicCode.value)
      .where('track', '=', track.value)
      .all()
    const findDoc = (locale: string) =>
      docs.find((doc) => doc.locale === locale && (!doc.trackLang || doc.trackLang === trackLang.value))
    const mine = findDoc(docLocale.value)
    if (mine) return { doc: mine, fallback: false }
    // Shared articles use English as the canonical original. Legacy stories
    // remain canonical in their learning language.
    const sharedStory = track.value === 'stories' && docs.some((doc) => !doc.trackLang)
    const canonicalLocale =
      track.value === 'lectures' || track.value === 'dictionary' || sharedStory ? 'en' : trackLang.value
    const canonical = findDoc(canonicalLocale)
    return canonical ? { doc: canonical, fallback: true } : null
  }
)

if (markdownError.value || !markdownPage.value) {
  throw createError({ statusCode: 404, statusMessage: 'Article not found', fatal: true })
}

const { data: articleDocs } = await useAsyncData(
  `article-locales-${track.value}-${trackLang.value}-${topicCode.value}-${articleId.value}`,
  async () => {
    const docs = await queryCollection('articles')
      .where('article', '=', articleId.value)
      .where('topic', '=', topicCode.value)
      .where('track', '=', track.value)
      .all()
    return docs.filter((doc) => !doc.trackLang || doc.trackLang === trackLang.value)
  }
)

const record = ref<MediaRecord | null>(null)
const nativeRecord = ref<MediaRecord | null>(null)
const rowsById = ref<Map<string, MediaRow>>(new Map())
const mediaError = ref<string | null>(null)
/**
 * Every article — story, lecture or dictionary — renders as two side-by-side
 * panels: the learning language on the left, the reader's own language on the
 * right. Only the story track paginates; lectures and dictionary articles show
 * the whole document in each panel.
 */
const storyMode = computed(() => track.value === 'stories')
const markdownDoc = computed(() => markdownPage.value?.doc ?? null)
const storyTargetDoc = computed(
  () => articleDocs.value?.find((doc) => doc.locale === trackLang.value) ?? markdownDoc.value
)
const storyNativeDoc = computed(
  () =>
    articleDocs.value?.find((doc) => doc.locale === docLocale.value) ??
    articleDocs.value?.find((doc) => doc.locale === uiLang.value) ??
    storyTargetDoc.value
)
/** True when the two panels would show the same document (nothing to compare). */
const hasTranslation = computed(() => storyNativeDoc.value !== storyTargetDoc.value)

/** Top-level body nodes of a doc (Nuxt Content minimark tuples). */
const bodyNodes = (doc: unknown): unknown[] =>
  (doc as { body?: { value?: unknown[] } } | null)?.body?.value ?? []

/**
 * Split a document into pages — ONE rule for every track, so stories, lectures
 * and dictionary articles read through the same template:
 * - a document with section headings (h2/h3) starts a new page at each heading
 *   and carries the blocks beneath it (lectures, dictionary articles);
 * - a document with no headings paginates one paragraph per page (stories).
 */
function paginate(nodes: unknown[]): unknown[][] {
  const isHeading = (n: unknown) =>
    Array.isArray(n) && (n[0] === 'h2' || n[0] === 'h3')
  const isParagraph = (n: unknown) => Array.isArray(n) && n[0] === 'p'

  if (!nodes.some(isHeading)) {
    return nodes.filter(isParagraph).map((n) => [n])
  }
  const pages: unknown[][] = []
  let current: unknown[] | null = null
  for (const node of nodes) {
    if (!Array.isArray(node)) continue
    if (isHeading(node)) {
      if (current) pages.push(current)
      current = [node]
    } else if (current) {
      current.push(node)
    } else {
      current = [node]
    }
  }
  if (current) pages.push(current)
  return pages
}

const targetPages = computed(() => paginate(bodyNodes(storyTargetDoc.value)))
const nativePages = computed(() => paginate(bodyNodes(storyNativeDoc.value)))
/** Pages to page through — the longer of the two panels, never zero. */
const storyPageCount = computed(() =>
  Math.max(targetPages.value.length, nativePages.value.length, 1)
)
const storyPage = ref(0)
/**
 * Which panel is visible on narrow screens. Desktop always shows both side by
 * side; below `lg` only one fits, so a small toggle switches between the
 * learning-language text and its translation.
 */
const storyMobilePanel = ref<'target' | 'native'>('target')
const targetPlayer = ref<{ stop: () => void } | null>(null)
const nativePlayer = ref<{ stop: () => void } | null>(null)

function toggleStoryPanel() {
  storyMobilePanel.value = storyMobilePanel.value === 'target' ? 'native' : 'target'
  // The hidden panel keeps its audio element mounted — silence it on switch.
  targetPlayer.value?.stop()
  nativePlayer.value?.stop()
}
const storyTargetPage = computed(() => {
  const doc = storyTargetDoc.value
  if (!doc) return null
  const page = targetPages.value[storyPage.value]
  return page ? { ...doc, body: { ...doc.body, value: page } } : null
})
const storyNativePage = computed(() => {
  const doc = storyNativeDoc.value
  if (!doc) return null
  const page = nativePages.value[storyPage.value]
  return page ? { ...doc, body: { ...doc.body, value: page } } : null
})
const storyTargetName = computed(() => languageName(trackLang.value))
const storyNativeName = computed(() => languageName(docLocale.value))
/** Full-article read recordings, one per panel language. */
const storyTargetRead = computed(() => record.value?.read?.url ?? null)
const storyNativeRead = computed(() => nativeRecord.value?.read?.url ?? null)
/** Dictionary/lecture articles read in the explanation language (the doc locale). */
const articleRead = computed(
  () => nativeRecord.value?.read?.url ?? record.value?.read?.url ?? null
)
const targetTerm = computed(() =>
  markdownDoc.value?.terms?.[trackLang.value] ?? record.value?.term ?? ''
)
const articleTitle = computed(() => {
  const title = (storyMode.value ? storyTargetDoc.value?.title : markdownDoc.value?.title) ?? 'Article'
  return title.replace(/\{\{term\}\}/g, (match, offset: number) => {
    const term = targetTerm.value
    if (offset === 0 && term) return term[0].toLocaleUpperCase() + term.slice(1)
    return term || match
  })
})
const articleSummary = computed(() =>
  (storyMode.value ? storyTargetDoc.value?.summary : markdownDoc.value?.summary) ?? ''
)
const articleStatus = computed(() => markdownDoc.value?.status ?? 'draft')
const articleMinutes = computed(() => markdownDoc.value?.minutes ?? null)
const isFallback = computed(() => markdownPage.value?.fallback ?? false)

/** Available explanation locales, known during prerender for indexable links. */
const availableLocales = computed<string[]>(() => articleDocs.value?.map((doc) => doc.locale) ?? [])
watch(
  () => [articleId.value, storyPageCount.value],
  () => {
    storyPage.value = 0
    storyMobilePanel.value = 'target'
  }
)
watch(storyPageCount, (count) => {
  if (storyPage.value >= count) storyPage.value = Math.max(0, count - 1)
})

function moveStoryPage(direction: -1 | 1) {
  storyPage.value = Math.min(Math.max(0, storyPage.value + direction), storyPageCount.value - 1)
}

onMounted(async () => {
  try {
    const list = await media.fetchTopic(`library/${track.value}`, topicCode.value)
    const targetRows = list.filter((r: MediaRecord) => r.lang === trackLang.value)
    const article = targetRows.find((r: MediaRecord) => r.id === articleId.value) ?? null
    record.value = article
    // The translation panel reads its own language's recording.
    nativeRecord.value =
      list.find((r: MediaRecord) => r.lang === docLocale.value && r.id === articleId.value) ?? null
    const map = new Map<string, MediaRow>()
    for (const row of targetRows) map.set(row.entity_id, row)
    for (const row of article?.related ?? []) map.set(row.entity_id, row)
    rowsById.value = map
  } catch (cause) {
    mediaError.value = cause instanceof Error ? cause.message : String(cause)
  }
})

provide(LECTURE_ROWS_KEY, rowsById)
provide(DICTIONARY_TERM_KEY, targetTerm)

/** Localized titles per doc — deep links stay stable across translations. */
useSeoMeta({
  title: () => articleTitle.value,
  description: () => articleSummary.value
})
</script>

<template>
  <main
    class="app-container grid gap-5 py-6 lg:grid-cols-[280px_minmax(0,1fr)]"
    :class="'min-h-0 overflow-hidden'"
  >
    <!-- Desktop: the track's chapter/topic rail stays beside the article -->
    <ArticleRail :lang="trackLang" :track="track as TrackId" :topic="topicCode" />

    <div class="flex min-w-0 min-h-0 flex-col">
      <nav class="flex items-center gap-2 text-sm text-muted">
        <a :href="`/learn/${trackLang}/${track}`" class="inline-flex items-center gap-1.5 transition hover:text-accent">
          <ArrowLeftIcon class="h-4 w-4" aria-hidden="true" />
          {{ copy('roadmap.back_to_topics', 'All topics') }}
        </a>
        <span class="text-faint">/</span>
        <span class="hidden font-code text-xs text-faint sm:inline">{{ topicCode }}</span>
      </nav>

      <article class="mt-4 flex min-h-0 flex-1 flex-col gap-3">
        <header class="shrink-0 space-y-2">
          <div class="flex items-start justify-between gap-3">
            <h1 class="min-w-0 text-3xl font-bold text-content">{{ articleTitle }}</h1>
            <!-- Close: back to the topic's table, the same target as the breadcrumb -->
            <a
              :href="`/learn/${trackLang}/${track}?chapter=${topicCode.slice(0, 4)}&topic=${topicCode}`"
              class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-edge bg-surface text-muted transition hover:border-accent hover:text-accent"
              :aria-label="copy('ui.close', 'Close')"
              :title="copy('roadmap.back_to_topics', 'All topics')"
            >
              <XMarkIcon class="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
          <p v-if="articleSummary" class="text-muted">{{ articleSummary }}</p>
          <div class="flex flex-wrap items-center gap-2 text-xs text-faint">
            <span v-if="articleMinutes" class="inline-flex items-center gap-1">
              <ClockIcon class="h-3.5 w-3.5" aria-hidden="true" /> {{ articleMinutes }} min
            </span>
            <span
              class="rounded-full px-2 py-0.5"
              :class="articleStatus === 'reviewed' ? 'bg-accent-soft text-accent' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200'"
            >
              {{ articleStatus === 'reviewed' ? copy('lecture.reviewed', 'Reviewed') : copy('lecture.draft', 'Draft — review pending') }}
            </span>
            <span v-if="isFallback" class="rounded-full bg-soft px-2 py-0.5 text-muted">
              {{ copy('lecture.not_translated', 'Not translated yet — showing English') }}
            </span>
          </div>

          <!-- Locale switcher is for explanatory articles, not story translation panes. -->
          <div v-if="!storyMode && availableLocales.length > 1" class="flex flex-wrap gap-1.5 pt-1">
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

        <p
          v-if="mediaError"
          class="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200"
          role="alert"
        >
          Could not load this language's media: {{ mediaError }}
        </p>

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

        <!-- Two panels for every article: learning language left, native right.
             Stories paginate; lectures and dictionary articles show the whole doc. -->
        <section class="flex min-h-0 flex-1 flex-col gap-3">
          <div class="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-2">
            <section
              class="min-w-0 flex-col overflow-hidden rounded-lg border border-edge bg-surface p-3 sm:p-5"
              :class="storyMobilePanel === 'target' ? 'flex' : 'hidden lg:flex'"
            >
              <div class="mb-3 flex items-center justify-between gap-2 border-b border-edge pb-2">
                <h2 class="text-xs font-semibold uppercase tracking-wide text-accent">
                  {{ storyTargetName }} · {{ copy('stories.learning_text', 'Learning language') }}
                </h2>
                <ArticleReadPlayer ref="targetPlayer" :src="storyTargetRead" :label="storyTargetName" />
              </div>
              <ContentRenderer
                v-if="storyTargetPage"
                :value="storyTargetPage"
                class="lecture-prose story-page-content min-h-0 flex-1 overflow-y-auto text-sm leading-relaxed text-content sm:text-base"
              />
            </section>
            <section
              v-if="hasTranslation"
              class="min-w-0 flex-col overflow-hidden rounded-lg border border-edge bg-surface p-3 sm:p-5"
              :class="storyMobilePanel === 'native' ? 'flex' : 'hidden lg:flex'"
            >
              <div class="mb-3 flex items-center justify-between gap-2 border-b border-edge pb-2">
                <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">
                  {{ storyNativeName }} · {{ copy('stories.translation', 'Translation') }}
                </h2>
                <ArticleReadPlayer ref="nativePlayer" :src="storyNativeRead" :label="storyNativeName" />
              </div>
              <ContentRenderer
                v-if="storyNativePage"
                :value="storyNativePage"
                class="lecture-prose story-page-content min-h-0 flex-1 overflow-y-auto text-sm leading-relaxed text-content sm:text-base"
              />
            </section>
          </div>
          <div class="flex shrink-0 items-center justify-center gap-3">
            <button
              v-if="hasTranslation"
              type="button"
              class="inline-flex h-9 items-center gap-2 rounded-full border border-edge bg-surface px-4 text-sm text-content transition hover:border-accent lg:hidden"
              :aria-pressed="storyMobilePanel === 'native'"
              :aria-label="copy('stories.switch_panel', 'Switch language')"
              @click="toggleStoryPanel"
            >
              <ArrowsRightLeftIcon class="h-4 w-4" aria-hidden="true" />
              {{ storyMobilePanel === 'target' ? storyNativeName : storyTargetName }}
            </button>
            <nav
              v-if="storyPageCount > 1"
              class="flex items-center justify-center gap-4"
              :aria-label="copy('stories.page_navigation', 'Story pages')"
            >
              <button
                type="button"
                class="inline-flex h-9 items-center gap-2 rounded-full border border-edge bg-surface px-4 text-sm text-content transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="storyPage === 0"
                @click="moveStoryPage(-1)"
              >
                <ArrowLeftIcon class="h-4 w-4" aria-hidden="true" />
                {{ copy('stories.previous_page', 'Previous') }}
              </button>
              <span class="font-code text-xs text-muted" aria-live="polite">
                {{ storyPage + 1 }} / {{ storyPageCount }}
              </span>
              <button
                type="button"
                class="inline-flex h-9 items-center gap-2 rounded-full border border-edge bg-surface px-4 text-sm text-content transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="storyPage >= storyPageCount - 1"
                @click="moveStoryPage(1)"
              >
                {{ copy('stories.next_page', 'Next') }}
                <ArrowRightIcon class="h-4 w-4" aria-hidden="true" />
              </button>
            </nav>
          </div>
        </section>
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
                <span class="block font-medium text-content">{{ glossName(row.names, row.lang, uiLang) || row.term }}</span>
                <span v-if="glossName(row.names, row.lang, uiLang)" class="block text-sm text-muted">{{ row.term }}</span>
                <span v-if="row.ipa" class="block ipa text-xs text-muted">{{ row.ipa }}</span>
              </span>
            </li>
          </ul>
        </section>
      </article>
    </div>
  </main>
</template>

<style scoped>
.story-page-content :deep(p) {
  margin: 0;
}
</style>