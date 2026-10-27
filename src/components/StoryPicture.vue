<script setup lang="ts">
/**
 * A story's picture, with smart zoom.
 *
 * The picture is shown WHOLE by default (`object-contain`, never cropped). A tap
 * or click zooms in 2.5x around the point touched, so the detail the reader
 * chose comes into view; a second tap zooms back out. While zoomed:
 * - dragging pans, and the picture never pulls away from the frame edges;
 * - the mouse wheel zooms in and out around the pointer;
 * - Enter or Space toggles the zoom at the centre, for keyboard readers.
 */
import { ref } from 'vue'

defineProps<{
  src: string
  alt: string
  zoomInLabel: string
  zoomOutLabel: string
}>()

const MAX_SCALE = 4
const ZOOM_SCALE = 2.5
/** Pointer travel, in px, past which a press counts as a drag rather than a tap. */
const DRAG_SLOP = 6
/** One wheel notch's zoom factor. */
const WHEEL_STEP = 1.15

const frame = ref<HTMLElement | null>(null)
const scale = ref(1)
/** Where the picture's top-left sits inside the frame, in px (transform-origin 0 0). */
const offset = ref({ x: 0, y: 0 })

let press: { id: number; x: number; y: number; originX: number; originY: number; moved: boolean } | null = null

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Keep a picture of scale `s` covering the frame, so no empty strip shows at an edge. */
function bounded(x: number, y: number, s: number) {
  const rect = frame.value?.getBoundingClientRect()
  const width = rect?.width ?? 0
  const height = rect?.height ?? 0
  return { x: clamp(x, width - width * s, 0), y: clamp(y, height - height * s, 0) }
}

/** Zoom to `next`, keeping the frame point (px, py) fixed under the pointer. */
function zoomTo(next: number, px: number, py: number) {
  const target = clamp(next, 1, MAX_SCALE)
  if (target === 1) {
    scale.value = 1
    offset.value = { x: 0, y: 0 }
    return
  }
  const ratio = target / scale.value
  const x = px - (px - offset.value.x) * ratio
  const y = py - (py - offset.value.y) * ratio
  scale.value = target
  offset.value = bounded(x, y, target)
}

/** A client point as a position inside the frame. */
function insideFrame(clientX: number, clientY: number) {
  const rect = frame.value?.getBoundingClientRect()
  return rect ? { x: clientX - rect.left, y: clientY - rect.top } : { x: 0, y: 0 }
}

function toggleAt(x: number, y: number) {
  if (scale.value > 1) zoomTo(1, x, y)
  else zoomTo(ZOOM_SCALE, x, y)
}

function onDown(event: PointerEvent) {
  if (event.button !== 0) return
  press = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    originX: offset.value.x,
    originY: offset.value.y,
    moved: false
  }
  frame.value?.setPointerCapture(event.pointerId)
}

function onMove(event: PointerEvent) {
  if (!press || press.id !== event.pointerId) return
  const dx = event.clientX - press.x
  const dy = event.clientY - press.y
  if (!press.moved && Math.hypot(dx, dy) < DRAG_SLOP) return
  press.moved = true
  if (scale.value > 1) offset.value = bounded(press.originX + dx, press.originY + dy, scale.value)
}

function onUp(event: PointerEvent) {
  if (!press || press.id !== event.pointerId) return
  const tap = !press.moved
  press = null
  if (tap) {
    const point = insideFrame(event.clientX, event.clientY)
    toggleAt(point.x, point.y)
  }
}

function onCancel() {
  press = null
}

function onWheel(event: WheelEvent) {
  const point = insideFrame(event.clientX, event.clientY)
  zoomTo(scale.value * (event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP), point.x, point.y)
}

function onKey() {
  const rect = frame.value?.getBoundingClientRect()
  if (rect) toggleAt(rect.width / 2, rect.height / 2)
}
</script>

<template>
  <div
    ref="frame"
    class="story-picture relative min-h-0 w-full flex-1 touch-none select-none overflow-hidden"
    role="button"
    tabindex="0"
    :aria-label="scale > 1 ? zoomOutLabel : zoomInLabel"
    :aria-pressed="scale > 1"
    :class="scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onCancel"
    @wheel.prevent="onWheel"
    @keydown.enter.prevent="onKey"
    @keydown.space.prevent="onKey"
  >
    <img
      :src="src"
      :alt="alt"
      draggable="false"
      decoding="async"
      class="absolute inset-0 h-full w-full object-contain"
      :style="{
        transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
        transformOrigin: '0 0'
      }"
    />
  </div>
</template>
