<!--
  PhoneticArticle — renders one page of a letter/sound article from the
  alphabet data (src/data/alphabets/<lang>.json) instead of Markdown.

  A phonetic article is a fixed template over structured facts (glyph, IPA,
  letter name, example, note), so authoring it as 3 267 Markdown files was
  pure duplication: the data files are the authoring surface and this
  component is the template (planning/performance-and-content-refactor.md §3
  phase 3). One section = one page, the pagination contract the reading view
  has always had.

  Inline formatting is deliberately tiny — `**bold**` and `` `ipa` `` — because
  that is all the authored notes use. Anything richer belongs in a section's
  own component, not in a Markdown parser.
-->
<script setup lang="ts">
import type { PhoneticSection } from '~/types/phonetic'

const props = defineProps<{
  /** The page to render (one section of the article). */
  section: PhoneticSection
  /** The glyph, shown as the article's lead-in on the first page. */
  glyph?: string | null
  /** The IPA transcription, shown beside the glyph on the first page. */
  ipa?: string | null
  /** True on the first page — the glyph/IPA lead-in renders only there. */
  lead?: boolean
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
</script>

<template>
  <div class="space-y-3">
    <p v-if="lead && (glyph || ipa)" class="flex flex-wrap items-baseline gap-2">
      <span v-if="glyph" class="text-2xl font-bold text-content">{{ glyph }}</span>
      <span v-if="ipa" class="ipa rounded bg-soft px-1.5 py-0.5 text-sm text-muted">{{ ipa }}</span>
    </p>
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
