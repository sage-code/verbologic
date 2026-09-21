// AppDialog — accessible modal shell: teleported backdrop + centered panel,
// title left, round close (✕) button top-right next to the title, Escape /
// backdrop close, body scroll lock, and a light Tab focus trap.
<script setup lang="ts">
import { XMarkIcon } from '@heroicons/vue/20/solid'

const props = defineProps<{
  /** Dialog title (also the accessible name via aria-labelledby). */
  title: string
  /** Accessible name for the close button. */
  closeLabel?: string
}>()

const emit = defineEmits<{ close: [] }>()

const panel = ref<HTMLElement | null>(null)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
    return
  }
  // Light focus trap: Tab wraps at the panel's focusable edges.
  if (e.key === 'Tab' && panel.value) {
    const focusables = panel.value.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    if (focusables.length === 0) return
    const first = focusables[0] as HTMLElement
    const last = focusables[focusables.length - 1] as HTMLElement
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  document.body.style.overflow = 'hidden'
  // Focus the first field when present, else the close button.
  panel.value?.querySelector<HTMLElement>('input, select, textarea')?.focus() ??
    panel.value?.querySelector<HTMLElement>('button')?.focus()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="emit('close')"
    >
      <div
        ref="panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        class="w-full max-w-md rounded-2xl border border-edge bg-surface p-6 shadow-lg"
      >
        <div class="mb-4 flex items-center justify-between gap-4">
          <h2 id="app-dialog-title" class="text-xl font-bold text-content">{{ title }}</h2>
          <button
            type="button"
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-edge text-muted transition hover:border-accent hover:text-accent"
            :aria-label="props.closeLabel ?? 'Close'"
            :title="props.closeLabel ?? 'Close'"
            @click="emit('close')"
          >
            <XMarkIcon class="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <slot />

        <div v-if="$slots.footer" class="mt-6 flex gap-3 border-t border-edge pt-4">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
