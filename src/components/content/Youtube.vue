// Youtube — MDC component for `::youtube{id="VIDEO_ID" title="…"}` in article prose.
<script setup lang="ts">
const props = withDefaults(defineProps<{ id: string; title?: string }>(), { title: 'Video' })
const src = computed(() => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(props.id)}`)
</script>

<template>
  <figure class="my-5 overflow-hidden rounded-lg border border-edge bg-surface">
    <iframe
      :src="src"
      :title="title"
      class="aspect-video w-full"
      loading="lazy"
      allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      referrerpolicy="strict-origin-when-cross-origin"
      allowfullscreen
    />
  </figure>
</template>
