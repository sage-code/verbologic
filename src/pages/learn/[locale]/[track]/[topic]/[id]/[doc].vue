// Article page — /learn/:locale/:track/:topic/:id/:doc. Article prose is
// queried at build time; media records load client-side.
//
// Panels differ by track, because the tracks differ in kind:
// - lectures are DIRECTIONAL: the article explains one target-language item,
//   so it has ONE panel, written in the reader's own language.
// - stories are REVERSIBLE: the same story is told in many languages, so it
//   has TWO panels — the learning language, then the reader's translation.
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowLeftIcon, ArrowRightIcon, ArrowsRightLeftIcon, ClockIcon, FilmIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { TRACK_IDS, type TrackId } from '~/data/tracks'
import ArticleRail from '~/components/roadmap/ArticleRail.vue'
import { LECTURE_ROWS_KEY } from '~/lib/lectureRows'
import { DICTIONARY_TERM_KEY } from '~/lib/dictionary-term'
import { glossName } from '~/lib/dictionarySearch'
import { useMedia } from '~/composables/useMedia'
import { mediaName } from '~/composables/useMedia'
import { useRoadmapStore } from '~/stores/roadmapStore'
import type { MediaRecord, MediaRow, StoryImage } from '~/types/media'

definePageMeta({ key: (pageRoute) => pageRoute.path })

const route = useRoute()
const { lang: uiLang, ensureLocale } = useLocale()
const { languageName, languages } = useNavigation()
const copy = useCopy()
const media = useMedia()

const segment = (value: unknown): string => (Array.isArray(value) ? value[0] : (value as string) ?? '') ?? ''

const trackLang = computed(() => segment(route.params.locale))
const track = computed(() => segment(route.params.track))
const topicCode = computed(() => segment(route.params.topic))
const articleId = computed(() => segment(route.params.id))
const docLocale = computed(() => segment(route.params.doc))

/** ISO country flag for a locale, falling back to the locale code itself. */
const flagFor = (loc: string): string => languages.find((l) => l.locale === loc)?.flag ?? loc

/** Track titles — one entry per TRACK_IDS entry (mirrors the track page). */
const TRACK_TITLES: Record<string, { key: string; fallback: string }> = {
  dictionary: { key: 'track.dictionary_title', fallback: 'Dictionary' },
  lectures: { key: 'track.lectures_title', fallback: 'Lectures' },
  stories: { key: 'track.stories_title', fallback: 'Stories' }
}
const trackTitle = computed(() => {
  const meta = TRACK_TITLES[track.value]
  return meta ? copy(meta.key, meta.fallback) : track.value
})

/**
 * The open topic's display name, for the breadcrumb line above the article.
 *
 * The article page does not load the sidebar itself, so this reads the roadmap
 * store the rail already initialised. Until it is ready the code stands in —
 * better a code than an empty gap.
 */
const roadmap = useRoadmapStore()
const topicName = computed(() => {
  const topic = roadmap.topic
  if (!topic) return topicCode.value
  return mediaName(topic.names, uiLang.value, topicCode.value)
})

// Unknown track id → hard 404 (keeps crawlers and deep links honest).
if (!(TRACK_IDS as readonly string[]).includes(track.value)) {
  throw createError({ statusCode: 404, statusMessage: 'Track not found', fatal: true })
}

/** Stories are reversible (two panels); every other track is directional. */
const isStory = computed(() => track.value === 'stories')

/**
 * Every doc of this article in ONE query: the route's explanation locale, its
 * canonical fallback, and the per-locale docs the reading panels need.
 * (The page used to run the same collection scan twice.)
 */
const { data: articleData, error: markdownError } = await useAsyncData(
  `article-${track.value}-${trackLang.value}-${topicCode.value}-${articleId.value}-${docLocale.value}`,
  async () => {
    const docs = await queryCollection('articles')
      .where('article', '=', articleId.value)
      .where('topic', '=', topicCode.value)
      .where('track', '=', track.value)
      .all()
    const scoped = docs.filter((doc) => !doc.trackLang || doc.trackLang === trackLang.value)
    const findDoc = (locale: string) => scoped.find((doc) => doc.locale === locale)
    const mine = findDoc(docLocale.value)
    // Shared articles use English as the canonical original. Legacy stories
    // remain canonical in their learning language.
    const sharedStory = track.value === 'stories' && docs.some((doc) => !doc.trackLang)
    const canonicalLocale =
      track.value === 'lectures' || track.value === 'dictionary' || sharedStory ? 'en' : trackLang.value
    const doc = mine ?? findDoc(canonicalLocale)
    return doc ? { docs: scoped, doc, fallback: !mine } : null
  }
)

if (markdownError.value || !articleData.value) {
  throw createError({ statusCode: 404, statusMessage: 'Article not found', fatal: true })
}

const record = ref<MediaRecord | null>(null)
const nativeRecord = ref<MediaRecord | null>(null)
const rowsById = ref<Map<string, MediaRow>>(new Map())
const mediaError = ref<string | null>(null)

/**
 * The doc each panel renders.
 *
 * A lecture is directional: the article explains one target-language item, so
 * there is ONE panel and it is written in the reader's own language — the
 * route's `:doc` segment, falling back to the UI language and then English.
 *
 * A story is reversible: the same story exists in many languages, so the left
 * panel is the learning language and the right is the reader's translation.
 */
const markdownDoc = computed(() => articleData.value?.doc ?? null)
const articleDocs = computed(() => articleData.value?.docs ?? [])

/**
 * The reader's own language — the panel language for a directional article.
 *
 * The profile's language picker is the native language, so it outranks the
 * route's `:doc` segment: a Romanian reader opening a French letter must get
 * the Romanian explanation (and Romanian audio) even if the link says `/en`.
 * The segment is only a hint for a visitor who has not chosen a language.
 */
const readerLocale = computed(() => {
  const wanted = [uiLang.value, docLocale.value, 'en']
  for (const locale of wanted) {
    const doc = articleDocs.value.find((d) => d.locale === locale)
    if (doc) return doc
  }
  return markdownDoc.value
})

/** Left panel: the learning language for a story, the reader's for a lecture. */
const storyTargetDoc = computed(() =>
  isStory.value
    ? (articleDocs.value.find((doc) => doc.locale === trackLang.value) ?? markdownDoc.value)
    : readerLocale.value
)

/** Right panel: the reader's translation. Stories only. */
const storyNativeDoc = computed(() =>
  articleDocs.value.find((doc) => doc.locale === docLocale.value) ??
  articleDocs.value.find((doc) => doc.locale === uiLang.value) ??
  storyTargetDoc.value
)

/** Only a story has a second panel, and only when it differs from the first. */
const hasTranslation = computed(
  () => isStory.value && storyNativeDoc.value !== storyTargetDoc.value
)

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

/**
 * The picture to show beside the story on the current page.
 *
 * A story's illustrations are shared by every language, and each one is
 * anchored to the page it first appears on. The picture stays up until the
 * next one's page, so a 1-picture story keeps its picture throughout and a
 * 5-picture story changes it five times.
 */
const storyImage = computed<StoryImage | null>(() => {
  const images = record.value?.images ?? []
  if (!images.length) return null
  let current: StoryImage | null = null
  for (const image of images) {
    if (image.page <= storyPage.value) current = image
    else break
  }
  return current ?? images[0]
})

/**
 * The paragraph number to print in front of the current page's text.
 *
 * Stories are numbered so a child (and the reader following the audio) can see
 * where they are: "1. A fost o dată ca niciodată…". The number counts the
 * paragraphs of the panel's own language, so the two panels stay aligned even
 * when a translation splits a paragraph differently.
 */
const storyParagraphNumber = computed(() => storyPage.value + 1)
/** Left panel's language: the learning language for a story, the reader's for a lecture. */
const storyTargetName = computed(() =>
  languageName(isStory.value ? trackLang.value : (storyTargetDoc.value?.locale ?? docLocale.value))
)
const storyNativeName = computed(() => languageName(docLocale.value))
/**
 * Full-article read recordings, one per panel language.
 *
 * A lecture's single panel is written in the reader's language, so its Read
 * button plays that language's recording. A story's left panel is the learning
 * language, so it plays the target recording. `reads` carries every locale's
 * recording because a directional topic emits one record but explains its
 * article in all nine.
 *
 * There is deliberately NO fallback to `read.url`: that descriptor is the
 * TOPIC's language (French for the French alphabet), so falling back to it
 * plays French audio under a Romanian panel. A disabled button is honest;
 * wrong-language audio is not.
 */
const readFor = (rec: MediaRecord | null, locale: string): string | null =>
  rec?.reads?.[locale] ?? null

const storyTargetRead = computed(() =>
  isStory.value
    ? (record.value?.read?.url ?? null)
    : readFor(record.value, storyTargetDoc.value?.locale ?? docLocale.value)
)
const storyNativeRead = computed(() => nativeRecord.value?.read?.url ?? null)

/**
 * Where the current reading page starts in each panel's recording.
 *
 * The article paginates one section per page (a `##` heading, or one paragraph
 * when the document has no headings), and the generator records each section's
 * start offset, so pressing Play on page 3 begins at page 3. A recording made
 * before offsets existed has no entry — the player then starts at 0, exactly
 * as before.
 */
const targetStartAt = computed(() => {
  const locale = isStory.value ? trackLang.value : (storyTargetDoc.value?.locale ?? docLocale.value)
  return record.value?.readSections?.[locale]?.[storyPage.value] ?? 0
})
const nativeStartAt = computed(
  () => nativeRecord.value?.readSections?.[docLocale.value]?.[storyPage.value] ?? 0
)
/**
 * Where the current page ENDS in each panel's recording — the next page's
 * start. The player stops here and asks for the next page, so the voice never
 * reads on into text the reader cannot see yet. 0 means "no boundary".
 */
const targetEndAt = computed(() => {
  const locale = isStory.value ? trackLang.value : (storyTargetDoc.value?.locale ?? docLocale.value)
  return record.value?.readSections?.[locale]?.[storyPage.value + 1] ?? 0
})
const nativeEndAt = computed(
  () => nativeRecord.value?.readSections?.[docLocale.value]?.[storyPage.value + 1] ?? 0
)
const targetTerm = computed(() =>
  markdownDoc.value?.terms?.[trackLang.value] ?? record.value?.term ?? ''
)
const articleTitle = computed(() => {
  const title = storyTargetDoc.value?.title ?? 'Article'
  return title.replace(/\{\{term\}\}/g, (match, offset: number) => {
    const term = targetTerm.value
    if (offset === 0 && term) return term[0].toLocaleUpperCase() + term.slice(1)
    return term || match
  })
})
const articleSummary = computed(() => storyTargetDoc.value?.summary ?? '')
/**
 * The cursive pair for a letter article's title.
 *
 * A phonetic (alphabet) article's title IS the letter — the manifest's name is
 * the glyph in every language — so it is set in the handwriting face the
 * alphabet is taught with (Marck Script, see --font-cursive): uppercase then
 * lowercase, same face. A group ("ea", "sch") has no case pair and keeps the
 * plain title.
 *
 * The glyph comes from the title rather than from `src/data/alphabets`: that
 * file is 6.7 MB of prose and only the article body needs it, so importing it
 * here would put the whole alphabet in the page bundle for one character.
 */
const cursivePair = computed(() => {
  if (track.value !== 'lectures') return null
  const title = articleTitle.value.trim()
  if ([...title].length !== 1) return null
  return { upper: title.toLocaleUpperCase(), lower: title.toLocaleLowerCase() }
})
const articleStatus = computed(() => markdownDoc.value?.status ?? 'draft')
const articleMinutes = computed(() => markdownDoc.value?.minutes ?? null)
const isFallback = computed(() => articleData.value?.fallback ?? false)
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
  // The reader's language drives the panel and its audio, so it must be loaded
  // before the record is resolved — otherwise `uiLang` is still the default.
  await ensureLocale()
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
  <!-- A STORY is read, not browsed: it takes a while, so the chapter rail is
       hidden and the article gets the full width. Lectures and dictionary
       articles keep the rail — there the reader is moving between topics.
       No vertical padding here: `.app-main` already supplies the gutter, and
       doubling it pushed the reading area past the viewport. -->
  <main
    class="app-container grid gap-5"
    :class="[isStory ? '' : 'lg:grid-cols-[280px_minmax(0,1fr)]', 'min-h-0 overflow-hidden']"
  >
    <!-- Desktop: the track's chapter/topic rail stays beside the article -->
    <ArticleRail v-if="!isStory" :lang="trackLang" :track="track as TrackId" :topic="topicCode" />

    <div class="flex min-w-0 min-h-0 flex-col">
      <article class="flex min-h-0 flex-1 flex-col gap-3">
        <header class="shrink-0 space-y-2">
          <!-- ONE title row: the flag, the track, the topic and the article
               title all sit on the same line, so the header costs a single row
               instead of three. The breadcrumb link is gone — the Close button
               already goes back to the topic's table, and a story is read in
               one sitting rather than navigated away from. -->
          <div class="flex items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-2">
              <LanguageFlag :code="flagFor(trackLang)" :label="languageName(trackLang)" size="sm" />
              <p class="shrink-0 text-xs font-semibold uppercase tracking-wide text-accent">
                {{ trackTitle }}
              </p>
              <span class="shrink-0 text-faint">/</span>
              <p class="hidden min-w-0 truncate text-xs text-muted sm:block">{{ topicName }}</p>
              <span class="hidden shrink-0 text-faint sm:block">/</span>
              <!-- A letter article's title IS the letter, so it is set in the
                   handwriting face the alphabet is taught with (Marck Script):
                   uppercase then lowercase, same face. A group ("ea", "sch")
                   has no case pair and keeps the plain title. The prose title
                   stays in the accessible name, so screen readers and search
                   engines still get a word. -->
              <h1 v-if="cursivePair" class="cursive min-w-0 truncate text-2xl text-content">
                <span aria-hidden="true">{{ cursivePair.upper }} {{ cursivePair.lower }}</span>
                <span class="sr-only">{{ articleTitle }}</span>
              </h1>
              <h1 v-else class="min-w-0 truncate text-xl font-bold text-content">{{ articleTitle }}</h1>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <span v-if="articleMinutes" class="hidden items-center gap-1 text-xs text-faint sm:inline-flex">
                <ClockIcon class="h-3.5 w-3.5" aria-hidden="true" /> {{ articleMinutes }} min
              </span>
              <span
                class="hidden rounded-full px-2 py-0.5 text-xs sm:inline"
                :class="articleStatus === 'reviewed' ? 'bg-accent-soft text-accent' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200'"
              >
                {{ articleStatus === 'reviewed' ? copy('lecture.reviewed', 'Reviewed') : copy('lecture.draft', 'Draft') }}
              </span>
              <!-- Close: back to the topic's table -->
              <a
                :href="`/learn/${trackLang}/${track}?chapter=${topicCode.slice(0, 4)}&topic=${topicCode}`"
                class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-edge bg-surface text-muted transition hover:border-accent hover:text-accent"
                :aria-label="copy('ui.close', 'Close')"
                :title="copy('roadmap.back_to_topics', 'All topics')"
              >
                <XMarkIcon class="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
          <p v-if="articleSummary" class="text-sm text-muted">{{ articleSummary }}</p>
          <span v-if="isFallback" class="inline-block rounded-full bg-soft px-2 py-0.5 text-xs text-muted">
            {{ copy('lecture.not_translated', 'Not translated yet — showing English') }}
          </span>
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

        <!-- ONE reading template for every track. A STORY gets three panels —
             the picture on the right, the learning language above the reader's
             translation on the left — because a picture book is read beside its
             illustration. A lecture keeps two panels (its single explanation
             plus nothing), since it has no picture and no second language. -->
        <section class="flex min-h-0 flex-1 flex-col gap-3">
          <div
            class="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden"
            :class="isStory && storyImage ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)]' : hasTranslation ? 'lg:grid-cols-2' : ''"
          >
            <!-- LEFT COLUMN: the story in two languages, stacked. Each panel
                 scrolls on its own, so a long paragraph never pushes the other
                 language out of view. -->
            <div
              class="flex min-h-0 min-w-0 flex-col gap-3"
              :class="isStory && storyImage ? 'lg:col-span-2' : 'contents'"
            >
              <section
                class="min-w-0 flex-col overflow-hidden rounded-lg border border-edge bg-surface p-3 sm:p-5"
                :class="[
                  storyMobilePanel === 'target' ? 'flex' : 'hidden lg:flex',
                  isStory && storyImage ? 'min-h-0 flex-1' : ''
                ]"
              >
                <div class="mb-3 flex items-center justify-between gap-2 border-b border-edge pb-2">
                  <h2 class="text-xs font-semibold uppercase tracking-wide text-accent">
                    {{ storyTargetName }} · {{ copy(isStory ? 'stories.learning_text' : 'lecture.explanation', isStory ? 'Learning language' : 'Explanation') }}
                  </h2>
                  <ArticleReadPlayer
                    ref="targetPlayer"
                    :src="storyTargetRead"
                    :label="storyTargetName"
                    :start-at="targetStartAt"
                    :end-at="targetEndAt"
                    :has-next="storyPage < storyPageCount - 1"
                    @page-ended="moveStoryPage(1)"
                  />
                </div>
                <div class="story-page-body min-h-0 flex-1 overflow-y-auto">
                  <p v-if="isStory" class="story-paragraph-number" aria-hidden="true">
                    {{ storyParagraphNumber }}.
                  </p>
                  <ContentRenderer
                    v-if="storyTargetPage"
                    :value="storyTargetPage"
                    class="lecture-prose story-page-content text-sm leading-relaxed text-content sm:text-base"
                  />
                </div>
              </section>
              <section
                v-if="hasTranslation"
                class="min-w-0 flex-col overflow-hidden rounded-lg border border-edge bg-surface p-3 sm:p-5"
                :class="[
                  storyMobilePanel === 'native' ? 'flex' : 'hidden lg:flex',
                  isStory && storyImage ? 'min-h-0 flex-1' : ''
                ]"
              >
                <div class="mb-3 flex items-center justify-between gap-2 border-b border-edge pb-2">
                  <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">
                    {{ storyNativeName }} · {{ copy('stories.translation', 'Translation') }}
                  </h2>
                  <ArticleReadPlayer
                    ref="nativePlayer"
                    :src="storyNativeRead"
                    :label="storyNativeName"
                    :start-at="nativeStartAt"
                    :end-at="nativeEndAt"
                    :has-next="storyPage < storyPageCount - 1"
                    @page-ended="moveStoryPage(1)"
                  />
                </div>
                <div class="story-page-body min-h-0 flex-1 overflow-y-auto">
                  <p v-if="isStory" class="story-paragraph-number" aria-hidden="true">
                    {{ storyParagraphNumber }}.
                  </p>
                  <ContentRenderer
                    v-if="storyNativePage"
                    :value="storyNativePage"
                    class="lecture-prose story-page-content text-sm leading-relaxed text-content sm:text-base"
                  />
                </div>
              </section>
            </div>
            <!-- RIGHT PANEL: the story's illustration. It changes as the story
                 advances — each picture is anchored to the page it first
                 appears on — and it is shared by every language. The picture is
                 PORTRAIT and fills the column top-down: `object-cover` on a
                 full-height box means no letterboxed strip and no wasted
                 space, which is the whole point of the third panel. -->
            <figure
              v-if="isStory && storyImage"
              class="hidden min-h-0 min-w-0 overflow-hidden rounded-lg border border-edge bg-surface lg:block"
            >
              <img
                :key="storyImage.url"
                :src="storyImage.url"
                :alt="articleTitle"
                class="h-full w-full object-cover"
                decoding="async"
              />
            </figure>
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

/* The paragraph number sits in the margin, so the prose keeps its own left
   edge and the number reads as a marker rather than part of the sentence. */
.story-page-body {
  position: relative;
}

.story-paragraph-number {
  float: left;
  margin-right: 0.5rem;
  font-family: var(--font-code, ui-monospace, monospace);
  font-size: 0.75rem;
  line-height: 1.9;
  color: var(--color-faint, #9ca3af);
  user-select: none;
}
</style>