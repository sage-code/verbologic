// AppNav — toolbar of pill buttons (round icon-only buttons on mobile).
<script setup lang="ts">
import type { Component } from 'vue'
import {
  AcademicCapIcon,
  BanknotesIcon,
  BuildingLibraryIcon
} from '@heroicons/vue/24/outline'

const { menu, menuLabel } = useNavigation()
const { t } = useLocale()
const route = useRoute()

const ICONS: Record<string, Component> = {
  'academic-cap': AcademicCapIcon,
  banknotes: BanknotesIcon,
  'building-library': BuildingLibraryIcon
}

function isActive(target: string): boolean {
  return target === '/' ? route.path === '/' : route.path.startsWith(target)
}
</script>

<template>
  <nav class="flex flex-wrap items-center gap-2" :aria-label="t('ui.main_navigation') ?? 'Main navigation'">
    <NuxtLink
      v-for="item in menu"
      :key="item.id"
      :to="item.route"
      class="nav-pill text-sm font-medium transition"
      :class="
        isActive(item.route)
          ? 'bg-accent text-on-accent shadow-sm'
          : 'bg-soft text-muted hover:bg-surface hover:text-accent'
      "
      :title="menuLabel(item.id)"
      :aria-current="isActive(item.route) ? 'page' : undefined"
    >
      <component :is="ICONS[item.icon]" class="h-5 w-5 shrink-0" aria-hidden="true" />
      <span class="nav-item-label">{{ menuLabel(item.id) }}</span>
    </NuxtLink>
  </nav>
</template>
