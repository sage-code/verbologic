// ExpressionSearch — instant client-side vocabulary/phrase browser with audio
// and per-row "mark as learned" progress (persisted via useProgress).
<script setup lang="ts">
import type { Lang, VerbologicEntity } from '~/types/entities'
import { useSearchStore } from '~/stores/searchStore'
import { CheckIcon } from '@heroicons/vue/20/solid'

const props = defineProps<{ lang: Lang }>()
const store = useSearchStore()
const { t } = useLocale()
const progress = useProgress(() => props.lang)
const loading = ref(true)

onMounted(async () => {
  await store.init(props.lang)
  await progress.refresh()
  loading.value = false
})

const inputClass =
  'w-full rounded-lg border border-edge-strong bg-surface px-4 py-2 text-sm text-content placeholder:text-faint shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30'

/** Primary gloss for the active track: en for the Romanian track, ro for the English track. */
function gloss(e: VerbologicEntity): string {
  if (props.lang === 'ro') {
    return e.translations.en || e.translations.es || e.translations.it || e.translations.fr || ''
  }
  return e.translations.ro || ''
}

function note(e: VerbologicEntity): string | null {
  if (props.lang !== 'ro') return null
  return t(`contrastive.${e.id}`)
}

function typeLabel(type: VerbologicEntity['type']): string {
  return (
    t(`ui.type_${type}`) ?? {
      word: 'Word',
      sentence: 'Sentence',
      question: 'Q&A',
      imperative: 'Imperative',
      letter: 'Letter',
      greeting: 'Greeting'
    }[type]
  )
}

function isLearned(e: VerbologicEntity): boolean {
  return progress.isLearned(e.id)
}

function toggleLearned(e: VerbologicEntity): void {
  void progress.toggleLearned(e.id)
}

function learnedLabel(e: VerbologicEntity): string {
  return isLearned(e) ? (t('ui.learned') ?? 'Learned') : (t('ui.mark_learned') ?? 'Learn')
}
</script>

<template>
  <div class="space-y-4">
    <!-- Loading shell -->
    <div v-if="loading" class="rounded-lg border border-edge bg-surface p-6 text-sm text-muted">
      {{ t('ui.search_placeholder') }}…
    </div>

    <template v-else>
      <input
        v-model="store.query"
        :class="inputClass"
        type="search"
        :placeholder="t('ui.search_placeholder') || 'Search…'"
      />

      <p class="text-xs text-muted">
        {{ store.results.length }} {{ t('ui.results') ?? 'results' }}
        <span v-if="store.query"> {{ t('ui.for') ?? 'for' }} “{{ store.query }}”</span>
      </p>

      <ul class="divide-y divide-edge overflow-hidden rounded-lg border border-edge bg-surface shadow-sm">
        <li v-for="e in store.results" :key="e.id" class="flex items-start gap-3 px-4 py-3">
          <MediaViewer :src="e.audio" :label="e.term" />

          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span class="font-medium text-content">{{ e.term }}</span>
              <span v-if="e.ipa" class="rounded bg-soft px-1.5 py-0.5 text-xs text-muted">{{ e.ipa }}</span>
              <span v-if="e.example" class="text-sm text-accent">{{ e.example }}</span>
              <span class="text-xs uppercase tracking-wide text-faint">{{ typeLabel(e.type) }}</span>
              <span v-if="e.category" class="text-xs text-faint">{{ e.category.title }}</span>
            </div>
            <p v-if="gloss(e)" class="mt-0.5 text-sm text-muted">{{ gloss(e) }}</p>
            <p v-if="e.context" class="mt-0.5 text-xs text-faint">{{ e.context }}</p>
            <ContrastiveNote :note="note(e)" />
          </div>

          <!-- Learned toggle — idempotent write (learned_items UNIQUE(user_id, entity_id)) -->
          <button
            type="button"
            class="shrink-0 self-start rounded-full border px-2.5 py-1 text-xs font-medium transition"
            :class="
              isLearned(e)
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-edge text-muted hover:border-accent hover:text-accent'
            "
            :aria-pressed="isLearned(e)"
            :title="learnedLabel(e)"
            @click="toggleLearned(e)"
          >
            <span class="flex items-center gap-1">
              <CheckIcon class="h-3.5 w-3.5" aria-hidden="true" />
              <span class="hidden sm:inline">{{ learnedLabel(e) }}</span>
            </span>
          </button>
        </li>

        <li v-if="store.results.length === 0" class="px-4 py-6 text-sm text-muted">
          {{ t('ui.no_results') || 'No matches found.' }}
        </li>
      </ul>
    </template>
  </div>
</template>
