// AppHeader — single row at every width: logo left (smaller wordmark on
// mobile), round icon-only nav pills next to it, user avatar right (theme
// and interface language live in the account dialog).
<script setup lang="ts">
import earthLogoWhite from '~/assets/img/earth-logo-white.png'
import earthLogoBlack from '~/assets/img/earth-logo-black.png'

const { t } = useLocale()

// Same useState key as the account-dialog theme preference, so the mark
// swaps with the theme:
// white on the dark header surface, black on the light one.
const theme = useState<'light' | 'dark'>('app-theme', () => 'light')
const logoSrc = computed(() => (theme.value === 'dark' ? earthLogoWhite : earthLogoBlack))
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
        <span class="text-accent app-header-wordmark">Verbologic</span>
      </NuxtLink>

      <!-- Round icon-only pills on mobile, icon+label from md up — always
           inline on the single header row, after the wordmark. -->
      <AppNav class="app-header-nav" />

      <div class="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <UserAvatar />
      </div>
    </div>
  </header>
</template>
