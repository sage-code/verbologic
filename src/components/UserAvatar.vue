// UserAvatar — the account's avatar image (or initials on the accent disc)
// when signed in; the local Anonymous avatar (or the brand-blue mark) when
// signed out. Clicking opens the avatar dialog: enlarged view + select a
// new picture with pan & crop. Signed-in saves sync; signed-out saves are
// allocated to the Anonymous local user. State: useUserStore.
<script setup lang="ts">
import { useUserStore } from '~/stores/userStore'

const store = useUserStore()
const { t } = useLocale()

// Dialog visibility (mounts fresh each open).
const open = ref(false)

// localStorage-first hydration after mount — the prerendered HTML is always
// the logged-out state, so hydration never mismatches.
onMounted(() => store.hydrate())

// Shown as the button's title/aria-label — "User: <Name>" when signed in,
// "User: Anonymous" when not, instead of a generic "Account" label.
const accountLabel = computed(() => {
  const name = store.isLoggedIn ? store.user?.name : null
  return `${t('ui.user_label') ?? 'User'}: ${name || (t('ui.anonymous') ?? 'Anonymous')}`
})

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
    class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition hover:ring-1 hover:ring-accent"
    :aria-label="accountLabel"
    :title="accountLabel"
    @click="open = true"
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
    <!-- Signed out with a local Anonymous avatar -->
    <img
      v-else-if="store.anonymousAvatar"
      :src="store.anonymousAvatar"
      alt=""
      class="h-9 w-9 rounded-full object-cover ring-1 ring-edge"
    >
    <!-- Signed out, no avatar: brand-blue round SVG mark -->
    <svg v-else viewBox="0 0 40 40" class="h-9 w-9 rounded-full" aria-hidden="true">
      <circle cx="20" cy="20" r="20" class="fill-accent" />
      <circle cx="20" cy="15.5" r="6.2" class="fill-white" />
      <path d="M7.6 34.3C10 28.4 14.9 26 20 26s10 2.4 12.4 8.3a20 20 0 0 1-24.8 0z" class="fill-white" />
    </svg>
  </button>

  <!-- Enlarged view + pan/crop editor (AppDialog shell, round ✕ close) -->
  <AvatarCropDialog v-if="open" @close="open = false" />
</template>
