// RoadmapShell — the shared roadmap shell: store init, ?chapter=&topic= deep
// links, one useProgress instance provided to the tree, and a per-track LAYOUT
// registry — Dictionary renders layouts/DictionaryLayout.vue; Lectures and
// Stories render the original TopicsLayout until they get their own layouts.
// Rendered by /learn/:locale/:track (with :track) and the /ro · /en pages
// (default 'dictionary').
<script setup lang="ts">
import type { Component } from 'vue'
import { useRoadmapStore, PROGRESS_KEY } from '~/stores/roadmapStore'
import type { TrackId } from '~/data/tracks'
import DictionaryLayout from './layouts/DictionaryLayout.vue'
import TopicsLayout from './layouts/TopicsLayout.vue'

const props = withDefaults(defineProps<{ lang: string; track?: TrackId }>(), { track: 'dictionary' })

/** Per-track layouts — each track owns its whole two-pane composition. */
const LAYOUTS: Record<TrackId, Component> = {
  dictionary: DictionaryLayout,
  lectures: TopicsLayout,
  stories: TopicsLayout
}

const store = useRoadmapStore()
const route = useRoute()
const router = useRouter()
const { t } = useLocale()
const progress = useProgress(() => props.lang)
const failed = ref(false)

// One progress instance shared by the layout tree.
provide(PROGRESS_KEY, progress)

const queryValue = (value: unknown) => (typeof value === 'string' && value ? value : undefined)

onMounted(async () => {
  try {
    await store.init(props.lang, queryValue(route.query.chapter), queryValue(route.query.topic))
    await progress.refresh()
  } catch {
    failed.value = true
  }
})

// Keep the URL in sync with the selection (deep links + browser back).
watch(
  () => [store.chapterCode, store.topicCode] as const,
  ([chapterCode, topicCode]: readonly [string | null, string | null]) => {
    const query: Record<string, string> = {}
    for (const [key, value] of Object.entries(route.query)) {
      if (typeof value === 'string') query[key] = value
    }
    if (chapterCode) query.chapter = chapterCode
    else delete query.chapter
    if (topicCode) query.topic = topicCode
    else delete query.topic
    void router.replace({ query })
  }
)
</script>

<template>
  <div v-if="!store.ready" class="rounded-lg border border-edge bg-surface p-6 text-sm text-muted">
    {{ failed ? t('ui.no_results') || 'Not available yet.' : '…' }}
  </div>

  <component :is="LAYOUTS[props.track]" v-else />
</template>
