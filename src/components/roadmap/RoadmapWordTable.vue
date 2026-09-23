// RoadmapWordTable — the open topic's word list: player bar (filter + play
// filtered) above scrollable rows. Each row: target-language term, UI-language
// gloss, play button (MediaViewer) and the learned toggle. The play-all queue
// plays the filtered rows one by one with a memorization pause between items.
<script setup lang="ts">
import { CheckIcon } from '@heroicons/vue/20/solid'
import { useRoadmapStore, PROGRESS_KEY } from '~/stores/roadmapStore'
import { useAudioQueue } from '~/composables/useAudioQueue'
import { galleryName } from '~/composables/useGallery'
import type { GalleryRecord } from '~/types/gallery'
import RoadmapPlayerBar from './RoadmapPlayerBar.vue'

const store = useRoadmapStore()
const progress = inject(PROGRESS_KEY)
const { lang: uiLang } = useLocale()
const copy = useCopy()
const queue = useAudioQueue()

const rows = computed(() => store.filteredRecords)
const playingId = computed(() => queue.currentId.value)
const topicTitle = computed(() =>
  store.topic ? galleryName(store.topic.names, uiLang.value, store.topic.code) : ''
)

/** Queue items (one per row) — ids are the progress entity_ids. */
const queueItems = computed(() =>
  rows.value.map((r: GalleryRecord) => ({ id: r.entity_id, url: r.media.url }))
)

/** Gloss in the user's language: UI locale first, then English canonical. */
function gloss(r: GalleryRecord): string {
  if (uiLang.value !== r.lang && r.names[uiLang.value]) return r.names[uiLang.value]
  return r.names.en || ''
}

const isLearned = (r: GalleryRecord) => (progress ? progress.isLearned(r.entity_id) : false)
const toggleLearned = (r: GalleryRecord) => void progress?.toggleLearned(r.entity_id)

function playRow(r: GalleryRecord) {
  if (queue.isPlaying.value && queue.currentId.value === r.entity_id) queue.stop()
  else queue.play(queueItems.value, { startId: r.entity_id })
}

// Follow the playing row — keep it in view while the sequence advances.
watch(playingId, (id: string | null) => {
  if (!id) return
  void nextTick(() => document.getElementById(`roadmap-row-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
})
</script>

<template>
  <section class="space-y-4">
    <header class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="text-xs uppercase tracking-wide text-faint">
          {{ copy('roadmap.topic', 'Topic') }} {{ store.topicCode }}
        </p>
        <h2 class="truncate text-xl font-semibold text-content">{{ topicTitle }}</h2>
      </div>
      <button
        type="button"
        class="shrink-0 rounded-full border border-edge px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent hover:text-accent"
        @click="store.closeTopic()"
      >
        ← {{ copy('roadmap.back_to_topics', 'All topics') }}
      </button>
    </header>

    <RoadmapPlayerBar :queue="queue" :items="queueItems" />

    <div v-if="store.loadingTopic" class="rounded-lg border border-edge bg-surface p-6 text-sm text-muted">…</div>

    <p
      v-else-if="rows.length === 0"
      class="rounded-lg border border-edge bg-surface px-4 py-6 text-sm text-muted"
    >
      {{
        store.wordQuery
          ? copy('ui.no_results', 'No matches found.')
          : copy('roadmap.no_words', 'No words in this topic yet — content is being prepared.')
      }}
    </p>

    <ul v-else class="divide-y divide-edge overflow-hidden rounded-lg border border-edge bg-surface shadow-sm">
      <li
        v-for="r in rows"
        :id="`roadmap-row-${r.entity_id}`"
        :key="r.id"
        class="flex items-start gap-3 px-4 py-3 transition-colors"
        :class="playingId === r.entity_id ? 'bg-accent-soft' : ''"
      >
        <MediaViewer :src="r.media.url" :label="r.term" />

        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span class="font-medium text-content">{{ r.term }}</span>
            <span v-if="r.ipa" class="rounded bg-soft px-1.5 py-0.5 text-xs text-muted">{{ r.ipa }}</span>
            <span class="text-xs uppercase tracking-wide text-faint">{{ r.kind }}</span>
          </div>
          <p v-if="gloss(r)" class="mt-0.5 text-sm text-muted">{{ gloss(r) }}</p>
        </div>

        <button
          type="button"
          class="shrink-0 self-start rounded-full border px-2.5 py-1 text-xs font-medium transition"
          :class="isLearned(r) ? 'border-accent bg-accent-soft text-accent' : 'border-edge text-muted hover:border-accent hover:text-accent'"
          :aria-pressed="isLearned(r)"
          @click="toggleLearned(r)"
        >
          <span class="flex items-center gap-1">
            <CheckIcon class="h-3.5 w-3.5" aria-hidden="true" />
            <span class="hidden sm:inline">
              {{ isLearned(r) ? copy('ui.learned', 'Learned') : copy('ui.mark_learned', 'Learn') }}
            </span>
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>
