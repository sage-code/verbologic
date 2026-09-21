// MediaViewer — R2 audio player with graceful handling of missing/TTS-queued audio.
<script setup lang="ts">
const props = withDefaults(defineProps<{ src: string | null; label?: string }>(), {
  label: ''
})

const { t } = useLocale()
const playing = ref(false)
const player = shallowRef<HTMLAudioElement | null>(null)

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
  <button
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
