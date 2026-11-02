<script setup lang="ts">
// ArticleText - renders the blocks of one reading page: a heading (`h`), a
// paragraph (`p`), a bullet or numbered list (`ul` / `ol`), a dialog (`dialog`)
// or a table (`table`). Text is plain with two inline marks, **bold** and
// `code`, so no Markdown parser ships; only a table is HTML, allow-listed and
// stripped of attributes by `safeHtml` (src/lib/article.ts).
import type { ArticleNode } from '~/lib/article'
import { inlineParts } from '~/lib/article'

defineProps<{ nodes: ArticleNode[] }>()
</script>

<template>
  <div>
    <template v-for="(node, index) in nodes" :key="index">
      <h2 v-if="node.t === 'h'">{{ node.text }}</h2>
      <component :is="node.t" v-else-if="node.t === 'ul' || node.t === 'ol'">
        <li v-for="(item, k) in node.items" :key="k">
          <template v-for="(part, i) in inlineParts(item)" :key="i">
            <strong v-if="part.mark === 'b'">{{ part.text }}</strong>
            <code v-else-if="part.mark === 'c'">{{ part.text }}</code>
            <template v-else>{{ part.text }}</template>
          </template>
        </li>
      </component>
      <div v-else-if="node.t === 'dialog'" class="my-3 space-y-1">
        <p v-for="(line, k) in node.lines" :key="k" class="!my-0">
          <strong>{{ line.speaker }}:</strong>
          <template v-for="(part, i) in inlineParts(line.text)" :key="i">
            <strong v-if="part.mark === 'b'">{{ part.text }}</strong>
            <code v-else-if="part.mark === 'c'">{{ part.text }}</code>
            <template v-else>{{ part.text }}</template>
          </template>
        </p>
      </div>
      <!-- A table is the one HTML block: sanitised in nodesOf, never raw -->
      <div v-else-if="node.t === 'table'" v-html="node.html" />
      <p v-else>
        <template v-for="(part, i) in inlineParts(node.text)" :key="i">
          <strong v-if="part.mark === 'b'">{{ part.text }}</strong>
          <code v-else-if="part.mark === 'c'">{{ part.text }}</code>
          <template v-else>{{ part.text }}</template>
        </template>
      </p>
    </template>
  </div>
</template>
