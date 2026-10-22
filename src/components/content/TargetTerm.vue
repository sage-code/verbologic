<script setup lang="ts">
import { computed, inject } from 'vue'
import { DICTIONARY_TERM_KEY } from '~/lib/dictionary-term'

const props = defineProps<{ capitalize?: boolean }>()
const providedTerm = inject(DICTIONARY_TERM_KEY, computed(() => ''))
const term = computed(() => {
  const value = providedTerm.value
  if (!props.capitalize || !value) return value
  return value[0].toLocaleUpperCase() + value.slice(1)
})
</script>

<template>
  <span class="font-semibold">{{ term }}</span>
</template>
