// TopicTable — the TABLE topic layout's pane: banner (topic code + title, or
// the search-results line), the shared toolbar and the open topic's paginated
// word table. Rendered by RoadmapShell whenever the OPEN TOPIC's `layout` is
// 'table' — in any track (Dictionary · Lectures · Stories), never by track
// selection. One table, three data sources: the open topic's rows, or the
// dictionary-wide search results (the toolbar's filter mode), which take
// precedence regardless of the topic underneath.
// Columns: name in the learning language (the target term) · native gloss (the
// user's language — English canonical when the UI language is the target
// language) (the File ID stays in the DOM as a hidden sr-only field) · IPA (Dictionary
// only — hidden on small screens; the Lectures' expressions never show IPA) ·
// read (a book button when the row carries an article — words, expressions
// and stories alike; blank otherwise) · per-row play button (pause
// bars while its file plays, looping or not) · learned toggle. The header's check-all scope
// is the visible page. Lectures rows get a fixed two-line height — long
// expressions wrap, short ones sit centered in an equal-height row.
<script setup lang="ts">
import { ArrowPathIcon, CheckIcon } from '@heroicons/vue/20/solid'
import { EyeIcon, SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/vue/24/outline'
import LegendDialog from '~/components/roadmap/LegendDialog.vue'
import { useRoadmapStore, PROGRESS_KEY } from '~/stores/roadmapStore'
import { useLibraryStore } from '~/stores/libraryStore'
import { useAudioQueue, type QueueItem } from '~/composables/useAudioQueue'
import { useSound } from '~/composables/useSound'
import { glossName } from '~/lib/dictionarySearch'
import { THEAD_STICKY_TOP } from '~/lib/roadmapRail'
import type { MediaRow } from '~/types/media'
import DictionaryToolbar from './DictionaryToolbar.vue'

const store = useRoadmapStore()
const progress = inject(PROGRESS_KEY)
const { lang: uiLang } = useLocale()
const { languageName } = useNavigation()
const copy = useCopy()
const queue = useAudioQueue()
const sound = useSound()
const library = useLibraryStore()

/** The legend modal (the header's eye button). */
const legendOpen = ref(false)

/** Total credit for the active language — the legend's one figure. */
const creditTotal = computed(() => library.activeFor(store.lang)?.creditsAllocated ?? 0)

const rows = computed<MediaRow[]>(() => store.pagedRows)

/** The row the queue is currently on (page run or single file). */
const activeId = computed(() => (queue.isPlaying.value ? queue.currentId.value : null))

/** Queue items for the current page — ids are the progress entity_ids. */
const queueItems = computed<QueueItem[]>(() =>
  rows.value.map((r: MediaRow) => ({ id: r.entity_id, url: r.media.url }))
)

/** The article doc a row opens: the UI locale's doc, else the canonical one. */
function docLocale(r: MediaRow): string {
  const locales = r.content?.locales ?? []
  return locales.includes(uiLang.value) ? uiLang.value : r.content?.canonical ?? 'en'
}

/** Prerendered article route of a row that carries an article (any track). */
const articleHref = (r: MediaRow) => `/learn/${store.lang}/${store.track}/${r.topic}/${r.id}/${docLocale(r)}`

/** Native gloss (the user's language): UI locale first, then English canonical,
 *  then the target term itself — the native column is never blank. */
const native = (r: MediaRow): string => glossName(r.names, r.lang, uiLang.value) || r.term

/** Column headers: the language learned first (the toolbar language), then the
 *  native language — or English when it matches the target language (the gloss
 *  falls back to names.en in that case). */
const targetHeader = computed(() => languageName(store.lang))
const nativeHeader = computed(() => languageName(uiLang.value !== store.lang ? uiLang.value : 'en'))

/** Dictionary track: words only — an IPA column fits beside the name. The
 *  Lectures' expressions never show IPA. */
const isDictionary = computed(() => store.track === 'dictionary')

/**
 * Phonetic topic (alphabet, letter groups, phonics): the rows teach sounds, so
 * the second column shows the IPA transcription instead of the native gloss —
 * "măr" for the letter A is noise, `/a/` is the lesson. The IPA column is then
 * always visible (it replaces the translation, it does not sit beside it).
 */
const isPhonetic = computed(() => store.topic?.phonetic === true)

/** The second column's header: IPA on a phonetic topic, else the native language. */
const secondHeader = computed(() =>
  isPhonetic.value ? copy('dictionary.col_ipa', 'IPA') : nativeHeader.value
)

/** The second column's cell: IPA on a phonetic topic, else the native gloss. */
const secondCell = (r: MediaRow): string => (isPhonetic.value ? (r.ipa ?? '') : native(r))

/**
 * The muted line under the term. On a phonetic row the useful fact is the
 * example word ("Apfel" for the letter A) — the manifest's `context` there is
 * the glyph itself, which would print the term twice. Elsewhere it is the
 * usage note. A value equal to the term is never shown.
 */
const contextLine = (r: MediaRow): string => {
  const line = (isPhonetic.value ? r.example : r.context) ?? ''
  return line && line !== r.term ? line : ''
}

const isLearned = (r: MediaRow) => (progress ? progress.isLearned(r.entity_id) : false)
const toggleLearned = (r: MediaRow) => void progress?.toggleLearned(r.entity_id)

/** The ids the header button acts on — the rows you can see (the open topic's
 *  page, or the current search-results page). */
const scopeIds = computed<string[]>(() => rows.value.map((r: MediaRow) => r.entity_id))

/** Every id in the current scope is marked done (drives the header button). */
const allScopeLearned = computed(
  () => scopeIds.value.length > 0 && scopeIds.value.every((id: string) => (progress ? progress.isLearned(id) : false))
)

/**
 * Header check-all / reset: one click marks the whole visible page done; when
 * everything is already done the same button resets — clears the learned state
 * AND the listen counts, so the 5-listen auto-check starts from zero. No
 * confirmation: the user learns to deal with it from mistakes.
 */
async function toggleScopeLearned() {
  if (!progress || scopeIds.value.length === 0) return
  const handle = progress // narrowed alias — TS keeps it inside the closures below
  const ids = scopeIds.value
  if (allScopeLearned.value) {
    await handle.setLearnedMany(ids, false)
    await handle.clearListens(ids)
  } else {
    await handle.setLearnedMany(
      ids.filter((id: string) => !handle.isLearned(id)),
      true
    )
  }
}

/** Row play button: one file only. Clicking the active row's button pauses it
 *  in place (position held) — clicking again resumes the same run, looped or
 *  not — instead of stopping the queue outright. */
function playRow(r: MediaRow) {
  if (activeId.value === r.entity_id) {
    if (queue.paused.value) queue.resume()
    else queue.pause()
  } else {
    queue.playOne({ id: r.entity_id, url: r.media.url }, { onItemEnded })
  }
}

/** The active row is held mid-run (paused, not stopped) — position kept. */
const rowPaused = (r: MediaRow) => activeId.value === r.entity_id && queue.paused.value

/** Any row click stops the autoplay (the buttons stop propagation). */
function stopAutoplay() {
  if (queue.isPlaying.value) queue.stop()
}

/** Keep the playing row in view as the queue advances (window scrolling). */
function followActive(id: string | null) {
  if (!id) return
  document.getElementById(`dict-row-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

/** Loop lap: the list jumps back to the beginning. */
function onCycle() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

/** Count one completed listen — the 5th (10th, …) auto-marks the word learned. */
function onItemEnded(item: QueueItem) {
  void progress?.registerListen(item.id)
}

watch(activeId, (id: string | null) => {
  if (!id) return
  void nextTick(() => followActive(id))
})

// Structural changes invalidate the run — stop the autoplay. The viewport
// stays where it is on page changes (no forced jump to the top).
watch(
  () => [store.page, store.pageSize, store.dictionaryQuery] as const,
  () => {
    if (queue.isPlaying.value) queue.stop()
  }
)
watch(
  () => [store.searchActive, store.topicCode] as const,
  () => queue.stop()
)
</script>
<template>
  <div class="space-y-1.5">
    <!-- The frame title + word search bar live in RoadmapShell (always
         visible); this pane starts at the table toolbar. -->
    <DictionaryToolbar :queue="queue" :items="queueItems" :on-cycle="onCycle" :on-item-ended="onItemEnded" />

    <div
      v-if="store.loadingTopic || store.loadingSearch"
      class="rounded-lg border border-edge bg-surface p-6 text-sm text-muted"
    >
      …
    </div>

    <p
      v-else-if="rows.length === 0"
      class="rounded-lg border border-edge bg-surface px-4 py-6 text-sm text-muted"
    >
      {{
        store.searchActive
          ? copy('ui.no_results', 'No matches found.')
          : copy('roadmap.no_words', 'No words in this topic yet — content is being prepared.')
      }}
    </p>

    <!-- The paginated word table: target · native · play · learned -->
    <div v-else class="overflow-clip rounded-lg border border-edge bg-surface shadow-sm">
      <table class="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col />
          <col />
          <col v-if="isDictionary && !isPhonetic" class="hidden sm:table-column" />
          <col class="w-14" />
          <col class="w-14" />
          <col class="w-14" />
        </colgroup>
        <thead class="sticky z-10 bg-soft text-left text-xs uppercase tracking-wide text-faint" :class="THEAD_STICKY_TOP">
          <tr>
            <th class="px-3 py-2 font-medium [overflow-wrap:anywhere]">{{ targetHeader }}</th>
            <th class="px-3 py-2 font-medium [overflow-wrap:anywhere]">{{ secondHeader }}</th>
            <th v-if="isDictionary && !isPhonetic" class="hidden px-3 py-2 font-medium sm:table-cell [overflow-wrap:anywhere]">
              {{ copy('dictionary.col_ipa', 'IPA') }}
            </th>
            <!-- Article column: an eye that opens the legend — one glyph, no
                 second symbol underneath -->
            <th class="w-14 px-1 py-2 text-center">
              <button
                type="button"
                class="btn-pastel inline-flex h-8 w-8 items-center justify-center rounded-full text-faint transition hover:text-accent"
                :aria-label="copy('legend.open', 'Show legend')"
                :title="copy('legend.open', 'Show legend')"
                @click="legendOpen = true"
              >
                <EyeIcon class="h-4 w-4" aria-hidden="true" />
              </button>
            </th>
            <!-- Sound column: a speaker that mutes/unmutes every player -->
            <th class="w-14 px-1 py-2 text-center font-medium">
              <button
                type="button"
                class="btn-pastel inline-flex h-8 w-8 items-center justify-center rounded-full text-faint transition hover:text-accent"
                :aria-pressed="sound.enabled.value"
                :aria-label="
                  sound.enabled.value
                    ? copy('ui.sound_off', 'Turn sound off')
                    : copy('ui.sound_on', 'Turn sound on')
                "
                :title="
                  sound.enabled.value
                    ? copy('ui.sound_off', 'Turn sound off')
                    : copy('ui.sound_on', 'Turn sound on')
                "
                @click="sound.toggle()"
              >
                <SpeakerWaveIcon v-if="sound.enabled.value" class="h-4 w-4" aria-hidden="true" />
                <SpeakerXMarkIcon v-else class="h-4 w-4" aria-hidden="true" />
              </button>
            </th>
            <th class="w-14 px-1 py-2 text-center font-medium">
              <!-- Check-all / reset: scope = the visible page; same height as
                   the data rows; marks every row done, then resets them -->
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-40"
                :class="
                  allScopeLearned
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'btn-pastel border-edge text-muted hover:border-accent hover:text-accent'
                "
                :disabled="!scopeIds.length"
                :aria-pressed="allScopeLearned"
                :title="
                  allScopeLearned
                    ? copy('dictionary.reset_page', 'Reset page progress')
                    : copy('dictionary.check_all', 'Mark all as learned')
                "
                @click.stop="toggleScopeLearned"
              >
                <ArrowPathIcon v-if="allScopeLearned" class="h-4 w-4" aria-hidden="true" />
                <CheckIcon v-else class="h-4 w-4" aria-hidden="true" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in rows"
            :id="`dict-row-${r.entity_id}`"
            :key="r.entity_id"
            class="scroll-mt-24 border-t border-edge transition-colors"
            :class="[activeId === r.entity_id ? 'bg-accent-soft' : 'hover:bg-soft', isDictionary ? '' : 'expr-row']"
            @click="stopAutoplay"
          >
            <td class="px-3 py-2">
              <!-- File ID: kept in the DOM as a hidden (screen-reader-only)
                   field — no visible column anymore -->
              <span class="sr-only">{{ r.id }}</span>
              <span class="font-medium text-content">{{ r.term }}</span>
              <!-- Context line: the example word on a phonetic row ("Apfel"
                   for the letter A), the usage note elsewhere. Never repeat
                   the term itself — a phonetic row's context IS its glyph,
                   which would print "A" twice. -->
              <span
                v-if="contextLine(r)"
                class="mt-0.5 block text-xs text-faint"
                :title="contextLine(r)"
              >{{ contextLine(r) }}</span>
              <!-- Search results come from every topic: the chip names the
                   row's topic and jumps straight into its word table -->
              <button
                v-if="store.searchActive"
                type="button"
                class="ml-1 rounded bg-soft px-1.5 py-0.5 font-code text-[10px] text-muted transition hover:bg-accent-soft hover:text-accent"
                :title="copy('dictionary.open_topic', 'Open topic')"
                @click.stop="store.openTopic(r.topic)"
              >
                {{ r.topic }}
              </button>
            </td>
            <td class="px-3 py-2 text-content" :class="isPhonetic ? 'ipa whitespace-nowrap text-xs text-muted' : ''">
              {{ secondCell(r) }}
            </td>
            <!-- IPA column (Dictionary only, and only when it is not already
                 standing in for the translation column) — muted mono, blank
                 until the transcription is authored on the entity -->
            <td
              v-if="isDictionary && !isPhonetic"
              class="hidden whitespace-nowrap px-3 py-2 ipa text-xs text-muted sm:table-cell"
            >
              {{ r.ipa ?? '' }}
            </td>
            <!-- Read: always shown. A row with an article (word, expression,
                 story) opens it on its prerendered page; otherwise the same
                 icon renders disabled, like the "Audio coming soon" play -->
            <td class="w-14 px-1 py-2 text-center">
              <NuxtLink
                v-if="r.content"
                :to="articleHref(r)"
                class="btn-pastel inline-flex h-8 w-8 items-center justify-center rounded-full border border-edge text-accent transition hover:border-accent"
                :aria-label="`${copy('article.read', 'Read')} ${r.term}`"
                :title="`${copy('article.read', 'Read')} ${r.term}`"
                @click.stop
              >
                <span class="text-base leading-none" aria-hidden="true">📃</span>
              </NuxtLink>
              <button
                v-else
                type="button"
                class="relative inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-full border border-edge text-faint"
                disabled
                :aria-label="copy('article.coming_soon_row', 'No article yet')"
                :title="copy('article.coming_soon_row', 'No article yet')"
                @click.stop
              >
                <span class="text-base leading-none" aria-hidden="true">📃</span>
                <!-- Diagonal strike: "no article" reads at a glance in both themes -->
                <span class="absolute h-0.5 w-6 rotate-45 rounded-full bg-muted" aria-hidden="true" />
              </button>
            </td>
            <td class="w-14 px-1 py-2 text-center">
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm transition disabled:cursor-not-allowed disabled:border-edge disabled:text-faint"
                :class="
                  rowPaused(r)
                    ? 'row-blink-paused border-transparent text-white'
                    : activeId === r.entity_id
                      ? 'border-transparent bg-red-800 text-white'
                      : 'btn-pastel border-edge text-accent hover:border-accent'
                "
                :disabled="!r.media.url"
                :aria-label="`${copy('dictionary.play_single', 'Play')} ${r.term}`"
                :title="
                  !r.media.url
                    ? copy('ui.audio_coming_soon', 'Audio coming soon')
                    : rowPaused(r)
                      ? copy('dictionary.resume', 'Resume')
                      : activeId === r.entity_id
                        ? copy('dictionary.pause', 'Pause')
                        : `${copy('dictionary.play_single', 'Play')} ${r.term}`
                "
                @click.stop="playRow(r)"
              >
                <!-- Pause bars while the row plays (looping or not) — held/paused
                     rows and idle rows show the play glyph instead. -->
                <span class="flex h-full w-full items-center justify-center leading-none" :class="{ 'text-lg': activeId === r.entity_id }">
                  {{ rowPaused(r) ? '▶' : activeId === r.entity_id ? '❚❚' : '▶' }}
                </span>
              </button>
            </td>
            <td class="w-14 px-1 py-2 text-center">
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-full border transition"
                :class="
                  isLearned(r)
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'btn-pastel border-edge text-muted hover:border-accent hover:text-accent'
                "
                :aria-pressed="isLearned(r)"
                :title="isLearned(r) ? copy('ui.learned', 'Learned') : copy('ui.mark_learned', 'Mark as learned')"
                @click.stop="toggleLearned(r)"
              >
                <!-- Check invites marking done; once learned (manual or the
                     5-listen auto-check) it becomes redo, like every other
                     check/redo button in the roadmap tree. -->
                <ArrowPathIcon v-if="isLearned(r)" class="h-4 w-4" aria-hidden="true" />
                <CheckIcon v-else class="h-4 w-4" aria-hidden="true" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <LegendDialog v-if="legendOpen" :credit-total="creditTotal" @close="legendOpen = false" />
  </div>
</template>

<style scoped>
/* Expression rows (Lectures and any non-dictionary table): fixed two-line
 * height so long wrapped expressions and short ones render equal-height —
 * the text is vertically centered in both. */
.expr-row td {
  height: 3.4rem;
  vertical-align: middle;
}

/* Held/paused row button: dark red, blinking — distinct from the plain
 * accent "active" look so a paused loop reads as "waiting", not "playing". */
.row-blink-paused {
  animation: row-blink 1s step-start infinite;
}
@keyframes row-blink {
  0%,
  49% {
    background-color: rgb(220 38 38); /* red-600 */
  }
  50%,
  100% {
    background-color: rgb(127 29 29); /* red-900 */
  }
}
</style>