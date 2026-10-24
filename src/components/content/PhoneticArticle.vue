<!--
  PhoneticArticle — renders one page of a letter/sound article from the
  alphabet data (src/data/alphabets/<lang>.json) instead of Markdown.

  A phonetic article is a fixed template over structured facts (glyph, IPA,
  letter name, example, note), so authoring it as 3 267 Markdown files was
  pure duplication: the data files are the authoring surface and this
  component is the template (planning/performance-and-content-refactor.md §3
  phase 3). One section = one page, the pagination contract the reading view
  has always had.

  The lead-in (first page only) is the letter itself: the printed glyph, the
  cursive uppercase/lowercase pair, the IPA, and the example word with its own
  IPA and translation. The cursive face is Playwrite US Trad — the closest
  freely-licensed match to the Zaner-Bloser Cursive model (see --font-cursive).

  Inline formatting is deliberately tiny — `**bold**` and `` `ipa` `` — because
  that is all the authored notes use. Anything richer belongs in a section's
  own component, not in a Markdown parser.
-->
<script setup lang="ts">
import type { PhoneticEntry, PhoneticSection } from '~/types/phonetic'

const props = defineProps<{
  /** The page to render (one section of the article). */
  section: PhoneticSection
  /** The entry itself — the lead-in reads glyph, IPA, example and variations. */
  entry?: PhoneticEntry | null
  /** True on the first page — the glyph/IPA lead-in renders only there. */
  lead?: boolean
  /** Explanation locale, for the example word's translation. */
  locale?: string
}>()

/** Split a text run into bold / code / plain segments. */
interface Segment {
  kind: 'text' | 'bold' | 'code'
  value: string
}

const segments = computed<Segment[]>(() => {
  const out: Segment[] = []
  const pattern = /\*\*(.+?)\*\*|`([^`]+)`/g
  let last = 0
  for (const match of props.section.text.matchAll(pattern)) {
    const at = match.index ?? 0
    if (at > last) out.push({ kind: 'text', value: props.section.text.slice(last, at) })
    if (match[1] !== undefined) out.push({ kind: 'bold', value: match[1] })
    else out.push({ kind: 'code', value: match[2] ?? '' })
    last = at + match[0].length
  }
  if (last < props.section.text.length) out.push({ kind: 'text', value: props.section.text.slice(last) })
  return out
})

const glyph = computed(() => props.entry?.glyph ?? null)

/** The cursive pair: uppercase + lowercase of the same letter. */
const cursivePair = computed(() => {
  const value = glyph.value
  if (!value) return null
  // A multi-character group ("ea", "sch") has no case pair to show.
  if ([...value].length !== 1) return null
  return { upper: value.toLocaleUpperCase(), lower: value.toLocaleLowerCase() }
})

const exampleTranslation = computed(() => {
  const map = props.entry?.exampleTranslation
  if (!map) return null
  return map[props.locale ?? 'en'] ?? map.en ?? null
})

const variations = computed(() => props.entry?.variations ?? [])
</script>

<template>
  <div class="space-y-4">
    <!-- Lead-in: the letter, printed and cursive, with its IPA and example -->
    <div v-if="lead && glyph" class="rounded-lg border border-edge bg-soft/60 p-4">
      <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
        <span class="text-5xl font-bold leading-none text-content">{{ glyph }}</span>
        <span v-if="cursivePair" class="cursive text-5xl text-accent" aria-hidden="true">
          {{ cursivePair.upper }} {{ cursivePair.lower }}
        </span>
        <span v-if="entry?.ipa" class="ipa rounded bg-surface px-2 py-1 text-lg text-muted">{{ entry.ipa }}</span>
      </div>

      <div
        v-if="entry?.example"
        class="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-edge pt-3"
      >
        <span class="text-xs uppercase tracking-wide text-faint">Example</span>
        <span class="text-lg font-medium text-content">{{ entry.example }}</span>
        <span v-if="entry.exampleIpa" class="ipa text-sm text-muted">{{ entry.exampleIpa }}</span>
        <span v-if="exampleTranslation" class="text-sm text-muted">— {{ exampleTranslation }}</span>
      </div>
    </div>

    <!-- Pronunciation variants: each with its own IPA and examples -->
    <div v-if="lead && variations.length" class="space-y-2">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-faint">Pronunciation</h3>
      <ul class="space-y-2">
        <li
          v-for="(variant, index) in variations"
          :key="index"
          class="rounded-lg border border-edge bg-surface px-3 py-2"
        >
          <div class="flex flex-wrap items-baseline gap-x-2">
            <span class="ipa text-base font-medium text-accent">{{ variant.ipa }}</span>
            <span v-if="variant.when" class="text-xs text-muted">{{ variant.when }}</span>
          </div>
          <p v-if="variant.examples.length" class="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <span v-for="(example, i) in variant.examples" :key="i" class="inline-flex items-baseline gap-1.5">
              <span class="text-content">{{ example.word }}</span>
              <span v-if="example.ipa" class="ipa text-xs text-muted">{{ example.ipa }}</span>
            </span>
          </p>
        </li>
      </ul>
    </div>

    <h2 v-if="section.title" class="text-sm font-semibold uppercase tracking-wide text-accent">
      {{ section.title }}
    </h2>
    <p>
      <template v-for="(segment, index) in segments" :key="index">
        <strong v-if="segment.kind === 'bold'" class="font-semibold text-content">{{ segment.value }}</strong>
        <code v-else-if="segment.kind === 'code'" class="ipa rounded bg-soft px-1 py-0.5 text-[0.9em] text-muted">{{ segment.value }}</code>
        <template v-else>{{ segment.value }}</template>
      </template>
    </p>
  </div>
</template>
