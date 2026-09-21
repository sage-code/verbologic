// AppHeader — logo left, navigation toolbar center (between logo and the
// controls), theme toggle + language switcher right.
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

      <!-- Toolbar between logo and flags — pill buttons on desktop,
           round icon-only buttons on mobile (see layout.css). -->
      <AppNav class="order-0 min-w-0 flex-1 justify-center px-1 sm:px-2" />

      <div class="flex shrink-0 items-center gap-2">
        <ThemeToggle />
        <UserAvatar />
        <LanguageSwitcher />
      </div>
    </div>
  </header>
</template>
