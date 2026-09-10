// ContrastiveNote — L1-relative pronunciation/grammar hint extracted from locale data.
<script setup lang="ts">
withDefaults(defineProps<{ note: string | null }>(), { note: null })
</script>

<template>
  <p v-if="note" class="mt-1 rounded-r-md border-l-2 border-accent bg-accent-soft px-3 py-1 text-xs italic text-muted">
    {{ note }}
  </p>
</template>
