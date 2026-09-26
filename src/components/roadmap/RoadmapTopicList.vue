// RoadmapTopicList — topics of the selected chapter (or search hits across all
// chapters): one row per topic — Topic ID · name · translation · title-audio ·
// Done (a round check button that marks/unmarks the WHOLE topic learned in one
// click). No word/article count and no article icon here — those belong to
// the topic's own word/article table (TopicTable), not this overview.
<script setup lang="ts">
import { CheckIcon } from '@heroicons/vue/20/solid'
import { useRoadmapStore, PROGRESS_KEY, type TopicRow } from '~/stores/roadmapStore'
import { mediaName } from '~/composables/useMedia'
import { THEAD_STICKY_TOP } from '~/lib/roadmapRail'
import type { MediaNames } from '~/types/media'

const store = useRoadmapStore()
const progress = inject(PROGRESS_KEY)
const { lang: uiLang } = useLocale()
const { languageName } = useNavigation()
const copy = useCopy()

/** Title in the learning language (the term) and in the UI language (the gloss). */
const targetName = (names: MediaNames, fallback: string) => mediaName(names, store.lang, fallback)
const uiName = (names: MediaNames, fallback: string) => mediaName(names, uiLang.value, fallback)

/** Column headers — the same shell as the chapters/word tables. */
const nameHeader = computed(() => languageName(store.lang))
const glossHeader = computed(() => languageName(uiLang.value !== store.lang ? uiLang.value : 'en'))

/** A topic without content in the active language renders disabled. */
const topicEmpty = (code: string) => store.topicCount(code) === 0

/** A topic is Done when every one of its ids is marked learned. */
const topicDone = (code: string): boolean => {
  if (!progress) return false
  const ids = store.topicIds(code)
  return ids.length > 0 && ids.every((id: string) => progress.isLearned(id))
}

/** The Done button: marks the whole topic learned, or clears it (and its
 *  listen counts) when it's already fully learned — same semantics as the
 *  table's own check-all. */
async function toggleTopicDone(code: string) {
  if (!progress) return
  const ids = store.topicIds(code)
  if (ids.length === 0) return
  if (topicDone(code)) {
    await progress.setLearnedMany(ids, false)
    await progress.clearListens(ids)
  } else {
    await progress.setLearnedMany(
      ids.filter((id: string) => !progress.isLearned(id)),
      true
    )
  }
}

/** One row of the topic list. */
interface TopicRowView {
  key: string
  code: string
  name: string
  translation: string
  disabled: boolean
  /** Click: pick the topic — highlights it and readies the title bar's
   *  "Open Topic" button, but stays on the list (see pickTopic). */
  pick: () => void
  /** Double-click: pick AND open it straight into its word/article table. */
  open: () => void
}

const topicRows = computed<TopicRowView[]>(() =>
  store.visibleTopics.map((tp: TopicRow) => ({
    key: tp.code,
    code: tp.code,
    name: targetName(tp.names, tp.code),
    translation: uiName(tp.names, tp.code),
    disabled: topicEmpty(tp.code),
    pick: () => store.pickTopic(tp.code),
    open: () => store.openTopic(tp.code)
  }))
)
</script>

<template>
  <p
    v-if="store.visibleTopics.length === 0"
    class="rounded-lg border border-edge bg-surface px-4 py-6 text-sm text-muted"
  >
    {{ copy('ui.no_results', 'No matches found.') }}
  </p>

  <div v-else class="overflow-clip rounded-lg border border-edge bg-surface shadow-sm">
    <table class="w-full border-collapse text-sm">
      <thead class="sticky z-10 bg-soft text-left text-xs uppercase tracking-wide text-faint" :class="THEAD_STICKY_TOP">
        <tr>
          <th class="px-3 py-2 font-medium">{{ copy('dictionary.col_id', 'Topic ID') }}</th>
          <th class="px-3 py-2 font-medium">{{ nameHeader }}</th>
          <th class="hidden px-3 py-2 font-medium sm:table-cell">{{ glossHeader }}</th>
          <th class="px-3 py-2 text-center font-medium">{{ copy('dictionary.col_audio', 'Audio') }}</th>
          <th class="px-3 py-2 text-center font-medium">{{ copy('dictionary.col_done', 'Done') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in topicRows"
          :key="row.key"
          class="border-t border-edge transition-colors"
          :class="[
            row.disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-soft',
            !row.disabled && store.pickedTopicCode === row.code ? 'bg-accent-soft' : ''
          ]"
          :title="
            row.disabled
              ? copy('practice.coming_soon', 'Coming soon')
              : copy('roadmap.double_click_open', 'Double-click to open')
          "
          @click="!row.disabled && row.pick()"
          @dblclick="!row.disabled && row.open()"
        >
          <td class="whitespace-nowrap px-3 py-2 font-code text-xs text-faint">{{ row.code }}</td>
          <td class="px-3 py-2 font-medium text-content">{{ row.name }}</td>
          <td class="hidden px-3 py-2 text-muted sm:table-cell">{{ row.translation }}</td>
          <td class="px-3 py-2 text-center">
            <!-- Title audio: lights up via useTitles once the titles payload lands -->
            <button
              type="button"
              class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-edge bg-surface text-sm text-accent disabled:cursor-not-allowed disabled:opacity-40"
              disabled
              :title="copy('ui.audio_coming_soon', 'Audio coming soon')"
              @click.stop
            >
              <span class="leading-none">▶</span>
            </button>
          </td>
          <td class="px-3 py-2 text-center">
            <button
              type="button"
              class="inline-flex h-8 w-8 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-40"
              :class="
                topicDone(row.code)
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-edge text-muted hover:border-accent hover:text-accent'
              "
              :disabled="row.disabled"
              :aria-pressed="topicDone(row.code)"
              :title="
                topicDone(row.code)
                  ? copy('dictionary.reset_page', 'Mark as not learned')
                  : copy('dictionary.check_all', 'Mark as learned')
              "
              @click.stop="toggleTopicDone(row.code)"
            >
              <CheckIcon class="h-4 w-4" aria-hidden="true" />
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
