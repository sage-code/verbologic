// RoadmapPlayerBar — word filter + sequential play-all with a memorization
// pause between items. The play button plays the filtered rows one by one
// (via the shared useAudioQueue); a second click stops the sequence.
<script setup lang="ts">
import { useRoadmapStore } from '~/stores/roadmapStore'
import { useAudioQueue, type QueueItem } from '~/composables/useAudioQueue'

const store = useRoadmapStore()
const copy = useCopy()

const props = defineProps<{
  queue: ReturnType<typeof useAudioQueue>
  items: QueueItem[]
}>()

const GAPS = [
  { ms: 800, label: '0.8s' },
  { ms: 1500, label: '1.5s' },
  { ms: 2500, label: '2.5s' }
]
const gap = ref(1500)
const playing = computed(() => props.queue.isPlaying.value)
const count = computed(() => props.items.length)
const toggle = () => props.queue.toggle(props.items, { gapMs: gap.value })
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 rounded-lg border border-edge bg-surface p-2 shadow-sm">
    <input
      v-model="store.wordQuery"
      type="search"
      :placeholder="copy('roadmap.filter_words', 'Filter words…')"
      class="min-w-0 flex-1 rounded-lg border border-edge-strong bg-surface px-3 py-2 text-sm text-content placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
    />

    <span class="shrink-0 text-xs tabular-nums text-muted">{{ count }} {{ copy('ui.results', 'results') }}</span>

    <select
      v-model.number="gap"
      class="shrink-0 rounded-lg border border-edge-strong bg-surface px-2 py-2 text-xs text-content focus:border-accent focus:outline-none"
      :aria-label="copy('roadmap.pause_gap', 'Pause between words')"
    >
      <option v-for="g in GAPS" :key="g.ms" :value="g.ms">{{ copy('roadmap.pause_gap', 'Pause') }} {{ g.label }}</option>
    </select>

    <button
      type="button"
      class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent transition hover:opacity-90"
      :aria-pressed="playing"
      @click="toggle"
    >
      <span class="leading-none">{{ playing ? '❚❚' : '▶' }}</span>
      {{ playing ? copy('roadmap.stop', 'Stop') : copy('roadmap.play_filtered', 'Play filtered') }}
    </button>
  </div>
</template>
