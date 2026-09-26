// RoadmapSidebar — chapter list; the selected chapter expands to its topics
// (localized names only — no per-topic count, that clutters the rail).
// Topics can be opened from here or from the topic list on the right.
// Double-clicking the selected chapter folds /
// unfolds its topic branch. `collapsed` (chapter TOC mode) hides every
// expanded branch, leaving the plain chapter list.
<script setup lang="ts">
import { ChevronDownIcon } from '@heroicons/vue/20/solid'
import { useRoadmapStore } from '~/stores/roadmapStore'
import { mediaName } from '~/composables/useMedia'
import type { MediaNames } from '~/types/media'
import type { SidebarTopic } from '~/types/sidebars'

withDefaults(defineProps<{ collapsed?: boolean }>(), { collapsed: false })

const store = useRoadmapStore()
const { lang: uiLang } = useLocale()
const copy = useCopy()

const chapterTitle = (names: MediaNames, fallback: string) => mediaName(names, uiLang.value, fallback)
const topicTitle = (names: MediaNames, fallback: string) => mediaName(names, uiLang.value, fallback)
/** A chapter/topic without content in the active language renders disabled. */
const chapterEmpty = (c: { topics: SidebarTopic[] }) => !c.topics.some((t) => store.topicCount(t.code) > 0)
const topicEmpty = (code: string) => store.topicCount(code) === 0

/** The selected chapter folded by a double-click (its topics hidden). */
const folded = ref<string | null>(null)
const expanded = (code: string) => store.chapterCode === code && folded.value !== code

/** Click: pick the chapter (a different chapter always opens unfolded). */
function onChapterClick(code: string) {
  if (code !== store.chapterCode) folded.value = null
  store.selectChapter(code)
}

/** Double-click: fold / unfold the selected chapter's topic branch. */
function onChapterDblClick(code: string) {
  folded.value = folded.value === code ? null : code
}

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
      <!-- Every chapter — contentless ones render disabled, never hidden -->
      <li v-for="c in store.visibleChapters" :key="c.code">
        <button
          :id="`side-chapter-${c.code}`"
          type="button"
          class="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          :class="store.chapterCode === c.code ? 'bg-accent-soft text-accent' : 'text-content hover:bg-soft'"
          :disabled="chapterEmpty(c)"
          :title="chapterEmpty(c) ? copy('practice.coming_soon', 'Coming soon') : undefined"
          :aria-expanded="expanded(c.code)"
          @click="onChapterClick(c.code)"
          @dblclick="onChapterDblClick(c.code)"
        >
          <ChevronDownIcon
            class="h-3.5 w-3.5 shrink-0 text-faint transition-transform"
            :class="{ 'rotate-180': expanded(c.code) }"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1 truncate">{{ chapterTitle(c.names, c.code) }}</span>
          <span class="shrink-0 text-xs text-faint">{{ c.code }}</span>
        </button>

        <ul v-if="!collapsed && expanded(c.code)" class="ml-4 border-l border-edge pl-2">
          <li v-for="tp in c.topics" :key="tp.code">
            <button
              :id="`side-topic-${tp.code}`"
              type="button"
              class="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              :class="store.topicCode === tp.code ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-soft hover:text-content'"
              :disabled="topicEmpty(tp.code)"
              :title="topicEmpty(tp.code) ? copy('practice.coming_soon', 'Coming soon') : undefined"
              @click="store.openTopic(tp.code)"
            >
              <span class="min-w-0 flex-1 truncate">{{ topicTitle(tp.names, tp.code) }}</span>
            </button>
          </li>
        </ul>
      </li>
    </ul>
  </nav>
</template>
