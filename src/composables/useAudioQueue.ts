/**
 * useAudioQueue — sequential playback for the "play filtered" button.
 * One shared Audio element plays rows one by one; after each ends it waits
 * gapMs (the memorization pause) before the next. Rows without a URL are
 * skipped. Stop clears everything; unmount cleans up.
 *
 * Modes (mode ref, exposed so templates can style per-run state):
 * - 'single' — one file only (a row play button); with Repeat on it replays
 *              after the gap, over and over, until stopped or Repeat is off.
 * - 'page'   — a run of rows (play page); stops at the end, or wraps to the
 *              start while loop is on (firing the onCycle callback once per lap).
 * - 'idle'   — nothing running.
 */
export interface QueueItem {
  id: string
  url: string | null
}

export type QueueMode = 'idle' | 'single' | 'page'

export interface QueueOptions {
  /** Pause between items, ms (the memorization gap). Default 1200. */
  gapMs?: number
  /** Start at (or after) this item id instead of the first. */
  startId?: string
  /** Wrap to the first item when the queue ends (loop one page). */
  loop?: boolean
  /** Queue run kind — drives the toolbar/row styling. Default 'page'. */
  mode?: QueueMode
  /** Called once per loop lap (before the first item of the next lap plays). */
  onCycle?: () => void
  /** Fired when an item finishes playing (each Repeat lap counts too). */
  onItemEnded?: (item: QueueItem) => void
}

export function useAudioQueue() {
  const currentId = ref<string | null>(null)
  const isPlaying = ref(false)
  const paused = ref(false)
  const loop = ref(false)
  const mode = ref<QueueMode>('idle')

  let player: HTMLAudioElement | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let queue: QueueItem[] = []
  let cursor = 0
  let gapMs = 1200
  let onCycle: (() => void) | null = null
  let onItemEnded: ((item: QueueItem) => void) | null = null

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function stop() {
    clearTimer()
    player?.pause()
    queue = []
    cursor = 0
    currentId.value = null
    isPlaying.value = false
    paused.value = false
    mode.value = 'idle'
  }

  /** Hold the current item in place — the queue stays loaded, the cursor
   *  doesn't move. Resume picks up the same file where it left off. */
  function pause() {
    if (mode.value === 'idle' || paused.value) return
    clearTimer()
    player?.pause()
    paused.value = true
  }

  /** Resume a paused run from its held position (no restart, no re-queue). */
  function resume() {
    if (!paused.value) return
    paused.value = false
    void player?.play().catch(() => {})
  }

  /** Arm/disarm looping. Takes effect when the current run reaches its end. */
  function setLoop(value: boolean) {
    loop.value = value
  }

  function playNext() {
    while (cursor < queue.length && !queue[cursor].url) cursor++
    if (cursor >= queue.length) {
      if (loop.value && queue.length > 0) {
        cursor = 0
        onCycle?.()
        playNext()
        return
      }
      stop()
      return
    }
    const item = queue[cursor]
    currentId.value = item.id
    if (!player) player = new Audio()
    player.src = item.url ?? ''
    void player.play().catch(() => {}) // rapid src switches can reject — ignore
    cursor++
    player.onended = () => {
      clearTimer()
      onItemEnded?.(item) // one full listen — each Repeat lap counts too
      // A single file ends right away unless Repeat is on — then it replays
      // after the gap, over and over, until stopped or Repeat is turned off.
      if (mode.value === 'single') {
        if (loop.value) {
          cursor = 0
          timer = setTimeout(playNext, gapMs)
          return
        }
        stop()
        return
      }
      timer = setTimeout(playNext, gapMs)
    }
  }

  function play(items: QueueItem[], options: QueueOptions = {}) {
    stop()
    if (options.gapMs !== undefined) gapMs = options.gapMs
    // loop persists across runs unless the caller states it explicitly.
    loop.value = options.loop ?? loop.value
    mode.value = options.mode ?? 'page'
    onCycle = options.onCycle ?? null
    // The listen hook persists across runs — every playback counts.
    onItemEnded = options.onItemEnded ?? onItemEnded
    queue = [...items]
    const at = options.startId ? items.findIndex((i) => i.id === options.startId) : -1
    cursor = at > 0 ? at : 0
    isPlaying.value = queue.length > 0
    playNext()
  }

  /**
   * Play exactly one file (row play button). With Repeat on (a persistent
   * on/off flag the user can flip before or after pressing play — it stays
   * set across Stop) the file replays after the gap until stopped.
   */
  function playOne(item: QueueItem, options?: QueueOptions) {
    play([item], { mode: 'single', ...options })
  }

  /** Clicking the play-all button again stops the sequence. */
  function toggle(items: QueueItem[], options?: QueueOptions) {
    if (isPlaying.value) stop()
    else play(items, options)
  }

  onBeforeUnmount(stop)

  return { currentId, isPlaying, paused, loop, mode, play, playOne, stop, pause, resume, setLoop, toggle }
}
