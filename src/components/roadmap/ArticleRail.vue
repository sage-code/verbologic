// ArticleRail — the roadmap's chapter/topic rail beside an article page, so
// the article sits in the same frame as the track's tables (desktop only —
// below lg the article keeps the full width and the rail is hidden). Inits
// the roadmap store on the article's own topic (highlighted in the rail);
// picking another topic leaves the article for that topic's table.
<script setup lang="ts">
import type { TrackId } from '~/data/tracks'
import { useRoadmapStore, PROGRESS_KEY } from '~/stores/roadmapStore'
import RoadmapSidePane from './RoadmapSidePane.vue'
import RoadmapSidebar from './RoadmapSidebar.vue'

const props = defineProps<{ lang: string; track: TrackId; topic: string }>()

const store = useRoadmapStore()
const copy = useCopy()
const progress = useProgress(() => props.lang)
provide(PROGRESS_KEY, progress)

onMounted(async () => {
  try {
    await store.init(props.lang, props.track, undefined, props.topic)
    await progress.refresh()
  } catch {
    // No rail data — the article still reads fine on its own.
  }
})

/** Another topic picked in the rail → open its table on the track page. */
watch(
  () => store.topicCode,
  (code: string | null) => {
    if (code && code !== props.topic) void navigateTo(`/learn/${props.lang}/${props.track}?topic=${code}`)
  }
)
</script>

<template>
  <RoadmapSidePane class="hidden lg:block">
    <template #label>
      <div class="flex h-10 items-center">
        <p class="text-xs uppercase tracking-wide text-faint">{{ copy('roadmap.topics', 'Topics') }}</p>
      </div>
    </template>
    <RoadmapSidebar v-if="store.ready" class="mt-1.5" />
  </RoadmapSidePane>
</template>
