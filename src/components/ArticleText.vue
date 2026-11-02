<script setup lang="ts">
// ArticleText — renders the blocks of one reading page: a heading (`h`), a
// paragraph (`p`), a bullet or numbered list (`ul` / `ol`) or a table (`table`).
// Article text is plain strings with two inline marks, **bold** and `code`;
// nothing else is interpreted, so no Markdown parser ships. Lists and tables
// are recognised by their shape in `blockOf` (src/lib/article.ts).
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
      <table v-else-if="node.t === 'table'">
        <thead>
          <tr>
            <th v-for="(cell, c) in node.headers" :key="c">{{ cell }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, r) in node.rows" :key="r">
            <td v-for="(cell, c) in row" :key="c">
              <template v-for="(part, i) in inlineParts(cell)" :key="i">
                <strong v-if="part.mark === 'b'">{{ part.text }}</strong>
                <code v-else-if="part.mark === 'c'">{{ part.text }}</code>
                <template v-else>{{ part.text }}</template>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
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
