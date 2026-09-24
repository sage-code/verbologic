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

/** A remembered sign-in identity on this computer (see KNOWN_USERS_KEY). */
export interface KnownUser {
  /** Stable account id (auth.users.id) — survives e-mail changes. */
  id?: string
  name: string
  email: string
  avatarUrl?: string | null
  at: string
}

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
  /** E-mail change awaiting the confirmation link (auth.users.new_email). */
  pendingEmail?: string
  /** Phone change awaiting the SMS code (auth.users.new_phone). */
  pendingPhone?: string
}

/** Result of an auth mutation: ok, or a raw message the form maps to i18n. */
export type AuthResult = { ok: true } | { ok: false; error: string }

const STORAGE_KEY = 'verbologic-user'
/**
 * Known users on this computer — every account that ever signed in here
 * (name, e-mail, avatar), kept in localStorage so the /profile page can
 * offer a pick-a-user sign-in. Capped at the most recent 8; purely a local
 * convenience, never synced.
 */
const KNOWN_USERS_KEY = 'verbologic-known-users'
const KNOWN_USERS_MAX = 8
/**
 * Anonymous avatar — a data-URL chosen on this computer while signed out
 * (pan/crop dialog). Allocated to the "Anonymous" local user; replaced by
 * the real account avatar once that user registers / signs in.
 */
const ANON_AVATAR_KEY = 'verbologic-anonymous-avatar'
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
  /** Accounts that signed in on this computer — loaded in hydrate(). */
  const knownUsers = ref<KnownUser[]>([])
  /** Local avatar for the not-signed-in "Anonymous" user (data URL). */
  const anonymousAvatar = ref('')

  /** Set the Anonymous user's avatar (crop dialog save while signed out). */
  function setAnonymousAvatar(dataUrl: string) {
    anonymousAvatar.value = dataUrl
    if (import.meta.client) localStorage.setItem(ANON_AVATAR_KEY, dataUrl)
  }

  const isLoggedIn = computed(() => user.value !== null)
  /** True when credentials are configured — the form shows a notice otherwise. */
  const isAuthConfigured = computed(() => supabase !== null)

  /** Load the remembered identities from localStorage (hydrate()). */
  function loadKnownUsers() {
    if (!import.meta.client) return
    try {
      const raw = localStorage.getItem(KNOWN_USERS_KEY)
      knownUsers.value = raw ? (JSON.parse(raw) as KnownUser[]) : []
    } catch {
      knownUsers.value = []
    }
  }

  /** Remember the signed-in identity on this computer (most-recent first). */
  function recordKnownUser() {
    if (!import.meta.client || !user.value?.email) return
    const entry: KnownUser = {
      id: user.value.id,
      name: user.value.name,
      email: user.value.email,
      avatarUrl: user.value.avatarUrl ?? null,
      at: new Date().toISOString()
    }
    // Dedupe by the invisible account id first, so a changed e-mail replaces
    // the old tile instead of adding a second one.
    const rest = knownUsers.value.filter(
      (k: KnownUser) => !(entry.id && k.id === entry.id) && k.email !== entry.email
    )
    knownUsers.value = [entry, ...rest].slice(0, KNOWN_USERS_MAX)
    localStorage.setItem(KNOWN_USERS_KEY, JSON.stringify(knownUsers.value))
  }

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
      // Confirmed phone first; the signup phone lives only in metadata until
      // it's verified by SMS.
      phone: u.phone || (meta.phone as string) || undefined,
      avatarUrl: (meta.avatar_url as string) ?? null,
      emailVerified: Boolean(u.email_confirmed_at),
      phoneVerified: Boolean(u.phone && u.phone_confirmed_at),
      pendingEmail: u.new_email || undefined,
      pendingPhone: u.new_phone || undefined
    }
  }

  function applySession(session: Session | null) {
    if (session?.user) {
      applyUser(session.user)
      recordKnownUser()
    } else {
      user.value = null
    }
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
    loadKnownUsers()
    anonymousAvatar.value = localStorage.getItem(ANON_AVATAR_KEY) ?? ''
    if (user.value?.email) recordKnownUser()

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
      recordKnownUser()
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

  /** Where e-mail verification links land (/profile/ + a flag the page reads;
   *  trailing slash so the static host doesn't 301 away the query). */
  function profileRedirect(flag: string) {
    return `${window.location.origin}/profile/?${flag}=1`
  }

  /**
   * Re-read the auth user (verified flags, pending e-mail/phone changes)
   * without a full hydrate. Name + avatar come from the profiles row, so
   * they're carried over rather than reset to the auth metadata.
   */
  async function refreshUser(): Promise<void> {
    if (!supabase) return
    const { data } = await supabase.auth.getUser()
    if (!data.user) return
    const keep = { name: user.value?.name, avatarUrl: user.value?.avatarUrl }
    applyUser(data.user)
    if (user.value) {
      if (keep.name) user.value.name = keep.name
      if (keep.avatarUrl !== undefined) user.value.avatarUrl = keep.avatarUrl
    }
    persist()
    recordKnownUser()
  }

  /** Change the e-mail — a confirmation link is sent (to both addresses when
   *  "Secure email change" is on). The account e-mail only switches once the
   *  link is clicked; until then it shows as pendingEmail. */
  async function updateEmail(email: string): Promise<AuthResult> {
    if (!supabase || !user.value?.id) return { ok: false, error: 'not_configured' }
    const { error } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: profileRedirect('email_change') }
    )
    if (error) return { ok: false, error: error.message }
    await refreshUser()
    return { ok: true }
  }

  /** Confirm an e-mail change from the link's token_hash ("Change Email
   *  Address" template → `{{ .RedirectTo }}&token_hash=…&type=email_change`). */
  async function verifyEmailChangeLink(tokenHash: string): Promise<AuthResult> {
    if (!supabase) return { ok: false, error: 'not_configured' }
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email_change' })
    if (error) return { ok: false, error: error.message }
    await refreshUser()
    return { ok: true }
  }

  /** Re-send the e-mail verification: the pending change's link, or the
   *  signup confirmation when the current address was never confirmed. */
  async function resendEmailVerification(): Promise<AuthResult> {
    if (!supabase || !user.value) return { ok: false, error: 'not_configured' }
    const options = { emailRedirectTo: profileRedirect('email_change') }
    const { error } = user.value.pendingEmail
      ? await supabase.auth.resend({ type: 'email_change', email: user.value.pendingEmail, options })
      : await supabase.auth.resend({ type: 'signup', email: user.value.email ?? '', options })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  /** Re-send the SMS code for the pending phone change. */
  async function resendPhoneCode(phone: string): Promise<AuthResult> {
    if (!supabase) return { ok: false, error: 'not_configured' }
    const { error } = await supabase.auth.resend({ type: 'phone_change', phone })
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
    await refreshUser()
    return { ok: true }
  }

  /** Verify the SMS code for the phone change (a failed code leaves the
   *  number pending = unverified). */
  async function verifyPhoneOtp(phone: string, token: string): Promise<AuthResult> {
    if (!supabase) return { ok: false, error: 'not_configured' }
    const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'phone_change' })
    await refreshUser()
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

  /** Create an account with e-mail + password (temporary mode: "Confirm
   *  e-mail" is OFF, so Supabase returns a session immediately). The
   *  optional phone is stored in metadata (verified later via SMS change). */
  async function signUpWithPassword(email: string, password: string, phone?: string): Promise<AuthResult> {
    if (!supabase) return { ok: false, error: 'not_configured' }
    const digits = phone?.replace(/[\s\-()]/g, '')
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: digits ? { data: { phone: digits } } : undefined
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  /** Sign in with e-mail + password (temporary mode). */
  async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
    if (!supabase) return { ok: false, error: 'not_configured' }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  /** Change the account password (requires a recent session). */
  async function updatePassword(password: string): Promise<AuthResult> {
    if (!supabase || !user.value?.id) return { ok: false, error: 'not_configured' }
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return { ok: false, error: error.message }
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

  /** Send the password-recovery e-mail (Supabase recovery link). */
  async function sendPasswordReset(email: string): Promise<AuthResult> {
    if (!supabase) return { ok: false, error: 'not_configured' }
    // Trailing slash matters: the static host 301s /profile → /profile/ and
    // Live Server drops the query string on that redirect (recovery flag +
    // token_hash lost). Pointing straight at /profile/ avoids the redirect.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/profile/?recovery=1`
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  /**
   * Verify a recovery link's token_hash (Reset Password e-mail template
   * links to `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`).
   * Unlike the PKCE `?code=` redirect this works in any browser — the code
   * verifier only exists where "Forgot password?" was clicked — and mail
   * link scanners that merely GET the page can't burn the one-time token.
   */
  async function verifyRecovery(tokenHash: string): Promise<AuthResult> {
    if (!supabase) return { ok: false, error: 'not_configured' }
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
    if (error) return { ok: false, error: error.message }
    applySession(data.session)
    return { ok: true }
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut()
    user.value = null
    persist()
  }

  return {
    user,
    knownUsers,
    anonymousAvatar,
    setAnonymousAvatar,
    isLoggedIn,
    isAuthConfigured,
    hydrate,
    fetchProfile,
    signIn,
    signUpWithPassword,
    signInWithPassword,
    sendPasswordReset,
    verifyRecovery,
    registerWithEmail,
    signInWithEmail,
    verifyEmailOtp,
    updateDisplayName,
    updatePassword,
    updateEmail,
    verifyEmailChange,
    verifyEmailChangeLink,
    resendEmailVerification,
    resendPhoneCode,
    refreshUser,
    updatePhone,
    verifyPhoneOtp,
    uploadAvatar,
    removeAvatar,
    signOut
  }
})
