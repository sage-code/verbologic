// LegendDialog — the table header's eye button opens this: what each column
// glyph means, plus the one credit figure the learner needs (total credit).
// Built on AppDialog so Escape, backdrop click and the focus trap come free.
<script setup lang="ts">
import { CheckIcon, PlayIcon } from '@heroicons/vue/20/solid'
import { EyeIcon, SpeakerWaveIcon } from '@heroicons/vue/24/outline'
import AppDialog from '~/components/AppDialog.vue'

const props = defineProps<{
  /** Total credit for the active language, in dollars (0 for guests). */
  creditTotal: number
}>()

const emit = defineEmits<{ close: [] }>()
const copy = useCopy()

/** One legend row: the glyph rendered in the table header, and its meaning. */
const entries = computed(() => [
  {
    key: 'article',
    label: copy('legend.article', 'Article — open the two-panel reading view'),
    icon: 'eye'
  },
  {
    key: 'scroll',
    label: copy('legend.scroll', 'Scroll — this row has an article to read'),
    icon: 'scroll'
  },
  {
    key: 'sound',
    label: copy('legend.sound', 'Speaker — turn the sound on or off'),
    icon: 'speaker'
  },
  {
    key: 'play',
    label: copy('legend.play', 'Play — listen to this row'),
    icon: 'play'
  },
  {
    key: 'done',
    label: copy('legend.done', 'Check — mark the row or the whole page as learned'),
    icon: 'check'
  }
])
</script>

<template>
  <AppDialog :title="copy('legend.title', 'Legend')" @close="emit('close')">
    <ul class="space-y-3">
      <li v-for="entry in entries" :key="entry.key" class="flex items-center gap-3">
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-edge text-accent"
        >
          <EyeIcon v-if="entry.icon === 'eye'" class="h-4 w-4" aria-hidden="true" />
          <span v-else-if="entry.icon === 'scroll'" class="text-base leading-none" aria-hidden="true">📃</span>
          <SpeakerWaveIcon v-else-if="entry.icon === 'speaker'" class="h-4 w-4" aria-hidden="true" />
          <PlayIcon v-else-if="entry.icon === 'play'" class="h-4 w-4" aria-hidden="true" />
          <CheckIcon v-else class="h-4 w-4" aria-hidden="true" />
        </span>
        <span class="text-sm text-content">{{ entry.label }}</span>
      </li>
    </ul>

    <!-- The single credit figure — no consumed/total split here. -->
    <p class="mt-5 border-t border-edge pt-4 text-sm font-medium text-content">
      {{ copy('legend.total_credit', 'Total credit') }}: {{ props.creditTotal }}$
    </p>
  </AppDialog>
</template>
