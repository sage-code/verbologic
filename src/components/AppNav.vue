// AppNav — toolbar of pill buttons (round icon-only buttons on mobile).
//
// Library and Profile are account-backed, so they are disabled (not hidden)
// while the database is offline: the pill stays in place so the layout does not
// jump, but it cannot be clicked and its tooltip explains why. Practice and
// Method run on bundled data and stay available.
<script setup lang="ts">
import type { Component } from 'vue'
import {
  AcademicCapIcon,
  BuildingLibraryIcon,
  SparklesIcon,
  UserIcon
} from '@heroicons/vue/24/outline'

const { menu, menuLabel } = useNavigation()
const { t } = useLocale()
const route = useRoute()
const { isOffline } = useDbStatus()

const ICONS: Record<string, Component> = {
  'academic-cap': AcademicCapIcon,
  'building-library': BuildingLibraryIcon,
  sparkles: SparklesIcon,
  user: UserIcon
}

/** Routes that need the database — disabled while it is unreachable. */
const DB_ROUTES = new Set(['/library', '/profile'])

function isDisabled(target: string): boolean {
  return isOffline.value && DB_ROUTES.has(target)
}

function isActive(target: string): boolean {
  return target === '/' ? route.path === '/' : route.path.startsWith(target)
}
</script>

<template>
  <nav class="flex items-center gap-2" :aria-label="t('ui.main_navigation') ?? 'Main navigation'">
    <template v-for="item in menu" :key="item.id">
      <!-- Disabled while offline: a span, not a link, so it cannot be followed -->
      <span
        v-if="isDisabled(item.route)"
        class="nav-pill cursor-not-allowed text-sm font-medium opacity-40 shadow-sm"
        :title="t('status.db_offline') ?? 'Database offline for maintenance'"
        :aria-disabled="true"
      >
        <component :is="ICONS[item.icon]" class="h-5 w-5 shrink-0" aria-hidden="true" />
        <span class="nav-item-label">{{ menuLabel(item.id) }}</span>
      </span>
      <NuxtLink
        v-else
        :to="item.route"
        class="nav-pill text-sm font-medium transition"
        :class="
          isActive(item.route)
            ? 'bg-accent text-on-accent shadow-sm'
            : 'bg-surface text-muted shadow-sm hover:text-accent'
        "
        :title="menuLabel(item.id)"
        :aria-current="isActive(item.route) ? 'page' : undefined"
      >
        <component :is="ICONS[item.icon]" class="h-5 w-5 shrink-0" aria-hidden="true" />
        <span class="nav-item-label">{{ menuLabel(item.id) }}</span>
      </NuxtLink>
    </template>
  </nav>
</template>
