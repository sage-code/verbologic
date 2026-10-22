<script setup lang="ts">
import type { DictionaryArticleBlock } from '~/types/dictionaryArticle'

defineProps<{
  blocks: DictionaryArticleBlock[]
}>()
</script>

<template>
  <div class="lecture-prose space-y-4 text-content">
    <template v-for="(block, index) in blocks" :key="index">
      <component
        :is="`h${block.level}`"
        v-if="block.type === 'heading'"
        class="text-xl font-semibold"
      >
        {{ block.text }}
      </component>
      <p v-else-if="block.type === 'paragraph'">
        {{ block.text }}
      </p>
      <component
        :is="block.ordered ? 'ol' : 'ul'"
        v-else-if="block.type === 'list'"
        class="list-inside space-y-1"
        :class="block.ordered ? 'list-decimal' : 'list-disc'"
      >
        <li v-for="(item, itemIndex) in block.items" :key="itemIndex">{{ item }}</li>
      </component>
      <div v-else-if="block.type === 'table'" class="overflow-x-auto">
        <table class="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              <th
                v-for="(header, column) in block.headers"
                :key="column"
                class="border-b border-edge px-3 py-2 font-semibold"
              >
                {{ header }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rowIndex) in block.rows" :key="rowIndex">
              <td
                v-for="(cell, column) in row"
                :key="column"
                class="border-b border-edge px-3 py-2"
              >
                {{ cell }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
