// TopicsLayout — the original roadmap composition: chapter sidebar (left) and
// the topic list / open-topic word table (right). Serves the Lectures and
// Stories tracks until they get their own layouts; Dictionary has
// layouts/DictionaryLayout.vue now.
<script setup lang="ts">
import { useRoadmapStore } from '~/stores/roadmapStore'
import RoadmapSidebar from '../RoadmapSidebar.vue'
import RoadmapTopicSearch from '../RoadmapTopicSearch.vue'
import RoadmapTopicList from '../RoadmapTopicList.vue'
import RoadmapWordTable from '../RoadmapWordTable.vue'

const store = useRoadmapStore()
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
    <RoadmapSidebar class="lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:self-start lg:overflow-y-auto" />
    <div class="min-w-0">
      <RoadmapWordTable v-if="store.topicCode" />
      <div v-else class="space-y-4">
        <RoadmapTopicSearch />
        <RoadmapTopicList />
      </div>
    </div>
  </div>
</template>