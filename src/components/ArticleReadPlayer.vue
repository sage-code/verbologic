// ArticleReadPlayer — the article-level "read" control above a story panel.
// Plays the full-article recording for ONE language (media/[track]/…/read/
// [locale].mp3). Play becomes Pause while running; Pause becomes Resume; the
// adjacent Stop button resets to the start. A pending recording renders the
// disabled "audio coming soon" state instead of a dead button.
<script setup lang="ts">
import { PauseIcon, PlayIcon, StopIcon } from '@heroicons/vue/24/solid'
import { useSound } from '~/composables/useSound'

const props = withDefaults(
  defineProps<{
    /** R2 URL of this language's read recording (null while pending). */
    src: string | null
    /** Language name shown in the control's accessible label. */
    label?: string
    /**
     * Start offset in seconds for the current reading page. Pressing Play
     * seeks here, so page 3 starts at page 3 instead of replaying pages 1–2.
     * 0 (or absent) plays from the beginning.
     */
    startAt?: number
  }>(),
  { label: '', startAt: 0 }
)

const copy = useCopy()
const sound = useSound()
const player = shallowRef<HTMLAudioElement | null>(null)
const playing = ref(false)
const paused = ref(false)

const state = computed<'idle' | 'playing' | 'paused'>(() =>
  playing.value ? 'playing' : paused.value ? 'paused' : 'idle'
)

function ensurePlayer(): HTMLAudioElement | null {
  if (!props.src) return null
  if (!player.value) {
    const audio = sound.bind(new Audio(props.src))
    audio.onended = () => {
      playing.value = false
      paused.value = false
    }
    player.value = audio
  }
  return player.value
}

function toggle() {
  const audio = ensurePlayer()
  if (!audio) return
  if (playing.value) {
    audio.pause()
    playing.value = false
    paused.value = true
    return
  }
  // Starting from idle seeks to the current page; resuming keeps its position.
  //
  // The seek must wait for metadata: setting `currentTime` on a fresh element
  // whose duration is still NaN is silently dropped, so Play would start at 0.
  // `readyState >= 1` (HAVE_METADATA) means the seek will stick.
  const seekTo = !paused.value && props.startAt > 0 ? props.startAt : null
  if (seekTo !== null) {
    if (audio.readyState >= 1) {
      audio.currentTime = seekTo
    } else {
      audio.addEventListener(
        'loadedmetadata',
        () => {
          audio.currentTime = seekTo
        },
        { once: true }
      )
    }
  }
  void audio.play().catch(() => {})
  playing.value = true
  paused.value = false
}

function stop() {
  const audio = player.value
  if (audio) {
    audio.pause()
    audio.currentTime = 0
  }
  playing.value = false
  paused.value = false
}

// A different language's recording replaces the current one.
watch(
  () => props.src,
  () => {
    stop()
    sound.unbind(player.value)
    player.value = null
  }
)

onBeforeUnmount(() => {
  player.value?.pause()
  sound.unbind(player.value)
})

defineExpose({ stop })
</script>

<template>
  <div class="flex items-center gap-1.5">
    <button
      type="button"
      class="inline-flex h-8 items-center gap-1.5 rounded-full border border-edge bg-surface px-3 text-xs font-medium text-accent transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
      :disabled="!src"
      :aria-label="
        state === 'playing'
          ? copy('ui.pause', 'Pause')
          : state === 'paused'
            ? copy('ui.resume', 'Resume')
            : copy('ui.read', 'Read')
      "
      :title="src ? (label ? `${copy('ui.read', 'Read')} — ${label}` : copy('ui.read', 'Read')) : copy('ui.audio_coming_soon', 'Audio coming soon')"
      @click="toggle"
    >
      <PauseIcon v-if="state === 'playing'" class="h-3.5 w-3.5" aria-hidden="true" />
      <PlayIcon v-else class="h-3.5 w-3.5" aria-hidden="true" />
      <span>
        {{
          state === 'playing'
            ? copy('ui.pause', 'Pause')
            : state === 'paused'
              ? copy('ui.resume', 'Resume')
              : copy('ui.read', 'Read')
        }}
      </span>
    </button>
    <button
      type="button"
      class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-edge bg-surface text-muted transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
      :disabled="state === 'idle'"
      :aria-label="copy('ui.stop', 'Stop')"
      :title="copy('ui.stop', 'Stop')"
      @click="stop"
    >
      <StopIcon class="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  </div>
</template>
