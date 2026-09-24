// AvatarCropDialog — click-to-open avatar editor: shows the current profile
// image enlarged (account avatar when signed in, the local Anonymous avatar
// when signed out), lets the user pick a new picture and pan/zoom it inside
// a circular crop, then saves. Signed in → userStore.uploadAvatar (synced);
// signed out → the cropped image is allocated to the Anonymous local user.
<script setup lang="ts">
import { ArrowsPointingOutIcon } from '@heroicons/vue/24/outline'

const copy = useCopy()
const store = useUserStore()
const emit = defineEmits<{ close: [] }>()

// ── Current avatar (enlarged view) ──────────────────────────────────────────
const current = computed(() =>
  store.isLoggedIn ? (store.user?.avatarUrl ?? '') : store.anonymousAvatar
)

// ── Crop state ──────────────────────────────────────────────────────────────
// The chosen image is dragged (pointer pan) and zoomed (slider) inside a
// square viewport with a circular mask; Save renders the same transform
// onto a 512×512 canvas.
const VIEW = 288
const editing = ref(false)
const imgSrc = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const imgEl = ref<HTMLImageElement | null>(null)
const natural = ref({ w: 0, h: 0 })
const zoom = ref(1)
const offset = ref({ x: 0, y: 0 })
const drag = ref<{ px: number; py: number; ox: number; oy: number } | null>(null)
const busy = ref(false)
const error = ref('')

/** Scale at zoom=1 so the image fully covers the circular viewport. */
const coverScale = computed(() =>
  natural.value.w > 0 ? VIEW / Math.min(natural.value.w, natural.value.h) : 1
)
const totalScale = computed(() => coverScale.value * zoom.value)

function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow re-selecting the same file
  if (!file) return
  if (imgSrc.value) URL.revokeObjectURL(imgSrc.value)
  imgSrc.value = URL.createObjectURL(file)
  zoom.value = 1
  offset.value = { x: 0, y: 0 }
  error.value = ''
  editing.value = true
}

function onImgLoad() {
  natural.value = { w: imgEl.value?.naturalWidth ?? 0, h: imgEl.value?.naturalHeight ?? 0 }
}

// Pointer pan (works for touch + mouse; the viewport captures the pointer).
function onPointerDown(e: PointerEvent) {
  drag.value = { px: e.clientX, py: e.clientY, ox: offset.value.x, oy: offset.value.y }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function onPointerMove(e: PointerEvent) {
  if (!drag.value) return
  offset.value = {
    x: drag.value.ox + (e.clientX - drag.value.px),
    y: drag.value.oy + (e.clientY - drag.value.py)
  }
}
function onPointerUp() {
  drag.value = null
}

/** Render the circular crop onto a 512×512 JPEG canvas. */
function renderCrop(): string {
  const img = imgEl.value
  if (!img || natural.value.w === 0) return ''
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const half = VIEW / 2
  const up = 512 / VIEW
  ctx.save()
  // Map viewport pixels (288px circle) onto the 512px canvas, then place the
  // image with the exact pan/zoom the user sees.
  ctx.scale(up, up)
  ctx.translate(half + offset.value.x, half + offset.value.y)
  ctx.scale(totalScale.value, totalScale.value)
  ctx.drawImage(img, -natural.value.w / 2, -natural.value.h / 2)
  ctx.restore()
  return canvas.toDataURL('image/jpeg', 0.9)
}

async function save() {
  if (busy.value) return
  const dataUrl = renderCrop()
  if (!dataUrl) return
  busy.value = true

  if (store.isLoggedIn) {
    // Registered: sync through the normal upload path (storage + profile).
    const blob = await (await fetch(dataUrl)).blob()
    const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
    const res = await store.uploadAvatar(file)
    busy.value = false
    if (!res.ok) {
      error.value = copy('account.error_generic', 'Something went wrong — try again.')
      return
    }
  } else {
    // Not registered: allocate the cropped image to the Anonymous user.
    store.setAnonymousAvatar(dataUrl)
    busy.value = false
  }
  cancelEdit()
}

function cancelEdit() {
  editing.value = false
  if (imgSrc.value) URL.revokeObjectURL(imgSrc.value)
  imgSrc.value = ''
}

onBeforeUnmount(() => {
  if (imgSrc.value) URL.revokeObjectURL(imgSrc.value)
})
</script>

<template>
  <AppDialog
    :title="copy('account.avatar_label', 'Profile picture')"
    :close-label="copy('account.close', 'Close')"
    @close="emit('close')"
  >
    <div class="space-y-4">
      <!-- Enlarged current avatar -->
      <div v-if="!editing" class="flex flex-col items-center gap-4">
        <img
          v-if="current"
          :src="current"
          :alt="store.user?.name ?? 'Anonymous'"
          class="h-40 w-40 rounded-full object-cover ring-1 ring-edge"
          referrerpolicy="no-referrer"
        >
        <span
          v-else-if="store.isLoggedIn"
          class="flex h-40 w-40 items-center justify-center rounded-full bg-accent text-3xl font-semibold text-on-accent"
        >
          {{ store.user?.name.slice(0, 2).toUpperCase() }}
        </span>
        <svg v-else viewBox="0 0 40 40" class="h-40 w-40 rounded-full" aria-hidden="true">
          <circle cx="20" cy="20" r="20" class="fill-accent" />
          <circle cx="20" cy="15.5" r="6.2" class="fill-white" />
          <path d="M7.6 34.3C10 28.4 14.9 26 20 26s10 2.4 12.4 8.3a20 20 0 0 1-24.8 0z" class="fill-white" />
        </svg>
        <button
          type="button"
          class="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-on-accent transition hover:bg-accent-strong"
          @click="fileInput?.click()"
        >
          {{ copy('account.avatar_change', 'Upload new picture') }}
        </button>
        <p class="text-xs text-faint">{{ copy('account.avatar_hint', 'PNG, JPG or WebP · max 2 MB') }}</p>
      </div>

      <!-- Pan + crop editor -->
      <div v-else class="space-y-4">
        <div
          class="relative mx-auto cursor-grab touch-none overflow-hidden rounded-full bg-soft active:cursor-grabbing"
          :style="{ width: `${VIEW}px`, height: `${VIEW}px` }"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <img
            ref="imgEl"
            :src="imgSrc"
            alt=""
            class="pointer-events-none absolute select-none"
            :style="{
              left: '50%',
              top: '50%',
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${totalScale})`
            }"
            @load="onImgLoad"
          >
          <!-- Circular crop mask + center hint -->
          <div class="pointer-events-none absolute inset-0 rounded-full ring-8 ring-inset ring-black/40" />
          <ArrowsPointingOutIcon class="pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-white/50" aria-hidden="true" />
        </div>

        <!-- Zoom slider -->
        <div class="flex items-center gap-3">
          <span class="text-xs text-muted">{{ copy('account.avatar_zoom', 'Zoom') }}</span>
          <input
            v-model.number="zoom"
            type="range"
            min="1"
            max="3"
            step="0.01"
            class="flex-1 accent-accent"
            :aria-label="copy('account.avatar_zoom', 'Zoom')"
          >
        </div>

        <div class="flex gap-3">
          <button
            type="button"
            class="flex-1 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-accent-strong disabled:opacity-40"
            :disabled="busy || natural.w === 0"
            @click="save"
          >
            {{ copy('account.save', 'Save') }}
          </button>
          <button
            type="button"
            class="flex-1 rounded-full border border-edge px-4 py-2.5 text-sm font-medium text-content transition hover:border-accent hover:text-accent"
            @click="cancelEdit"
          >
            {{ copy('account.cancel', 'Cancel') }}
          </button>
        </div>
      </div>

      <p v-if="error" class="rounded-xl bg-soft px-4 py-2 text-sm text-content" role="alert">{{ error }}</p>
      <input
        ref="fileInput"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        class="hidden"
        @change="onPick"
      >
    </div>
  </AppDialog>
</template>
