// AppHeader — logo left, navigation toolbar center (between logo and the
// controls), theme toggle + language switcher right.
<script setup lang="ts">
</script>

<template>
  <header class="sticky top-0 z-40 border-b border-edge bg-surface backdrop-blur">
    <div class="app-container app-header-inner py-3">
      <NuxtLink to="/" class="flex shrink-0 items-center gap-2" aria-label="Verbologic home">
        <!-- Inline SVG mark (no binary asset). -->
        <svg viewBox="0 0 32 32" class="h-8 w-8 shrink-0" aria-hidden="true">
          <rect x="1" y="1" width="30" height="30" rx="9" fill="#3b6ee0" />
          <path d="M9 11l5 10 3-6 3 6 5-10" stroke="#ffffff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="hidden text-xl font-extrabold tracking-tight text-accent min-[420px]:inline">Verbologic</span>
      </NuxtLink>

      <!-- Toolbar between logo and flags — pill buttons on desktop,
           round icon-only buttons on mobile (see layout.css). -->
      <AppNav class="order-0 min-w-0 flex-1 justify-center px-1 sm:px-2" />

      <div class="flex shrink-0 items-center gap-2">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>
    </div>
  </header>
</template>
