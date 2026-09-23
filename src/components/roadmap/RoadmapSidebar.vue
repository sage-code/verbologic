// RoadmapSidebar — chapter list; the selected chapter expands to its topics
// (localized names + learned/total). Topics can be opened from here or from
// the topic list on the right. `collapsed` (chapter TOC mode) hides every
// expanded branch, leaving the plain chapter list.
<script setup lang="ts">
import { ChevronRightIcon } from '@heroicons/vue/20/solid'
import { useRoadmapStore, PROGRESS_KEY } from '~/stores/roadmapStore'
import { galleryName } from '~/composables/useGallery'
import type { GalleryNames } from '~/types/gallery'

withDefaults(defineProps<{ collapsed?: boolean }>(), { collapsed: false })

const store = useRoadmapStore()
const progress = inject(PROGRESS_KEY)
const { lang: uiLang } = useLocale()
const copy = useCopy()

const chapterTitle = (names: GalleryNames, fallback: string) => galleryName(names, uiLang.value, fallback)
const topicTitle = (names: GalleryNames, fallback: string) => galleryName(names, uiLang.value, fallback)
const learnedOf = (code: string) => (progress ? store.learnedCount(code, progress.learned.value) : 0)

// Follow navigation: keep the active chapter/topic visible in the sidebar —
// the user never has to touch the sidebar to see where they landed (mobile).
watch(
  () => [store.chapterCode, store.topicCode] as const,
  () => {
    void nextTick(() => {
      const el = store.topicCode
        ? document.getElementById(`side-topic-${store.topicCode}`)
        : document.getElementById(`side-chapter-${store.chapterCode ?? ''}`)
      el?.scrollIntoView({ block: 'nearest' })
    })
  }
)

</script>

<template>
  <nav class="rounded-lg border border-edge bg-surface p-2 shadow-sm" :aria-label="copy('roadmap.chapters', 'Chapters')">
    <ul class="space-y-0.5">
      <li v-for="c in store.chapters" :key="c.code">
        <button
          :id="`side-chapter-${c.code}`"
          type="button"
          class="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm font-medium transition"
          :class="store.chapterCode === c.code ? 'bg-accent-soft text-accent' : 'text-content hover:bg-soft'"
          @click="store.selectChapter(c.code)"
        >
          <ChevronRightIcon
            class="h-3.5 w-3.5 shrink-0 text-faint transition-transform"
            :class="{ 'rotate-90': store.chapterCode === c.code }"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1 truncate">{{ chapterTitle(c.names, c.code) }}</span>
          <span class="shrink-0 text-xs text-faint">{{ c.code }}</span>
        </button>

        <ul v-if="!collapsed && store.chapterCode === c.code" class="ml-4 border-l border-edge pl-2">
          <li v-for="tp in c.topics" :key="tp.code">
            <button
              :id="`side-topic-${tp.code}`"
              type="button"
              class="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition"
              :class="store.topicCode === tp.code ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-soft hover:text-content'"
              @click="store.openTopic(tp.code)"
            >
              <span class="min-w-0 flex-1 truncate">{{ topicTitle(tp.names, tp.code) }}</span>
              <span class="shrink-0 rounded-full bg-soft px-1.5 py-0.5 text-[11px] tabular-nums text-muted">
                {{ learnedOf(tp.code) }}/{{ store.topicCount(tp.code) }}
              </span>
            </button>
          </li>
        </ul>
      </li>
    </ul>
  </nav>
</template>
