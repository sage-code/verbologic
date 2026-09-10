// SocialIcon — real brand logos (simple-icons) rendered as inline SVG paths.
<script setup lang="ts">
import { siBluesky, siDiscord, siYoutube, siReddit } from 'simple-icons'

const BRANDS = {
  bluesky: siBluesky,
  discord: siDiscord,
  youtube: siYoutube,
  reddit: siReddit
} as const

const props = defineProps<{ icon: string; sizeClass?: string }>()

const brand = computed(() => props.icon in BRANDS ? BRANDS[props.icon as keyof typeof BRANDS] : null)
</script>

<template>
  <svg
    v-if="brand"
    viewBox="0 0 24 24"
    class="shrink-0 transition"
    :class="sizeClass || 'h-5 w-5'"
    role="img"
    :aria-label="brand.title"
    :title="brand.title"
    fill="currentColor"
  >
    <path :d="brand.path" />
  </svg>
</template>
