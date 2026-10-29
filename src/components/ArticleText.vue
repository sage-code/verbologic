<script setup lang="ts">
// ArticleText — renders the blocks of one reading page: a heading (`h`) or a
// paragraph (`p`). Article text is plain strings with two inline marks,
// **bold** and `code`; nothing else is interpreted, so no Markdown parser ships.
import type { ArticleNode } from '~/lib/article'
import { inlineParts } from '~/lib/article'

defineProps<{ nodes: ArticleNode[] }>()
</script>

<template>
  <div>
    <template v-for="(node, index) in nodes" :key="index">
      <h2 v-if="node.t === 'h'">{{ node.text }}</h2>
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
