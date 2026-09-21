// AppHeader — row 1: logo left, controls (theme toggle, avatar, language
// switcher) right. Below md the toolbar (AppNav) wraps onto its own
// full-width second row instead of being squeezed between them.
<script setup lang="ts">
import earthLogoWhite from '~/assets/img/earth-logo-white.png'
import earthLogoBlack from '~/assets/img/earth-logo-black.png'

const { t } = useLocale()

// Same useState key as <ThemeToggle />, so the mark swaps with the theme:
// white on the dark header surface, black on the light one.
const theme = useState<'light' | 'dark'>('app-theme', () => 'light')
const logoSrc = computed(() => (theme.value === 'dark' ? earthLogoWhite : earthLogoBlack))
</script>

<template>
  <header class="sticky top-0 z-40 border-b border-edge bg-surface backdrop-blur">
    <div class="app-container app-header-inner py-3">
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
        <span class="hidden text-xl font-extrabold tracking-tight text-accent min-[420px]:inline">Verbologic</span>
      </NuxtLink>

      <!-- Row 1 — brand left, controls right (ml-auto keeps them apart at
           every width; space-between on the container does the rest). -->
      <div class="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <ThemeToggle />
        <UserAvatar />
        <LanguageSwitcher />
      </div>

      <!-- Row 2 on <md: the toolbar gets a dedicated full-width row below the
           brand/controls row. ≥md: back to the centered middle column of the
           single-row header (intrinsic pill widths, labels visible). -->
      <AppNav
        class="order-last w-full md:order-none md:w-auto md:min-w-0 md:flex-1 md:justify-center md:px-2"
      />
    </div>
  </header>
</template>
