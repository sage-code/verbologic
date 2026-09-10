// ThemeToggle — light/dark selector using the CSS-variable themes.
<script setup lang="ts">
import { MoonIcon, SunIcon } from '@heroicons/vue/24/outline'

type Theme = 'light' | 'dark'
const theme = useState<Theme>('app-theme', () => 'light')

onMounted(() => {
  const stored = localStorage.getItem('verbologic-theme')
  if (stored === 'dark' || stored === 'light') theme.value = stored
  document.documentElement.dataset.theme = theme.value
})

function toggle() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
  document.documentElement.dataset.theme = theme.value
  localStorage.setItem('verbologic-theme', theme.value)
}
</script>

<template>
  <button
    type="button"
    class="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface text-muted transition hover:text-accent"
    :aria-label="theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'"
    :title="theme === 'light' ? 'Dark mode' : 'Light mode'"
    @click="toggle"
  >
    <MoonIcon v-if="theme === 'light'" class="h-5 w-5" aria-hidden="true" />
    <SunIcon v-else class="h-5 w-5" aria-hidden="true" />
  </button>
</template>
