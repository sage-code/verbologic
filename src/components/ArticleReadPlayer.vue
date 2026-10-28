// ArticleReadPlayer — the article-level "read" control above a story panel.
// Plays the full-article recording for ONE language (media/[track]/…/read/
// [locale].mp3). Play becomes Pause while running; Pause becomes Resume; the
// adjacent Stop button resets to the start (`showStop` hides it when a page has two players, which then share one Stop). A pending recording renders the
// disabled "audio coming soon" state instead of a dead button. With `text` set
// (a language name), the button reads "Play" and the name instead of "Read".
//
// The recording is the WHOLE article, but the reader shows one page at a time,
// so the player is page-aware:
// - Play on page N seeks to that page's offset (`startAt`);
// - Pause keeps its position, so Resume continues mid-page;
// - reaching the end of a page advances the reader to the next page and keeps
//   playing from that page's start (`endAt`), so the text follows the voice;
// - moving to another page while playing seeks to that page's start, so the
//   voice follows the text.
<script setup lang="ts">
import { PauseIcon, PlayIcon, StopIcon } from '@heroicons/vue/24/solid'
import { useSound } from '~/composables/useSound'

const props = withDefaults(
  defineProps<{
    /** R2 URL of this language's read recording (null while pending). */
    src: string | null
    /** Language name shown in the control's accessible label. */
    label?: string
    /** Visible button text (a language name). Empty keeps the plain Read control. */
    text?: string
    /**
     * Start offset in seconds for the current reading page. Pressing Play
     * seeks here, so page 3 starts at page 3 instead of replaying pages 1–2.
     * 0 (or absent) plays from the beginning.
     */
    startAt?: number
    /**
     * End offset in seconds for the current reading page — where the next page
     * begins. Reaching it advances the reader instead of reading on into the
     * next page's text. 0 (or absent) means "no boundary": play to the end.
     */
    endAt?: number
    /** True while another page exists after the current one. */
    hasNext?: boolean
    /** Show the Stop button beside Play. A page with two players turns it off and
     *  stops both from its own shared Stop button. */
    showStop?: boolean
  }>(),
  { label: '', text: '', startAt: 0, endAt: 0, hasNext: false, showStop: true }
)

const emit = defineEmits<{
  /** Playback began; the page stops any other language's recording. */
  (event: 'started'): void
  /** The current page finished; the reader should show the next one. */
  (event: 'page-ended'): void
}>()

const copy = useCopy()
const sound = useSound()
const player = shallowRef<HTMLAudioElement | null>(null)
const playing = ref(false)
const paused = ref(false)

const state = computed<'idle' | 'playing' | 'paused'>(() =>
  playing.value ? 'playing' : paused.value ? 'paused' : 'idle'
)

const actionLabel = computed(() =>
  state.value === 'playing'
    ? copy('ui.pause', 'Pause')
    : state.value === 'paused'
      ? copy('ui.resume', 'Resume')
      : props.text
        ? copy('ui.play', 'Play')
        : copy('ui.read', 'Read')
)

function ensurePlayer(): HTMLAudioElement | null {
  if (!props.src) return null
  if (!player.value) {
    const audio = sound.bind(new Audio(props.src))
    audio.ontimeupdate = () => {
      // Stop at the page boundary rather than reading on into the next page's
      // text. `endAt` is the next page's start offset, so the two never
      // overlap; without a boundary (last page) the recording plays out.
      if (!playing.value || props.endAt <= 0) return
      if (audio.currentTime < props.endAt) return
      if (props.hasNext) {
        audio.pause()
        emit('page-ended')
      } else {
        audio.pause()
        playing.value = false
        paused.value = false
      }
    }
    audio.onended = () => {
      playing.value = false
      paused.value = false
    }
    player.value = audio
  }
  return player.value
}

/** Seek to `seconds`, waiting for metadata when the element is still fresh. */
function seek(audio: HTMLAudioElement, seconds: number) {
  if (audio.readyState >= 1) {
    audio.currentTime = seconds
    return
  }
  audio.addEventListener('loadedmetadata', () => {
    audio.currentTime = seconds
  }, { once: true })
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
  if (!paused.value && props.startAt > 0) seek(audio, props.startAt)
  void audio.play().catch(() => {})
  playing.value = true
  paused.value = false
  emit('started')
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

// The reader moved to another page while the voice was running: follow it, so
// the sound matches the text on screen. Paused playback is left alone — the
// user is mid-page and Resume must continue where it stopped.
//
// This also covers the auto-advance path: the boundary handler pauses at the
// page end and asks the reader for the next page, so the new `startAt` arrives
// here and playback resumes from that page's first word.
watch(
  () => props.startAt,
  (next: number, previous: number) => {
    if (!playing.value || next === previous) return
    const audio = player.value
    if (!audio) return
    seek(audio, next)
    if (audio.paused) void audio.play().catch(() => {})
  }
)

onBeforeUnmount(() => {
  player.value?.pause()
  sound.unbind(player.value)
})

defineExpose({ stop, active: computed(() => state.value !== 'idle') })
</script>

<template>
  <div class="flex items-center gap-1.5">
    <button
      type="button"
      class="inline-flex h-8 items-center gap-1.5 rounded-full border border-edge bg-surface px-3 text-xs font-medium text-accent transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
      :disabled="!src"
      :aria-label="text ? `${actionLabel}: ${text}` : actionLabel"
      :title="src ? (label ? `${actionLabel} — ${label}` : actionLabel) : copy('ui.audio_coming_soon', 'Audio coming soon')"
      @click="toggle"
    >
      <PauseIcon v-if="state === 'playing'" class="h-3.5 w-3.5" aria-hidden="true" />
      <PlayIcon v-else class="h-3.5 w-3.5" aria-hidden="true" />
      <span>{{ text || actionLabel }}</span>
    </button>
    <button
      v-if="showStop"
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
