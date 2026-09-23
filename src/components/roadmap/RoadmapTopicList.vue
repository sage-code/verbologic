// RoadmapTopicList — topics of the selected chapter (or search hits across all
// chapters): localized title, code chip, learned/total badge + progress bar.
<script setup lang="ts">
import { useRoadmapStore, PROGRESS_KEY } from '~/stores/roadmapStore'
import { galleryName } from '~/composables/useGallery'
import type { GalleryNames } from '~/types/gallery'

const store = useRoadmapStore()
const progress = inject(PROGRESS_KEY)
const { lang: uiLang } = useLocale()
const copy = useCopy()

const title = (names: GalleryNames, fallback: string) => galleryName(names, uiLang.value, fallback)
const learnedOf = (code: string) => (progress ? store.learnedCount(code, progress.learned.value) : 0)
const pct = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0)
</script>

<template>
  <p
    v-if="store.visibleTopics.length === 0"
    class="rounded-lg border border-edge bg-surface px-4 py-6 text-sm text-muted"
  >
    {{ copy('ui.no_results', 'No matches found.') }}
  </p>

  <ul v-else class="divide-y divide-edge overflow-hidden rounded-lg border border-edge bg-surface shadow-sm">
    <li v-for="tp in store.visibleTopics" :key="tp.code">
      <button
        type="button"
        class="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-soft"
        @click="store.openTopic(tp.code)"
      >
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium text-content">{{ title(tp.names, tp.code) }}</span>
          <span class="text-xs text-faint">
            {{ tp.code }} · {{ store.topicCount(tp.code) }} {{ copy('roadmap.words', 'words') }}
          </span>
        </span>

        <span class="shrink-0 text-xs tabular-nums text-muted">
          {{ learnedOf(tp.code) }}/{{ store.topicCount(tp.code) }} {{ copy('roadmap.learned_of', 'learned') }}
        </span>

        <span class="hidden h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-soft sm:block">
          <span
            class="block h-full rounded-full bg-accent transition-all"
            :style="{ width: pct(learnedOf(tp.code), store.topicCount(tp.code)) + '%' }"
          />
        </span>
      </button>
    </li>
  </ul>
</template>
