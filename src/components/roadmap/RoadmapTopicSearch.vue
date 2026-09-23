// RoadmapTopicSearch — fuzzy topic search across all chapters (Fuse index over
// the code + every localized title).
<script setup lang="ts">
import { useRoadmapStore } from '~/stores/roadmapStore'

const store = useRoadmapStore()
const copy = useCopy()
</script>

<template>
  <input
    v-model="store.topicQuery"
    type="search"
    :placeholder="copy('roadmap.search_topics', 'Search topics…')"
    class="w-full rounded-lg border border-edge-strong bg-surface px-4 py-2 text-sm text-content placeholder:text-faint shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
  />
</template>
