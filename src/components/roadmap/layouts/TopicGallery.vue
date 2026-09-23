// TopicGallery — the GALLERY topic layout's pane: the topic's image records as
// a card grid (image · term · gloss · learned toggle). Rendered by
// RoadmapShell whenever the OPEN TOPIC's `layout` is 'gallery' — in any track
// (Dictionary · Lectures · Stories), never by track selection. Strictly
// images: the validator rejects non-image manifests on a gallery item.
<script setup lang="ts">
import { CheckIcon } from '@heroicons/vue/20/solid'
import { useRoadmapStore, PROGRESS_KEY } from '~/stores/roadmapStore'
import { mediaName } from '~/composables/useMedia'
import type { MediaRecord } from '~/types/media'

const store = useRoadmapStore()
const progress = inject(PROGRESS_KEY)
const { lang: uiLang } = useLocale()
const copy = useCopy()

const rows = computed(() => store.practiceRecords)

const topicTitle = computed(() =>
  store.topic ? mediaName(store.topic.names, uiLang.value, store.topic.code) : ''
)

/** Gloss in the user's language: UI locale first, then English canonical. */
function gloss(r: MediaRecord): string {
  if (uiLang.value !== r.lang && r.names[uiLang.value]) return r.names[uiLang.value]
  return r.names.en || ''
}

const isLearned = (r: MediaRecord) => (progress ? progress.isLearned(r.entity_id) : false)
const toggleLearned = (r: MediaRecord) => void progress?.toggleLearned(r.entity_id)
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
      v-else-if="rows.length === 0"
      class="rounded-lg border border-edge bg-surface px-4 py-6 text-sm text-muted"
    >
      {{ copy('gallery.coming_soon', 'No images in this topic yet — content is being prepared.') }}
    </p>

    <!-- The gallery cards: image · term · gloss · learned toggle -->
    <ul v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <li
        v-for="r in rows"
        :key="r.id"
        class="flex flex-col gap-2 rounded-lg border border-edge bg-surface p-3 shadow-sm"
      >
        <MediaViewer :src="r.media.url" :mime="r.media.mime" :label="r.term" />

        <div class="min-w-0">
          <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span class="font-medium text-content">{{ r.term }}</span>
            <span v-if="r.ipa" class="rounded bg-soft px-1.5 py-0.5 text-xs text-muted">{{ r.ipa }}</span>
          </div>
          <p v-if="gloss(r)" class="mt-0.5 text-sm text-muted">{{ gloss(r) }}</p>
        </div>

        <button
          type="button"
          class="self-start rounded-full border px-2.5 py-1 text-xs font-medium transition"
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
  </div>
</template>