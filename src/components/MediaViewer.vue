// MediaViewer — R2 media player that switches on the payload's mime type:
// audio keeps the round play button (dictionary rows), video renders an
// inline player and image a picture element (lectures / stories), each with
// graceful handling of missing/TTS-queued media.
<script setup lang="ts">
const props = withDefaults(defineProps<{ src: string | null; mime?: string | null; label?: string; compact?: boolean }>(), {
  mime: null,
  label: '',
  compact: false
})

const { t } = useLocale()
const playing = ref(false)
const player = shallowRef<HTMLAudioElement | null>(null)

/** 'video/mp4' → 'video', 'image/webp' → 'image', everything else → audio. */
const kind = computed(() => {
  if (props.mime?.startsWith('video/')) return 'video'
  if (props.mime?.startsWith('image/')) return 'image'
  return 'audio'
})

function toggle() {
  if (!props.src) return
  if (!player.value) player.value = new Audio(props.src)
  if (playing.value) {
    player.value.pause()
  } else {
    void player.value.play()
  }
  playing.value = !playing.value
}

onBeforeUnmount(() => player.value?.pause())
</script>

<template>
  <!-- Video: a real player (lectures) — compact mode shrinks it into a row -->
  <video
    v-if="kind === 'video' && src"
    :src="src"
    controls
    preload="metadata"
    class="w-full rounded-lg border border-edge bg-black"
    :class="compact ? 'aspect-video max-w-xs' : 'aspect-video'"
    :aria-label="label || t('ui.play') || 'Play'"
  />

  <!-- Image: stories render the picture itself -->
  <img
    v-else-if="kind === 'image' && src"
    :src="src"
    :alt="label"
    loading="lazy"
    class="w-full rounded-lg border border-edge object-cover"
    :class="compact ? 'max-w-xs' : ''"
  />

  <!-- Audio (default): the round play button -->
  <button
    v-else
    type="button"
    class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-edge bg-surface text-sm text-accent transition hover:bg-accent hover:text-on-accent disabled:cursor-not-allowed disabled:opacity-40"
    :disabled="!src"
    :aria-label="label || t('ui.play') || 'Play'"
    :title="src ? label || t('ui.play') || 'Play' : t('ui.audio_coming_soon') || 'Audio coming soon'"
    @click="toggle"
  >
    <span class="leading-none">{{ playing ? '❚❚' : '▶' }}</span>
  </button>
</template>
