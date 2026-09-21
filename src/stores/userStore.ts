/**
 * userStore — user session state (Pinia).
 * localStorage-first for instant paint (and SSG-hydration safety); when
 * Supabase is configured the real auth session is authoritative and
 * reconciled on hydrate() + onAuthStateChange. Phase 5: profiles row sync.
 */
import { defineStore } from 'pinia'
import type { Session } from '@supabase/supabase-js'

export interface UserProfile {
  id?: string
  name: string
  email?: string
  /** Remote avatar URL (OAuth provider / Supabase storage), when present. */
  avatarUrl?: string | null
}

const STORAGE_KEY = 'verbologic-user'

export const useUserStore = defineStore('user', () => {
  // Captured once at store init (first useUserStore() call happens inside a
  // component setup, where the Nuxt context is available).
  const supabase = useSupabase()

  const user = ref<UserProfile | null>(null)

  const isLoggedIn = computed(() => user.value !== null)

  function persist() {
    if (!import.meta.client) return
    if (user.value) localStorage.setItem(STORAGE_KEY, JSON.stringify(user.value))
    else localStorage.removeItem(STORAGE_KEY)
  }

  /** Map a Supabase session onto the local profile shape. */
  function applySession(session: Session | null) {
    if (session?.user) {
      const u = session.user
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>
      user.value = {
        id: u.id,
        name: (meta.full_name as string) || u.email || 'User',
        email: u.email ?? undefined,
        avatarUrl: (meta.avatar_url as string) ?? null
      }
    } else {
      user.value = null
    }
    persist()
  }

  /**
   * Client-side hydration. Called from onMounted so the prerendered HTML
   * (always logged-out) never mismatches during hydration. localStorage
   * gives the instant state; the Supabase session (when configured) then
   * reconciles it asynchronously.
   */
  async function hydrate() {
    if (!import.meta.client) return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      user.value = raw ? (JSON.parse(raw) as UserProfile) : null
    } catch {
      // Corrupt payload — stay logged out.
      user.value = null
    }

    if (!supabase) return
    const { data } = await supabase.auth.getSession()
    applySession(data.session)
    supabase.auth.onAuthStateChange((_event, session) => applySession(session))
  }

  /** Local-only profile write (legacy pre-Supabase path; no UI calls it). */
  function signIn(profile: UserProfile) {
    user.value = profile
    persist()
  }

  /** Supabase email sign-in (magic link) — for the future login UI. */
  async function signInWithEmail(email: string): Promise<boolean> {
    if (!supabase) return false
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) console.warn('[user] sign-in failed', error.message)
    return !error
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut()
    user.value = null
    persist()
  }

  return { user, isLoggedIn, hydrate, signIn, signInWithEmail, signOut }
})
