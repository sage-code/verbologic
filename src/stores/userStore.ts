/**
 * userStore — user session state (Pinia).
 * localStorage-first for instant paint (and SSG-hydration safety); when
 * Supabase is configured the real auth session is authoritative and
 * reconciled on hydrate() + onAuthStateChange.
 *
 * Auth model (Phase 1 — /account form): passwordless. Registration and
 * sign-in go through e-mail OTP / magic link; the phone number is verified
 * by SMS OTP; e-mail/phone CHANGES are verified with their own OTP types.
 * E-mail/phone + verified flags are read from the session (auth.users is
 * the source of truth — no mirrored columns that can drift). The display
 * name and avatar live in public.profiles.
 */
import { defineStore } from 'pinia'
import type { Session, User } from '@supabase/supabase-js'

export interface UserProfile {
  id?: string
  /** Display name: profiles.display_name → auth metadata → e-mail → 'User'. */
  name: string
  email?: string
  phone?: string
  /** Remote avatar URL (Supabase storage), when present. */
  avatarUrl?: string | null
  /** Cached from the session — authoritative only right after applySession. */
  emailVerified?: boolean
  phoneVerified?: boolean
}

/** Result of an auth mutation: ok, or a raw message the form maps to i18n. */
export type AuthResult = { ok: true } | { ok: false; error: string }

const STORAGE_KEY = 'verbologic-user'
const AVATAR_MAX_BYTES = 2 * 1024 * 1024
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp']

// Register the session listener exactly once per page load — hydrate() runs
// on every page mount and Supabase would otherwise stack duplicate listeners.
let authListenerWired = false

export const useUserStore = defineStore('user', () => {
  // Captured once at store init (first useUserStore() call happens inside a
  // component setup, where the Nuxt context is available).
  const supabase = useSupabase()

  const user = ref<UserProfile | null>(null)

  const isLoggedIn = computed(() => user.value !== null)
  /** True when credentials are configured — the form shows a notice otherwise. */
  const isAuthConfigured = computed(() => supabase !== null)

  function persist() {
    if (!import.meta.client) return
    if (user.value) localStorage.setItem(STORAGE_KEY, JSON.stringify(user.value))
    else localStorage.removeItem(STORAGE_KEY)
  }

  /** Map a Supabase user onto the local profile shape. */
  function applyUser(u: User) {
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>
    user.value = {
      id: u.id,
      name: (meta.full_name as string) || u.email || 'User',
      email: u.email ?? undefined,
      phone: u.phone || undefined,
      avatarUrl: (meta.avatar_url as string) ?? null,
      emailVerified: Boolean(u.email_confirmed_at),
      phoneVerified: Boolean(u.phone_confirmed_at)
    }
  }

  function applySession(session: Session | null) {
    if (session?.user) applyUser(session.user)
    else user.value = null
    persist()
  }

  /**
   * Client-side hydration. Called from onMounted so the prerendered HTML
   * (always logged-out) never mismatches during hydration. localStorage
   * gives the instant state; the Supabase session (when configured) then
   * reconciles it asynchronously, and the profile row adds name/avatar.
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
    if (data.session) await fetchProfile()
    if (!authListenerWired) {
      supabase.auth.onAuthStateChange((_event, session) => applySession(session))
      authListenerWired = true
    }
  }

  /** Read the profiles row — display_name / avatar_url (session stays authoritative). */
  async function fetchProfile() {
    if (!supabase || !user.value?.id) return
    const { data } = await supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', user.value.id)
      .maybeSingle()
    if (data && user.value) {
      user.value = {
        ...user.value,
        name: data.display_name || user.value.name,
        avatarUrl: data.avatar_url ?? user.value.avatarUrl
      }
      persist()
    }
  }

  /** Local-only profile write (legacy pre-Supabase path; no UI calls it). */
  function signIn(profile: UserProfile) {
    user.value = profile
    persist()
  }

  function emailRedirect() {
    return `${window.location.origin}/account?verified=1`
  }

  /** Create a new account (passwordless): e-mail receives a link + OTP code. */
  async function registerWithEmail(email: string): Promise<AuthResult> {
    if (!supabase) return { ok: false, error: 'not_configured' }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: emailRedirect() }
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  /** Sign in to an existing account (passwordless): magic link + OTP code. */
  async function signInWithEmail(email: string): Promise<AuthResult> {
    if (!supabase) return { ok: false, error: 'not_configured' }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: emailRedirect() }
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  /** Verify the 6-digit e-mail code (account creation / sign-in). */
  async function verifyEmailOtp(email: string, token: string): Promise<AuthResult> {
    if (!supabase) return { ok: false, error: 'not_configured' }
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  /** Update the display name in auth metadata + the profiles row. */
  async function updateDisplayName(name: string): Promise<AuthResult> {
    if (!supabase || !user.value?.id) return { ok: false, error: 'not_configured' }
    const { error } = await supabase.auth.updateUser({ data: { full_name: name } })
    if (error) return { ok: false, error: error.message }
    const { error: dbError } = await supabase
      .from('profiles')
      .update({ display_name: name })
      .eq('id', user.value.id)
    if (dbError) return { ok: false, error: dbError.message }
    user.value = { ...user.value, name }
    persist()
    return { ok: true }
  }

  /** Change the e-mail — both addresses receive a confirmation (link + code). */
  async function updateEmail(email: string): Promise<AuthResult> {
    if (!supabase || !user.value?.id) return { ok: false, error: 'not_configured' }
    const { error } = await supabase.auth.updateUser({ email })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  /** Verify the e-mail change with the code sent to the NEW address. */
  async function verifyEmailChange(email: string, token: string): Promise<AuthResult> {
    if (!supabase) return { ok: false, error: 'not_configured' }
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email_change' })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  /** Change/add the phone number — an SMS code is sent for verification. */
  async function updatePhone(phone: string): Promise<AuthResult> {
    if (!supabase || !user.value?.id) return { ok: false, error: 'not_configured' }
    const { error } = await supabase.auth.updateUser({ phone })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  /** Verify the SMS code for the phone change. */
  async function verifyPhoneOtp(phone: string, token: string): Promise<AuthResult> {
    if (!supabase) return { ok: false, error: 'not_configured' }
    const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'phone_change' })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  /**
   * Downscale the avatar client-side (longest side ≤ 512px, JPEG 0.9) so the
   * upload respects the 2 MB bucket limit without a server round-trip.
   */
  async function downscaleAvatar(file: File): Promise<Blob> {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('decode failed'))
        img.src = url
      })
      const max = 512
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9)
      )
      return blob ?? file
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  /** Validate + upload the avatar; stores the public URL on profile + metadata. */
  async function uploadAvatar(file: File): Promise<AuthResult> {
    if (!supabase || !user.value?.id) return { ok: false, error: 'not_configured' }
    if (!AVATAR_TYPES.includes(file.type)) return { ok: false, error: 'avatar_type' }
    if (file.size > AVATAR_MAX_BYTES) return { ok: false, error: 'avatar_size' }

    const blob = await downscaleAvatar(file)
    const path = `${user.value.id}/avatar.jpg`
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
    if (error) return { ok: false, error: error.message }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    // Cache-bust: re-uploads reuse the path, so the header <img> needs a new URL.
    const url = `${data.publicUrl}?v=${Date.now()}`

    const { error: dbError } = await supabase
      .from('profiles')
      .update({ avatar_url: url })
      .eq('id', user.value.id)
    if (dbError) return { ok: false, error: dbError.message }

    // Mirror into auth metadata so applySession() keeps the header in sync.
    const { error: metaError } = await supabase.auth.updateUser({ data: { avatar_url: url } })
    if (metaError) return { ok: false, error: metaError.message }

    user.value = { ...user.value, avatarUrl: url }
    persist()
    return { ok: true }
  }

  /** Remove the avatar: delete the storage object + clear profile/metadata. */
  async function removeAvatar(): Promise<AuthResult> {
    if (!supabase || !user.value?.id) return { ok: false, error: 'not_configured' }
    const { error } = await supabase.storage
      .from('avatars')
      .remove([`${user.value.id}/avatar.jpg`])
    if (error) return { ok: false, error: error.message }

    const { error: dbError } = await supabase
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', user.value.id)
    if (dbError) return { ok: false, error: dbError.message }

    const { error: metaError } = await supabase.auth.updateUser({ data: { avatar_url: null } })
    if (metaError) return { ok: false, error: metaError.message }

    user.value = { ...user.value, avatarUrl: null }
    persist()
    return { ok: true }
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut()
    user.value = null
    persist()
  }

  return {
    user,
    isLoggedIn,
    isAuthConfigured,
    hydrate,
    fetchProfile,
    signIn,
    registerWithEmail,
    signInWithEmail,
    verifyEmailOtp,
    updateDisplayName,
    updateEmail,
    verifyEmailChange,
    updatePhone,
    verifyPhoneOtp,
    uploadAvatar,
    removeAvatar,
    signOut
  }
})
