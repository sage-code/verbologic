// AppHeader — single row at every width: logo left (smaller wordmark on
// mobile), round icon-only nav pills next to it, user avatar right (theme
// and interface language live in the account dialog).
<script setup lang="ts">
import { Bars3Icon, XMarkIcon } from '@heroicons/vue/24/outline'
import earthLogoWhite from '~/assets/img/earth-logo-white.png'
import earthLogoBlack from '~/assets/img/earth-logo-black.png'

const { t } = useLocale()

// Same useState key as the account-dialog theme preference, so the mark
// swaps with the theme:
// white on the dark header surface, black on the light one.
const theme = useState<'light' | 'dark'>('app-theme', () => 'light')
const logoSrc = computed(() => (theme.value === 'dark' ? earthLogoWhite : earthLogoBlack))

// Topic sidebar drawer toggle — a fixture of the header on mobile whenever
// the current page has a roadmap sidebar (RoadmapShell sets `available`).
const { open: sidebarOpen, available: sidebarAvailable } = useMobileSidebar()
const sidebarToggleLabel = computed(() => {
  if (!sidebarAvailable.value) return t('roadmap.no_topics') ?? 'No topics on this page'
  return sidebarOpen.value
    ? (t('roadmap.close_topics') ?? 'Close topics')
    : (t('roadmap.open_topics') ?? 'Open topics')
})
</script>

<template>
  <header class="sticky top-0 z-40 border-b border-edge bg-chrome backdrop-blur">
    <div class="app-container app-header-inner py-1.5">
      <NuxtLink to="/" class="flex shrink-0 items-center gap-2" :aria-label="`Verbologic — ${t('ui.home') ?? 'Home'}`">
        <!-- Monochrome transparent mark — white on dark theme, black on light. -->
        <img
          :src="logoSrc"
          alt=""
          width="64"
          height="64"
          class="h-8 w-8 shrink-0"
          decoding="async"
          fetchpriority="high"
        >
        <span class="text-accent app-header-wordmark">
          <span>Verbo</span><span class="app-header-wordmark-sep" aria-hidden="true">-</span><span>Logic</span>
        </span>
      </NuxtLink>

      <div class="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
        <!-- Round icon-only pills on mobile, icon+label from lg up — grouped
             next to the avatar rather than centered on their own. -->
        <AppNav class="app-header-nav" />
        <UserAvatar />
        <!-- Topic sidebar hamburger — a permanent mobile/tablet fixture;
             disabled (not hidden) on pages with no roadmap sidebar. -->
        <button
          type="button"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-edge text-content transition lg:hidden"
          :class="
            sidebarAvailable
              ? 'hover:border-accent hover:text-accent'
              : 'cursor-not-allowed opacity-40'
          "
          :disabled="!sidebarAvailable"
          :aria-label="sidebarToggleLabel"
          :title="sidebarToggleLabel"
          :aria-expanded="sidebarAvailable ? sidebarOpen : undefined"
          @click="sidebarAvailable && (sidebarOpen = !sidebarOpen)"
        >
          <XMarkIcon v-if="sidebarAvailable && sidebarOpen" class="h-5 w-5" aria-hidden="true" />
          <Bars3Icon v-else class="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  </header>
</template>
