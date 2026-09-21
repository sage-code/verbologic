/**
 * userStore — localStorage-first user session state (Pinia).
 * Phase 5 will sync this against the Supabase session (auth.users + profiles);
 * until then signIn/signOut write straight to localStorage.
 */
import { defineStore } from 'pinia'

export interface UserProfile {
  id?: string
  name: string
  email?: string
  /** Remote avatar URL (OAuth provider / Supabase storage), when present. */
  avatarUrl?: string | null
}

const STORAGE_KEY = 'verbologic-user'

export const useUserStore = defineStore('user', () => {
  const user = ref<UserProfile | null>(null)

  const isLoggedIn = computed(() => user.value !== null)

  /**
   * Client-side hydration from localStorage. Called from onMounted so the
   * prerendered HTML (always logged-out) never mismatches during hydration.
   */
  function hydrate() {
    if (!import.meta.client) return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      user.value = raw ? (JSON.parse(raw) as UserProfile) : null
    } catch {
      // Corrupt payload — stay logged out.
      user.value = null
    }
  }

  function signIn(profile: UserProfile) {
    user.value = profile
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  }

  function signOut() {
    user.value = null
    if (import.meta.client) localStorage.removeItem(STORAGE_KEY)
  }

  return { user, isLoggedIn, hydrate, signIn, signOut }
})
