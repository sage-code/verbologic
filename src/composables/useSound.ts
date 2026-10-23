/**
 * useSound — one global sound on/off switch for every audio player in the app.
 *
 * The state is module-level (not per-component) so the table header's speaker
 * button silences the row queue, the article read players and the media viewer
 * at once. Players register their <audio> element with `bind()`; the switch
 * then applies `muted` to all of them, including elements created later.
 */
const enabled = ref(true)

/** Every live audio element, so a toggle reaches players already playing. */
const players = new Set<HTMLAudioElement>()

function apply(audio: HTMLAudioElement) {
  audio.muted = !enabled.value
}

/** Register an audio element; it immediately follows the current switch. */
function bind(audio: HTMLAudioElement): HTMLAudioElement {
  players.add(audio)
  apply(audio)
  return audio
}

/** Drop an element that is being torn down (avoids retaining detached nodes). */
function unbind(audio: HTMLAudioElement | null | undefined) {
  if (audio) players.delete(audio)
}

function setEnabled(value: boolean) {
  enabled.value = value
  for (const audio of players) apply(audio)
}

function toggle() {
  setEnabled(!enabled.value)
}

export function useSound() {
  return { enabled, bind, unbind, setEnabled, toggle }
}
