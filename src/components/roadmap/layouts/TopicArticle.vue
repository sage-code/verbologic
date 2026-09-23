// TopicArticle — the ARTICLE topic layout's pane: the topic's content docs as
// cards, each opening its own prerendered page (one per explanation locale).
// Rendered by RoadmapShell whenever the OPEN TOPIC's `layout` is 'article' —
// in any track (Dictionary · Lectures · Stories), never by track selection.
// Strictly prose: a topic layout carries no practice rows (the validator
// enforces it — media manifests on an article item are a data error, except
// the article's own embedded video).
<script setup lang="ts">
import { BookOpenIcon, ClockIcon, FilmIcon } from '@heroicons/vue/24/outline'
import { useRoadmapStore } from '~/stores/roadmapStore'
import type { MediaRecord } from '~/types/media'

const store = useRoadmapStore()
const { lang: uiLang } = useLocale()
const copy = useCopy()

const topicTitle = computed(() => {
  const names = store.topic?.names
  if (!names) return ''
  return names[uiLang.value] || names.en || store.topicCode || ''
})

/** The doc this record opens in: the UI locale's doc, else the canonical one. */
function docLocale(r: MediaRecord): string {
  const locales = r.content?.locales ?? {}
  return locales[uiLang.value] ? uiLang.value : r.content?.canonical ?? 'en'
}

/** Prerendered article route — one per explanation-locale doc, any track. */
const articleHref = (r: MediaRecord) =>
  `/learn/${store.lang}/${store.track}/${r.topic}/${r.id}/${docLocale(r)}`

/** Status pill per doc: translated/draft/stale states drive the review badges. */
function docState(r: MediaRecord) {
  const locales = r.content?.locales ?? {}
  const mine = locales[uiLang.value]
  if (!mine) return { key: 'lecture.not_translated', fallback: 'Not translated yet — showing English', tone: 'muted' }
  if (mine.stale) return { key: 'lecture.translation_stale', fallback: 'Translation out of date', tone: 'warn' }
  return mine.status === 'reviewed'
    ? { key: 'lecture.reviewed', fallback: 'Reviewed', tone: 'ok' }
    : { key: 'lecture.draft', fallback: 'Draft — review pending', tone: 'warn' }
}
</script>
<template>
  <div class="space-y-4">
    <!-- Banner: '<topic code>: <title>' + the back step (mobile has no rail) -->
    <header class="flex h-10 items-center justify-between gap-1.5">
      <h2 class="truncate text-lg font-semibold text-content">
        <span class="font-code text-sm text-faint">{{ store.topicCode }}:</span>
        {{ topicTitle }}
      </h2>
      <button
        type="button"
        class="shrink-0 rounded-full border border-edge px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent hover:text-accent"
        @click="store.closeTopic()"
      >
        ← {{ copy('roadmap.back_to_topics', 'All topics') }}
      </button>
    </header>

    <div v-if="store.loadingTopic" class="rounded-lg border border-edge bg-surface p-6 text-sm text-muted">…</div>

    <p
      v-else-if="store.contentRecords.length === 0"
      class="rounded-lg border border-edge bg-surface px-4 py-6 text-sm text-muted"
    >
      {{ copy('article.coming_soon', 'No articles in this topic yet — content is being prepared.') }}
    </p>

    <!-- The articles: content docs open on their own prerendered pages -->
    <div v-else class="grid gap-3 sm:grid-cols-2">
      <NuxtLink
        v-for="r in store.contentRecords"
        :key="r.id"
        :to="articleHref(r)"
        class="group flex flex-col gap-2 rounded-lg border border-edge bg-surface p-4 shadow-sm transition hover:border-accent"
      >
        <div class="flex items-center gap-2 text-accent">
          <BookOpenIcon class="h-5 w-5 shrink-0" aria-hidden="true" />
          <span class="text-xs font-medium uppercase tracking-wide">
            {{ copy('article.label', 'Article') }}
          </span>
        </div>

        <h3 class="text-base font-semibold text-content group-hover:text-accent">
          {{ r.names[uiLang] || r.term }}
        </h3>
        <p v-if="r.content?.summary" class="line-clamp-3 text-sm text-muted">{{ r.content.summary }}</p>

        <div class="mt-auto flex flex-wrap items-center gap-2 pt-1 text-xs text-faint">
          <span v-if="r.content?.minutes" class="inline-flex items-center gap-1">
            <ClockIcon class="h-3.5 w-3.5" aria-hidden="true" /> {{ r.content.minutes }} min
          </span>
          <span v-if="r.media.mime?.startsWith('video/')" class="inline-flex items-center gap-1">
            <FilmIcon class="h-3.5 w-3.5" aria-hidden="true" />
            {{ r.media.url ? copy('lecture.with_video', 'Video') : copy('ui.video_coming_soon', 'Video coming soon') }}
          </span>
          <span
            class="rounded-full px-2 py-0.5"
            :class="{
              'bg-soft text-muted': docState(r).tone === 'muted',
              'bg-accent-soft text-accent': docState(r).tone === 'ok',
              'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200': docState(r).tone === 'warn'
            }"
          >
            {{ copy(docState(r).key, docState(r).fallback) }}
          </span>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>