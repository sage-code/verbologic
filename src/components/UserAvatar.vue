// UserAvatar — brand-blue SVG mark when logged out; the user's avatar image
// (or initials on the accent disc) once signed in. State: useUserStore.
<script setup lang="ts">
import { useUserStore } from '~/stores/userStore'

const store = useUserStore()
const { t } = useLocale()

// localStorage-first hydration after mount — the prerendered HTML is always
// the logged-out state, so hydration never mismatches.
onMounted(() => store.hydrate())

const initials = computed(() => {
  const name = store.user?.name ?? ''
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part: string) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  )
})
</script>

<template>
  <button
    type="button"
    class="flex h-11 w-11 shrink-0 items-center justify-center"
    :aria-label="store.isLoggedIn ? (store.user?.name ?? (t('ui.account') ?? 'Account')) : (t('ui.account') ?? 'Account')"
    :title="store.isLoggedIn ? (store.user?.name ?? (t('ui.account') ?? 'Account')) : (t('ui.account') ?? 'Account')"
  >
    <!-- Signed in with a remote avatar image -->
    <img
      v-if="store.isLoggedIn && store.user?.avatarUrl"
      :src="store.user.avatarUrl"
      :alt="store.user.name"
      class="h-9 w-9 rounded-full object-cover ring-1 ring-edge"
      referrerpolicy="no-referrer"
      loading="lazy"
    >
    <!-- Signed in without an image: initials on the accent disc -->
    <span
      v-else-if="store.isLoggedIn"
      class="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-on-accent ring-1 ring-edge"
    >
      {{ initials }}
    </span>
    <!-- Signed out: brand-blue round SVG mark -->
    <svg v-else viewBox="0 0 40 40" class="h-9 w-9 rounded-full" aria-hidden="true">
      <circle cx="20" cy="20" r="20" class="fill-accent" />
      <circle cx="20" cy="15.5" r="6.2" class="fill-white" />
      <path d="M7.6 34.3C10 28.4 14.9 26 20 26s10 2.4 12.4 8.3a20 20 0 0 1-24.8 0z" class="fill-white" />
    </svg>
  </button>
</template>
