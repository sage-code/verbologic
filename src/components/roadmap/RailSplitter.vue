// RailSplitter — the draggable bar between the curriculum tree and the page.
//
// It sits INSIDE the page's two-column grid (the grid is `relative` and sizes
// its first column from `--rail-w`), absolutely positioned on the gap between
// the columns, so it takes no grid cell. Drag it, use the arrow keys, or
// double-click to restore the default width. The width is remembered in
// localStorage (useRailWidth). Desktop only: below lg the rail is a drawer.
<script setup lang="ts">
import { RAIL_MAX, RAIL_MIN, useRailWidth } from '~/composables/useRailWidth'

/** Left padding of the grid, when it has some (the article page's `app-container`). */
const props = withDefaults(defineProps<{ inset?: string }>(), { inset: '0px' })

const copy = useCopy()
const { width, set, save, reset, restore } = useRailWidth()

/** The page must keep at least this much room for its own column. */
const MIN_CONTENT = 420
/** Half of the grid's gap-5 (1.25rem): the splitter is centred on the gap. */
const HALF_GAP = '0.625rem'

const el = ref<HTMLElement | null>(null)
const dragging = ref(false)
let startX = 0
let startWidth = 0

/** Widest rail that still leaves the page its minimum column. */
function maxWidth(): number {
  const grid = el.value?.parentElement
  const room = grid ? grid.getBoundingClientRect().width - MIN_CONTENT : RAIL_MAX
  return Math.max(RAIL_MIN, Math.min(RAIL_MAX, room))
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  dragging.value = true
  startX = event.clientX
  startWidth = width.value
  el.value?.setPointerCapture(event.pointerId)
  // Dragging must not select text or flicker the cursor as it crosses panels.
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return
  set(startWidth + (event.clientX - startX), maxWidth())
}

function endDrag(event: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  el.value?.releasePointerCapture(event.pointerId)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
  save()
}

function onKeydown(event: KeyboardEvent) {
  const step = event.shiftKey ? 64 : 16
  if (event.key === 'ArrowLeft') set(width.value - step, maxWidth())
  else if (event.key === 'ArrowRight') set(width.value + step, maxWidth())
  else if (event.key === 'Home') set(RAIL_MIN, maxWidth())
  else if (event.key === 'End') set(RAIL_MAX, maxWidth())
  else return
  event.preventDefault()
  save()
}

onMounted(restore)
onBeforeUnmount(() => {
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
})
</script>

<template>
  <div
    ref="el"
    role="separator"
    aria-orientation="vertical"
    tabindex="0"
    :aria-label="copy('roadmap.resize_curriculum', 'Resize the curriculum')"
    :aria-valuenow="width"
    :aria-valuemin="RAIL_MIN"
    :aria-valuemax="RAIL_MAX"
    :title="copy('roadmap.resize_hint', 'Drag to resize · double-click to reset')"
    class="group absolute inset-y-0 z-10 hidden w-3 -translate-x-1/2 cursor-col-resize touch-none select-none outline-none lg:block"
    :style="{ left: `calc(${props.inset} + ${width}px + ${HALF_GAP})` }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="endDrag"
    @pointercancel="endDrag"
    @keydown="onKeydown"
    @dblclick="reset"
  >
    <!-- The visible line appears on hover, focus and while dragging. -->
    <span
      class="mx-auto block h-full w-0.5 rounded-full transition-colors group-hover:bg-accent group-focus-visible:bg-accent"
      :class="dragging ? 'bg-accent' : 'bg-transparent'"
    />
  </div>
</template>
