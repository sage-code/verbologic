// Callout — MDC component for `::callout{type="tip"}` blocks in lecture prose.
<script setup lang="ts">
withDefaults(defineProps<{ type?: 'tip' | 'warn' | 'note' }>(), { type: 'note' })
</script>

<template>
  <aside
    class="my-4 rounded-lg border p-4 text-sm"
    :class="{
      'border-accent/40 bg-accent-soft text-content': type === 'tip',
      'border-yellow-400/50 bg-yellow-50 text-content dark:bg-yellow-900/20': type === 'warn',
      'border-edge bg-soft text-content': type === 'note'
    }"
  >
    <slot />
  </aside>
</template>