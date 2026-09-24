// Profile — the account hub. Same top on both states: title row (Log-out
// right-aligned when signed in), then the shared preferences bar (theme +
// interface language). Signed out: a picker of every account that ever
// signed in on this computer (userStore.knownUsers, localStorage) — pick
// one and type e-mail + password, or press New user to register (e-mail,
// phone, password). Signed in below the bar: avatar, display name, phone
// (SMS-verified), password change. Credits and per-language progress live
// in the Library (its panels + the AddCreditsDialog top-up).
// Data: userStore (localStorage-first; Supabase reconciles).
<script setup lang="ts">
import { ArrowRightStartOnRectangleIcon, MoonIcon, SunIcon } from '@heroicons/vue/24/outline'
import { ChevronDownIcon, EyeIcon, EyeSlashIcon, PencilIcon, PlusIcon, XMarkIcon } from '@heroicons/vue/20/solid'
import type { KnownUser, UserProfile } from '~/stores/userStore'
import type { LocaleCode } from '~/composables/useLocale'

const copy = useCopy()
const { lang, setLocale, isLoaded } = useLocale()
const { languageName, languages } = useNavigation()
const store = useUserStore()

// ── Local state ─────────────────────────────────────────────────────────────
// Identity / Security fields are read-only until their pen button is pressed.
// While not editing, the watch below keeps each input in sync with the store.
const nameInput = ref('')
const emailInput = ref('')
const phoneInput = ref('')
const codeInput = ref('')
const editName = ref(false)
const editEmail = ref(false)
const editPhone = ref(false)
const editPassword = ref(false)
/** True while an SMS code is awaited (code field visible). */
const phonePending = ref(false)
/** The number the awaited SMS code was sent to. */
const phoneTarget = ref('')
const newPassword = ref('')
const showPassword = ref(false)
const busy = ref(false)
const status = ref<{ kind: 'info' | 'error' | 'success'; text: string } | null>(null)
const avatarPreview = ref('')
// Avatar editing happens in the shared pan/crop dialog (see header avatar).
const avatarDialog = ref(false)

// ── Theme preference (same state/persistence as the account dialog) ────────
const theme = useState<'light' | 'dark'>('app-theme', () => 'light')
function setTheme(next: 'light' | 'dark') {
  theme.value = next
  document.documentElement.dataset.theme = next
  localStorage.setItem('verbologic-theme', next)
}

function toggleTheme() {
  setTheme(theme.value === 'light' ? 'dark' : 'light')
}

// ── Language preference (same key/persistence as the account dialog) ────────
// Flag dropdown like the old toolbar LanguageSwitcher: current flag + code,
// opens a listbox of the 9 interface languages.
const NATIVE_KEY = 'verbologic-native-language'
const langOpen = ref(false)
const currentLang = computed(() => languages.find((l) => l.locale === lang.value) ?? languages[0])

function setNativeLang(locale: string) {
  langOpen.value = false
  localStorage.setItem(NATIVE_KEY, locale)
  void setLocale(locale as LocaleCode)
  setStatus('success', copy('account.saved', 'Saved.'))
}

// Close the language dropdown when clicking outside.
const langRoot = ref<HTMLElement | null>(null)
function onDocClick(e: MouseEvent) {
  if (langRoot.value && !langRoot.value.contains(e.target as Node)) langOpen.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

// ── Credits pill → buy dialog (the picker grid may span many rows, so the
// top-up UI lives in a dialog instead of a section below it). ───────────────

// ── Signed-out: pick a remembered user, or register a new one ───────────────
// mode 'pick' — tile grid of known users + New user; 'login' — the selected
// user's name is shown, e-mail + password are typed; 'register' — new
// account (e-mail, phone, password).
const mode = ref<'pick' | 'login' | 'register'>('pick')
const selected = ref<KnownUser | null>(null)
const loginEmail = ref('')
const loginPassword = ref('')
const regEmail = ref('')
const regPhone = ref('')
const regPassword = ref('')

function pickUser(u: KnownUser) {
  selected.value = u
  // Autocomplete the account's e-mail — only the password is left to type.
  loginEmail.value = u.email
  loginPassword.value = ''
  status.value = null
  loginAttempts.value = 0
  mode.value = 'login'
}

/** Log in / Anonymous tiles — any remote account, even one never seen on
 *  this computer (selected = null → generic "Sign in" dialog). */
function openLogin() {
  selected.value = null
  loginEmail.value = ''
  loginPassword.value = ''
  status.value = null
  loginAttempts.value = 0
  mode.value = 'login'
}

/** Dialog title: the picked user's name, or a generic sign-in. */
const loginTitle = computed(() =>
  selected.value
    ? copy('profile.login_title', 'Sign in as {name}').replace('{name}', selected.value.name)
    : copy('profile.login_generic', 'Sign in')
)

function startRegister() {
  regEmail.value = ''
  regPhone.value = ''
  regPassword.value = ''
  status.value = null
  mode.value = 'register'
}

function backToPick() {
  mode.value = 'pick'
  status.value = null
}

/** Forgot password — send the recovery e-mail to the typed/picked address. */
async function forgotPassword() {
  const mail = loginEmail.value.trim()
  if (!mail) {
    setStatus('error', copy('profile.email_required', 'Enter your e-mail address.'))
    return
  }
  if (busy.value) return
  busy.value = true
  const res = await store.sendPasswordReset(mail)
  busy.value = false
  if (fail(res)) return
  setStatus('info', copy('profile.recovery_sent', 'Recovery e-mail sent — check your inbox to reset your password.'))
}

// ── Login attempts: 5 wrong passwords → 15-second lock with countdown ──────
// The dialog stays open on failure; only after the 5th miss is the Log in
// button locked for 15 s (UX lock, not a security one — Supabase rate-limits
// server-side too).
const loginAttempts = ref(0)
const lockLeft = ref(0)
let lockTimer: ReturnType<typeof setInterval> | undefined

function startLock() {
  lockLeft.value = 15
  lockTimer = setInterval(() => {
    lockLeft.value--
    if (lockLeft.value > 0) {
      status.value = {
        kind: 'error',
        text: copy('profile.login_locked', 'You tried 5 times and failed. Try again in {n} seconds.').replace('{n}', String(lockLeft.value))
      }
      return
    }
    stopLock()
    setStatus('error', copy('profile.login_retry', 'You can try again now.'))
  }, 1000)
}

function stopLock() {
  if (lockTimer) clearInterval(lockTimer)
  lockTimer = undefined
  lockLeft.value = 0
  loginAttempts.value = 0
}

onBeforeUnmount(stopLock)

async function signInAs() {
  const mail = loginEmail.value.trim()
  if (!mail) {
    setStatus('error', copy('profile.email_required', 'Enter your e-mail address.'))
    return
  }
  if (loginPassword.value.length < 8 || busy.value || lockLeft.value > 0) return
  busy.value = true
  const res = await store.signInWithPassword(mail, loginPassword.value)
  busy.value = false
  if (!res.ok) {
    loginAttempts.value++
    if (loginAttempts.value >= 5) {
      setStatus('error', copy('profile.login_locked', 'You tried 5 times and failed. Try again in {n} seconds.').replace('{n}', '15'))
      startLock()
    } else {
      fail(res)
    }
    return
  }
  stopLock()
  loginAttempts.value = 0
  loginEmail.value = ''
  loginPassword.value = ''
  setStatus('success', copy('account.saved', 'Saved.'))
}

async function registerUser() {
  const mail = regEmail.value.trim()
  if (!mail) {
    setStatus('error', copy('profile.email_required', 'Enter your e-mail address.'))
    return
  }
  if (regPassword.value.length < 8 || busy.value) return
  busy.value = true
  const res = await store.signUpWithPassword(mail, regPassword.value, regPhone.value.trim() || undefined)
  busy.value = false
  if (!res.ok) {
    // Surface the raw message in the console — the i18n mapping below hides
    // the real cause (rate limit, already registered, weak password…).
    console.warn('[profile] register failed:', res.error)
    fail(res)
    return
  }
  regEmail.value = ''
  regPhone.value = ''
  regPassword.value = ''
  if (!store.isLoggedIn) {
    // signUp returned ok but no session — "Confirm e-mail" is ON in the
    // dashboard, so the account exists but is locked behind the e-mail link.
    setStatus('info', copy('profile.register_confirm_email', 'Account created — confirm via the e-mail we sent you, then sign in.'))
    return
  }
  setStatus('success', copy('account.saved', 'Saved.'))
}

// ── Password recovery (return from the "Forgot password?" e-mail link) ──────
// The link lands on /profile?recovery=1 with either &token_hash=… (e-mail
// template — verified here, works in any browser) or &code=… (default PKCE
// link — exchanged by the Supabase client during init, awaited by
// store.hydrate(), but only in the browser that requested the reset).
// Verified → prompt for the new password; otherwise the link was invalid,
// expired, or opened in another browser.
const route = useRoute()
const router = useRouter()
const recoveryDialog = ref(false)
const recoveryPassword = ref('')

function closeRecovery() {
  recoveryDialog.value = false
  recoveryPassword.value = ''
  showPassword.value = false
  // Drop ?recovery=1 (and any code/error params) so a reload doesn't reopen it.
  void router.replace({ path: '/profile' })
}

async function saveRecoveryPassword() {
  if (recoveryPassword.value.length < 8 || busy.value) return
  busy.value = true
  const res = await store.updatePassword(recoveryPassword.value)
  busy.value = false
  if (fail(res)) return
  closeRecovery()
  setStatus('success', copy('profile.recovery_done', 'Password changed — you are signed in.'))
}

onMounted(async () => {
  if (!isLoaded()) void setLocale(localStorage.getItem(NATIVE_KEY) as LocaleCode | null ?? lang.value)
  await store.hydrate()

  if (route.query.email_change) await finishEmailChange()
  if (route.query.recovery) {
    const tokenHash = typeof route.query.token_hash === 'string' ? route.query.token_hash : ''
    let verified = store.isLoggedIn
    if (tokenHash) {
      const res = await store.verifyRecovery(tokenHash)
      if (!res.ok) console.warn('[profile] recovery verify failed:', res.error)
      verified = res.ok
    }
    if (verified) {
      status.value = null
      recoveryDialog.value = true
    } else {
      setStatus('error', copy('profile.recovery_invalid', 'This recovery link is invalid, expired, or was opened in a different browser — request a new one.'))
      void router.replace({ path: '/profile' })
    }
  }
})

function setStatus(kind: 'info' | 'error' | 'success', text: string) {
  status.value = { kind, text }
}

// Per-panel status (Identity / Security show their own save feedback at the
// panel bottom-left instead of the page-level status line).
const identityStatus = ref<{ kind: 'info' | 'error' | 'success'; text: string } | null>(null)
const securityStatus = ref<{ kind: 'info' | 'error' | 'success'; text: string } | null>(null)

function setIdentity(kind: 'info' | 'error' | 'success', text: string) {
  identityStatus.value = { kind, text }
}

function setSecurity(kind: 'info' | 'error' | 'success', text: string) {
  securityStatus.value = { kind, text }
}

/** Map a raw Supabase message onto an `account.*` key when recognizable. */
function errText(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('sms') || (m.includes('phone') && (m.includes('provider') || m.includes('not enabled')))) {
    return copy('account.sms_not_configured', 'SMS verification is not enabled yet. You can still use your account with e-mail.')
  }
  if (m.includes('rate') || m.includes('too many')) return copy('account.rate_limited', 'Too many attempts — wait a moment.')
  // GoTrue masks SMTP failures (bad credentials, provider down) as
  // "Error sending recovery/confirmation email" — the real cause is in the
  // Supabase Auth logs.
  if (m.includes('error sending') || m.includes('smtp')) {
    return copy('account.email_send_failed', "Couldn't send the e-mail — try again later.")
  }
  return copy('account.error_generic', 'Something went wrong — try again.')
}

function fail(res: { ok: false; error: string } | { ok: true }, setter: typeof setStatus = setStatus): boolean {
  if (res.ok) return false
  setter('error', errText(res.error))
  return true
}

// ── Identity ────────────────────────────────────────────────────────────────
async function logOut() {
  await store.signOut()
  // Back to the user picker — without this the login dialog (mode 'login')
  // would still be open from the sign-in that just ended.
  backToPick()
  selected.value = null
  setStatus('success', copy('profile.logged_out', 'You are signed out.'))
}

/** Strip spaces, dashes and brackets from a typed phone number. */
function cleanPhone(p: string): string {
  return p.replace(/[\s\-()]/g, '')
}

/** Supabase stores phones as bare digits — show them with a leading +. */
function fmtPhone(p?: string): string {
  if (!p) return ''
  return /^\d+$/.test(p) ? `+${p}` : p
}

/** The number shown in the phone field: a pending change wins. */
const currentPhone = computed(() => fmtPhone(store.user?.pendingPhone ?? store.user?.phone))

// Keep read-only fields in sync with the store (after save, refresh, verify).
watch(
  () => store.user,
  (u: UserProfile | null) => {
    if (!editName.value) nameInput.value = u?.name ?? ''
    if (!editEmail.value) emailInput.value = u?.email ?? ''
    if (!editPhone.value) phoneInput.value = currentPhone.value
  },
  { immediate: true, deep: true }
)

/** Pen button: start editing a field, or cancel (restore the stored value). */
function toggleEdit(field: 'name' | 'email' | 'phone' | 'password') {
  if (field === 'name') {
    editName.value = !editName.value
    nameInput.value = store.user?.name ?? ''
  } else if (field === 'email') {
    editEmail.value = !editEmail.value
    emailInput.value = store.user?.email ?? ''
  } else if (field === 'phone') {
    editPhone.value = !editPhone.value
    phoneInput.value = currentPhone.value
  } else {
    editPassword.value = !editPassword.value
    newPassword.value = ''
    showPassword.value = false
  }
}

// What changed, and what still needs verification.
const nameDirty = computed(
  () => editName.value && nameInput.value.trim() !== '' && nameInput.value.trim() !== (store.user?.name ?? '')
)
const emailDirty = computed(
  () => editEmail.value && emailInput.value.trim().toLowerCase() !== (store.user?.email ?? '').toLowerCase()
)
const phoneDirty = computed(
  () => editPhone.value && cleanPhone(phoneInput.value) !== cleanPhone(currentPhone.value) && cleanPhone(phoneInput.value) !== ''
)
const passwordDirty = computed(() => editPassword.value && newPassword.value.length > 0)

/** E-mail is unverified: never confirmed, or a change awaits its link. */
const emailUnverified = computed(() => Boolean(store.user && (!store.user.emailVerified || store.user.pendingEmail)))
/** Phone is unverified: a number exists (or is pending) but isn't confirmed. */
const phoneUnverified = computed(() =>
  Boolean(store.user && (store.user.pendingPhone || (store.user.phone && !store.user.phoneVerified)))
)

/**
 * Footer button of each panel: 'save' when something changed; otherwise
 * 'verify' when a field is unverified; otherwise 'none' (disabled).
 * Security adds 'confirm' — a typed SMS code waiting to be checked.
 */
const identityAction = computed<'save' | 'verify' | 'none'>(() =>
  nameDirty.value || emailDirty.value ? 'save' : emailUnverified.value ? 'verify' : 'none'
)
const securityAction = computed<'save' | 'confirm' | 'verify' | 'none'>(() => {
  if (phoneDirty.value || passwordDirty.value) return 'save'
  if (phonePending.value) return 'confirm'
  return phoneUnverified.value ? 'verify' : 'none'
})

async function identitySubmit() {
  if (busy.value || identityAction.value === 'none') return
  if (identityAction.value === 'verify') {
    busy.value = true
    const res = await store.resendEmailVerification()
    busy.value = false
    if (fail(res, setIdentity)) return
    setIdentity(
      'info',
      copy('profile.email_verify_sent', 'Verification e-mail sent to {email}.').replace(
        '{email}',
        store.user?.pendingEmail ?? store.user?.email ?? ''
      )
    )
    return
  }

  const newEmail = emailInput.value.trim()
  if (emailDirty.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    setIdentity('error', copy('profile.email_invalid', 'Enter a valid e-mail address.'))
    return
  }
  busy.value = true
  if (nameDirty.value) {
    const res = await store.updateDisplayName(nameInput.value.trim())
    if (fail(res, setIdentity)) {
      busy.value = false
      return
    }
    editName.value = false
  }
  if (emailDirty.value) {
    const res = await store.updateEmail(newEmail)
    busy.value = false
    if (fail(res, setIdentity)) return
    editEmail.value = false
    emailInput.value = store.user?.email ?? ''
    setIdentity(
      'info',
      copy('profile.email_change_sent', 'Confirmation e-mail sent to {email} — click the link to verify.').replace('{email}', newEmail)
    )
    return
  }
  busy.value = false
  setIdentity('success', copy('account.saved', 'Saved.'))
}

/** Return from an e-mail verification link (/profile/?email_change=1 with
 *  &token_hash=… from the "Change Email Address" template, or ?code=…
 *  already exchanged by the Supabase client during hydrate). */
async function finishEmailChange() {
  const tokenHash = typeof route.query.token_hash === 'string' ? route.query.token_hash : ''
  let ok = store.isLoggedIn
  if (tokenHash) {
    const res = await store.verifyEmailChangeLink(tokenHash)
    if (!res.ok) console.warn('[profile] e-mail change verify failed:', res.error)
    ok = res.ok
  } else if (ok) {
    await store.refreshUser()
  }
  void router.replace({ path: '/profile' })
  if (!ok) {
    setIdentity('error', copy('profile.email_link_invalid', 'This verification link is invalid or has expired — press Verify to get a new one.'))
    return
  }
  // "Secure email change" sends a link to both addresses — the change only
  // completes once both are clicked.
  if (store.user?.pendingEmail) {
    setIdentity('info', copy('profile.email_confirm_other', 'Confirmed — now click the link sent to your other address too.'))
  } else {
    setIdentity('success', copy('profile.email_verified', 'E-mail verified.'))
  }
}

async function removeAvatar() {
  if (busy.value) return
  busy.value = true
  const res = await store.removeAvatar()
  busy.value = false
  if (fail(res, setIdentity)) return
  avatarPreview.value = ''
  setIdentity('success', copy('account.saved', 'Saved.'))
}

// ── Security: phone (SMS-verified) + password ───────────────────────────────
/** Send the SMS code for `phone` and open the code field. A pending change
 *  is re-sent; anything else (new number, or the unverified signup number)
 *  starts a phone change, which sends the code. */
async function sendPhoneCode(phone: string): Promise<boolean> {
  const res = cleanPhone(phone) === cleanPhone(fmtPhone(store.user?.pendingPhone))
    ? await store.resendPhoneCode(phone)
    : await store.updatePhone(phone)
  if (fail(res, setSecurity)) return false
  phoneTarget.value = phone
  phonePending.value = true
  codeInput.value = ''
  setSecurity('info', copy('profile.sms_sent', 'We sent an SMS code to {phone} — enter it below.').replace('{phone}', phone))
  return true
}

async function resendCode() {
  if (busy.value || !phoneTarget.value) return
  busy.value = true
  await sendPhoneCode(phoneTarget.value)
  busy.value = false
}

async function securitySubmit() {
  if (busy.value || securityAction.value === 'none') return

  if (securityAction.value === 'confirm') {
    if (codeInput.value.trim().length < 6) {
      setSecurity('error', copy('profile.code_required', 'Enter the 6-digit code from the SMS.'))
      return
    }
    busy.value = true
    const res = await store.verifyPhoneOtp(phoneTarget.value, codeInput.value.trim())
    busy.value = false
    if (!res.ok) {
      // Code rejected — the number stays unverified; the code field stays
      // open for another try (or Resend code).
      setSecurity('error', copy('profile.phone_code_failed', 'Wrong code — your phone stays unverified. Try again or resend the code.'))
      return
    }
    phonePending.value = false
    codeInput.value = ''
    setSecurity('success', copy('profile.phone_verified', 'Phone verified.'))
    return
  }

  if (securityAction.value === 'verify') {
    busy.value = true
    await sendPhoneCode(currentPhone.value)
    busy.value = false
    return
  }

  // 'save' — password and/or phone changed.
  if (passwordDirty.value && newPassword.value.length < 8) {
    setSecurity('error', copy('account.password_min', 'At least 8 characters.'))
    return
  }
  busy.value = true
  if (passwordDirty.value) {
    const res = await store.updatePassword(newPassword.value)
    if (fail(res, setSecurity)) {
      busy.value = false
      return
    }
    editPassword.value = false
    newPassword.value = ''
    showPassword.value = false
    setSecurity('success', copy('account.saved', 'Saved.'))
  }
  if (phoneDirty.value) {
    const phone = cleanPhone(phoneInput.value)
    if (await sendPhoneCode(phone)) editPhone.value = false
  }
  busy.value = false
}

</script>

<template>
  <main class="mx-auto max-w-3xl">
    <!-- Title row — Log out / Log in right-aligned on the same line. -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-3xl font-bold text-content">{{ copy('profile.title', 'Profile') }}</h1>
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-full border border-edge bg-surface px-4 py-2 text-sm font-semibold text-content shadow-sm transition hover:border-accent hover:text-accent"
        @click="store.isLoggedIn ? logOut() : openLogin()"
      >
        <ArrowRightStartOnRectangleIcon class="h-5 w-5 shrink-0" aria-hidden="true" />
        {{ copy(store.isLoggedIn ? 'profile.log_out' : 'profile.log_in', store.isLoggedIn ? 'Log out' : 'Log in') }}
      </button>
    </div>
    <p class="mt-2 text-muted">{{ copy('profile.subtitle', 'Your account, preferences and credits.') }}</p>

    <!-- Preferences — shared bar, identical signed in and signed out, always
         directly under the title/subtitle: title on the left, theme toggle +
         language flag dropdown right-aligned on the same row. Only what sits
         below the bar changes with login state. -->
    <div class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-edge bg-surface p-4">
      <h2 class="text-lg font-bold text-content">{{ copy('profile.your_preferences', 'Your Preferences') }}</h2>

      <div class="flex items-center gap-2">
        <!-- Theme: sun on light, moon on dark — one tap toggles. -->
        <button
          type="button"
          class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-edge bg-body text-muted transition hover:border-accent hover:text-accent"
          :aria-label="copy(theme === 'light' ? 'account.settings_theme_dark' : 'account.settings_theme_light', theme === 'light' ? 'Dark' : 'Light')"
          @click="toggleTheme"
        >
          <MoonIcon v-if="theme === 'light'" class="h-5 w-5" aria-hidden="true" />
          <SunIcon v-else class="h-5 w-5" aria-hidden="true" />
        </button>

        <!-- Language: flag + code dropdown (same listbox as the old
             toolbar LanguageSwitcher). -->
        <div ref="langRoot" class="relative">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-full border border-edge bg-body px-2 py-1.5 text-sm font-medium text-content transition hover:border-accent"
            aria-haspopup="listbox"
            :aria-expanded="langOpen"
            :aria-label="copy('ui.change_language', 'Change language')"
            @click="langOpen = !langOpen"
          >
            <LanguageFlag :code="currentLang.flag" :label="languageName(currentLang.locale)" size="md" />
            <span class="w-8 shrink-0 text-center font-code text-xs font-semibold tracking-wider">{{ currentLang.code }}</span>
            <ChevronDownIcon class="h-4 w-4" aria-hidden="true" />
          </button>

          <ul
            v-if="langOpen"
            class="absolute right-0 z-50 mt-2 max-h-72 w-56 overflow-auto rounded-xl border border-edge bg-surface py-1 text-content shadow-lg"
            role="listbox"
          >
            <li v-for="l in languages" :key="l.code">
              <button
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-accent-soft hover:text-accent"
                :class="{ 'bg-accent-soft font-semibold text-accent': l.locale === lang }"
                role="option"
                :aria-selected="l.locale === lang"
                @click="setNativeLang(l.locale)"
              >
                <LanguageFlag :code="l.flag" :label="languageName(l.locale)" size="md" />
                <span class="w-8 shrink-0 font-code text-xs font-semibold tracking-wider text-faint">{{ l.code }}</span>
                <span class="min-w-0 flex-1 truncate">{{ languageName(l.locale) }}</span>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Signed out: pick a remembered user (this computer) or register -->
    <div v-if="!store.isLoggedIn" class="mt-8">
      <!-- Pick mode: tile grid of known users + New user -->
      <template v-if="mode === 'pick'">
        <!-- One intro line (credits + progress live in the Library now). -->
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm font-medium text-muted">
            {{ copy('profile.pick_intro', 'Select a user to log in, or set your preferences.') }}
          </p>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <!-- Anonymous: the local not-registered user and their cropped avatar -->
          <button
            type="button"
            class="flex flex-col items-center gap-2 rounded-2xl border border-edge bg-surface p-4 text-center transition hover:border-accent"
            @click="openLogin"
          >
            <img
              v-if="store.anonymousAvatar"
              :src="store.anonymousAvatar"
              :alt="copy('profile.anonymous', 'Anonymous')"
              class="h-16 w-16 rounded-full object-cover ring-1 ring-edge"
            >
            <svg v-else viewBox="0 0 40 40" class="h-16 w-16 rounded-full" aria-hidden="true">
              <circle cx="20" cy="20" r="20" class="fill-accent" />
              <circle cx="20" cy="15.5" r="6.2" class="fill-white" />
              <path d="M7.6 34.3C10 28.4 14.9 26 20 26s10 2.4 12.4 8.3a20 20 0 0 1-24.8 0z" class="fill-white" />
            </svg>
            <span class="min-w-0 w-full truncate text-sm font-semibold text-content">
              {{ copy('profile.anonymous', 'Anonymous') }}
            </span>
            <span class="min-w-0 w-full truncate text-xs text-faint">
              {{ copy('profile.not_registered', 'Not registered') }}
            </span>
          </button>

          <button
            v-for="u in store.knownUsers"
            :key="u.email"
            type="button"
            class="flex flex-col items-center gap-2 rounded-2xl border border-edge bg-surface p-4 text-center transition hover:border-accent"
            @click="pickUser(u)"
          >
            <img
              v-if="u.avatarUrl"
              :src="u.avatarUrl"
              :alt="u.name"
              class="h-16 w-16 rounded-full object-cover ring-1 ring-edge"
              referrerpolicy="no-referrer"
              loading="lazy"
            >
            <span
              v-else
              class="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-lg font-semibold text-on-accent"
            >
              {{ u.name.slice(0, 2).toUpperCase() }}
            </span>
            <span class="min-w-0 w-full truncate text-sm font-semibold text-content">{{ u.name }}</span>
            <span class="min-w-0 w-full truncate text-xs text-faint">{{ u.email }}</span>
          </button>

          <!-- Log in: any remote account, even one never seen on this computer -->
          <button
            type="button"
            class="flex flex-col items-center justify-center gap-2 rounded-2xl border border-edge bg-surface p-4 text-center transition hover:border-accent"
            @click="openLogin"
          >
            <span class="flex h-16 w-16 items-center justify-center rounded-full border border-edge text-muted">
              <ArrowRightStartOnRectangleIcon class="h-8 w-8" aria-hidden="true" />
            </span>
            <span class="text-sm font-semibold text-muted">{{ copy('profile.login_tile', 'Log in') }}</span>
            <span class="min-w-0 w-full truncate text-xs text-faint">
              {{ copy('profile.login_tile_hint', 'Have an account? Sign in here.') }}
            </span>
          </button>

          <!-- New user tile -->
          <button
            type="button"
            class="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-edge bg-surface p-4 text-center transition hover:border-accent"
            @click="startRegister"
          >
            <span class="flex h-16 w-16 items-center justify-center rounded-full border border-edge text-muted">
              <PlusIcon class="h-8 w-8" aria-hidden="true" />
            </span>
            <span class="text-sm font-semibold text-muted">{{ copy('profile.new_user', 'New user') }}</span>
          </button>
        </div>
      </template>

      <!-- Login mode: remembered name (or generic), e-mail + password typed.
           Round ✕ closes back to the picker. -->
      <AppDialog
        v-else-if="mode === 'login'"
        :title="loginTitle"
        :close-label="copy('account.close', 'Close')"
        @close="backToPick"
      >
        <div>
          <label for="login-email" class="block text-sm font-medium text-muted">
            {{ copy('account.email_label', 'E-mail') }}
          </label>
          <input
            id="login-email"
            v-model="loginEmail"
            type="email"
            autocomplete="email"
            :placeholder="copy('account.email_placeholder', 'you@example.com')"
            class="mt-1 w-full rounded-xl border border-edge bg-body px-3 py-2 text-content outline-none focus:border-accent"
          >
        </div>

        <div class="mt-4">
          <label for="login-password" class="block text-sm font-medium text-muted">
            {{ copy('account.password_label', 'Password') }}
          </label>
          <input
            id="login-password"
            v-model="loginPassword"
            type="password"
            autocomplete="current-password"
            :placeholder="copy('account.password_placeholder', '••••••••')"
            class="mt-1 w-full rounded-xl border border-edge bg-body px-3 py-2 text-content outline-none focus:border-accent"
          >
          <p class="mt-1 text-xs text-faint">{{ copy('account.password_min', 'At least 8 characters.') }}</p>
        </div>

        <div class="mt-5 flex gap-3">
          <button
            type="button"
            class="flex-1 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="busy || lockLeft > 0 || !loginEmail || loginPassword.length < 8"
            @click="signInAs"
          >
            {{ lockLeft > 0
              ? copy('profile.login_wait', 'Wait {n}s').replace('{n}', String(lockLeft))
              : copy('profile.login_button', 'Log in') }}
          </button>
        </div>

        <!-- Forgot password — sends the recovery e-mail to the typed address. -->
        <button
          type="button"
          class="mt-3 w-full text-center text-sm font-medium text-muted transition hover:text-accent disabled:opacity-40"
          :disabled="busy"
          @click="forgotPassword"
        >
          {{ copy('profile.forgot_password', 'Forgot password?') }}
        </button>

        <p
          v-if="status?.text"
          class="mt-4 rounded-xl px-4 py-2 text-sm"
          :class="{
            'bg-accent-soft text-accent': status.kind === 'success',
            'bg-soft text-muted': status.kind === 'info',
            'bg-soft text-content': status.kind === 'error'
          }"
          aria-live="polite"
          role="status"
        >
          {{ status.text }}
        </p>
      </AppDialog>

      <!-- Register mode: new account (e-mail, phone, password). Round ✕ closes. -->
      <AppDialog
        v-else
        :title="copy('profile.register_title', 'Create a new account')"
        :close-label="copy('account.close', 'Close')"
        @close="backToPick"
      >
        <div>

        <div class="mt-4">
          <label for="reg-email" class="block text-sm font-medium text-muted">
            {{ copy('account.email_label', 'E-mail') }}
          </label>
          <input
            id="reg-email"
            v-model="regEmail"
            type="email"
            autocomplete="email"
            :placeholder="copy('account.email_placeholder', 'you@example.com')"
            class="mt-1 w-full rounded-xl border border-edge bg-body px-3 py-2 text-content outline-none focus:border-accent"
          >
        </div>

        <div class="mt-4">
          <label for="reg-phone" class="block text-sm font-medium text-muted">
            {{ copy('account.phone_label', 'Phone number') }}
          </label>
          <input
            id="reg-phone"
            v-model="regPhone"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            :placeholder="copy('account.phone_placeholder', '+40 7xx xxx xxx')"
            class="mt-1 w-full rounded-xl border border-edge bg-body px-3 py-2 text-content outline-none focus:border-accent"
          >
        </div>

        <div class="mt-4">
          <label for="reg-password" class="block text-sm font-medium text-muted">
            {{ copy('account.password_label', 'Password') }}
          </label>
          <input
            id="reg-password"
            v-model="regPassword"
            type="password"
            autocomplete="new-password"
            :placeholder="copy('account.password_placeholder', '••••••••')"
            class="mt-1 w-full rounded-xl border border-edge bg-body px-3 py-2 text-content outline-none focus:border-accent"
          >
          <p class="mt-1 text-xs text-faint">{{ copy('account.password_min', 'At least 8 characters.') }}</p>
        </div>

        <div class="mt-5 flex gap-3">
          <button
            type="button"
            class="flex-1 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="busy || !regEmail || regPassword.length < 8"
            @click="registerUser"
          >
            {{ copy('profile.register_button', 'Register') }}
          </button>
        </div>

        <p
          v-if="status?.text"
          class="mt-4 rounded-xl px-4 py-2 text-sm"
          :class="{
            'bg-accent-soft text-accent': status.kind === 'success',
            'bg-soft text-muted': status.kind === 'info',
            'bg-soft text-content': status.kind === 'error'
          }"
          aria-live="polite"
          role="status"
        >
          {{ status.text }}
        </p>
        </div>
      </AppDialog>
    </div>

    <!-- Set new password — opened on return from the recovery e-mail link
         (/profile?recovery=1, session already established by the link). -->
    <AppDialog
      v-if="recoveryDialog"
      :title="copy('profile.recovery_title', 'Set a new password')"
      :close-label="copy('account.close', 'Close')"
      @close="closeRecovery"
    >
      <p class="text-sm text-muted">
        {{ copy('profile.recovery_intro', 'Choose a new password for {email}.').replace('{email}', store.user?.email ?? '') }}
      </p>

      <div class="mt-4">
        <label for="recovery-password" class="block text-sm font-medium text-muted">
          {{ copy('account.new_password_label', 'New password') }}
        </label>
        <div class="relative mt-1">
          <input
            id="recovery-password"
            v-model="recoveryPassword"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="new-password"
            :placeholder="copy('account.password_placeholder', '••••••••')"
            class="w-full rounded-xl border border-edge bg-body px-3 py-2 pr-10 text-content outline-none focus:border-accent"
            @keydown.enter="saveRecoveryPassword"
          >
          <button
            type="button"
            class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted transition hover:text-accent"
            :aria-label="copy(showPassword ? 'account.password_hide' : 'account.password_show', showPassword ? 'Hide password' : 'Show password')"
            @click="showPassword = !showPassword"
          >
            <EyeSlashIcon v-if="showPassword" class="h-5 w-5" aria-hidden="true" />
            <EyeIcon v-else class="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <p class="mt-1 text-xs text-faint">{{ copy('account.password_min', 'At least 8 characters.') }}</p>
      </div>

      <div class="mt-5 flex gap-3">
        <button
          type="button"
          class="flex-1 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="busy || recoveryPassword.length < 8"
          @click="saveRecoveryPassword"
        >
          {{ copy('account.save', 'Save') }}
        </button>
      </div>

      <p
        v-if="status?.text"
        class="mt-4 rounded-xl px-4 py-2 text-sm"
        :class="{
          'bg-accent-soft text-accent': status.kind === 'success',
          'bg-soft text-muted': status.kind === 'info',
          'bg-soft text-content': status.kind === 'error'
        }"
        aria-live="polite"
        role="status"
      >
        {{ status.text }}
      </p>
    </AppDialog>

    <!-- Signed in: two-column panel grid on large screens —
         Identity | Security (credits + progress live in the Library). -->
    <div v-if="store.isLoggedIn" class="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
      <!-- Identity: avatar + name (theme + language live in the shared
         preferences bar above) -->
      <section class="rounded-2xl border border-edge bg-surface p-6">
        <h2 class="text-lg font-bold text-content">{{ copy('profile.identity_title', 'Identity') }}</h2>

        <div class="mt-4 flex flex-wrap items-center gap-4">
          <img
            v-if="store.user?.avatarUrl || avatarPreview"
            :src="avatarPreview || store.user?.avatarUrl || ''"
            :alt="store.user?.name"
            class="h-16 w-16 rounded-full object-cover ring-1 ring-edge"
          >
          <span
            v-else
            class="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-lg font-semibold text-on-accent"
          >
            {{ store.user?.name.slice(0, 2).toUpperCase() }}
          </span>
          <div class="flex flex-col gap-1">
            <button
              type="button"
              class="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition hover:bg-accent-strong"
              @click="avatarDialog = true"
            >
              {{ copy('account.avatar_change', 'Upload new picture') }}
            </button>
            <button
              v-if="store.user?.avatarUrl || avatarPreview"
              type="button"
              class="text-xs text-muted transition hover:text-accent disabled:opacity-40"
              :disabled="busy"
              @click="removeAvatar"
            >
              {{ copy('account.avatar_remove', 'Remove picture') }}
            </button>
            <span class="text-xs text-faint">{{ copy('account.avatar_hint', 'PNG, JPG or WebP · max 2 MB') }}</span>
          </div>
        </div>

        <!-- Shared pan/crop avatar editor (same dialog as the header avatar) -->
        <AvatarCropDialog v-if="avatarDialog" @close="avatarDialog = false" />

        <!-- Fields span the panel width and are read-only until their pen
             button (left of the field) starts editing. Footer: message
             bottom-left, Save / Verify bottom-right. -->
        <div class="mt-5 space-y-4">
          <div>
            <label for="profile-name" class="block text-sm font-medium text-muted">
              {{ copy('account.name_label', 'Full name') }}
            </label>
            <div class="mt-1 flex items-center gap-2">
              <button
                type="button"
                class="pen-btn"
                :class="{ 'is-active': editName }"
                :aria-label="copy(editName ? 'profile.edit_cancel' : 'profile.edit', editName ? 'Cancel editing' : 'Edit')"
                :title="copy(editName ? 'profile.edit_cancel' : 'profile.edit', editName ? 'Cancel editing' : 'Edit')"
                :aria-pressed="editName"
                @click="toggleEdit('name')"
              >
                <XMarkIcon v-if="editName" class="h-4 w-4" aria-hidden="true" />
                <PencilIcon v-else class="h-4 w-4" aria-hidden="true" />
              </button>
              <input
                id="profile-name"
                v-model="nameInput"
                type="text"
                autocomplete="name"
                :readonly="!editName"
                class="profile-field"
                @keydown.enter="identitySubmit"
              >
            </div>
          </div>

          <!-- E-mail: editable like any field — the account is identified by
               its invisible id, so the address can change. A change is only
               applied once the confirmation link is clicked. -->
          <div>
            <div class="flex items-center justify-between gap-2">
              <label for="profile-email" class="block text-sm font-medium text-muted">
                {{ copy('account.email_label', 'E-mail') }}
              </label>
              <span
                class="rounded-full px-2 py-0.5 text-xs"
                :class="emailUnverified ? 'bg-soft text-faint' : 'bg-accent-soft text-accent'"
              >
                {{ copy(emailUnverified ? 'account.unverified' : 'account.verified', emailUnverified ? 'Not verified' : 'Verified') }}
              </span>
            </div>
            <div class="mt-1 flex items-center gap-2">
              <button
                type="button"
                class="pen-btn"
                :class="{ 'is-active': editEmail }"
                :aria-label="copy(editEmail ? 'profile.edit_cancel' : 'profile.edit', editEmail ? 'Cancel editing' : 'Edit')"
                :title="copy(editEmail ? 'profile.edit_cancel' : 'profile.edit', editEmail ? 'Cancel editing' : 'Edit')"
                :aria-pressed="editEmail"
                @click="toggleEdit('email')"
              >
                <XMarkIcon v-if="editEmail" class="h-4 w-4" aria-hidden="true" />
                <PencilIcon v-else class="h-4 w-4" aria-hidden="true" />
              </button>
              <input
                id="profile-email"
                v-model="emailInput"
                type="email"
                autocomplete="email"
                :readonly="!editEmail"
                class="profile-field"
                @keydown.enter="identitySubmit"
              >
            </div>
            <p v-if="store.user?.pendingEmail" class="mt-1 text-xs text-muted">
              {{ copy('profile.email_pending', 'Waiting for confirmation: {email}').replace('{email}', store.user.pendingEmail) }}
            </p>
          </div>
        </div>

        <!-- Panel footer: message left, Save / Verify right -->
        <div class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-edge pt-4">
          <p
            v-if="identityStatus?.text"
            class="min-w-0 flex-1 rounded-xl px-4 py-2 text-sm"
            :class="{
              'bg-accent-soft text-accent': identityStatus.kind === 'success',
              'bg-soft text-muted': identityStatus.kind === 'info',
              'bg-soft text-content': identityStatus.kind === 'error'
            }"
            aria-live="polite"
            role="status"
          >
            {{ identityStatus.text }}
          </p>
          <span v-else class="flex-1" aria-hidden="true" />
          <button
            type="button"
            class="shrink-0 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-on-accent transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="busy || identityAction === 'none'"
            @click="identitySubmit"
          >
            {{ identityAction === 'verify' ? copy('account.verify', 'Verify') : copy('account.save', 'Save') }}
          </button>
        </div>
      </section>

      <!-- Security: phone + password. Fields span the panel width; Save sits
           bottom-right with the feedback message bottom-left. -->
      <section class="rounded-2xl border border-edge bg-surface p-6">
        <h2 class="text-lg font-bold text-content">{{ copy('profile.security_title', 'Security') }}</h2>

        <div class="mt-4 space-y-4">
          <!-- Phone: pen to edit; Save sends an SMS code, the code field
               then opens below and the footer button becomes Confirm. -->
          <div>
            <div class="flex items-center justify-between gap-2">
              <label for="profile-phone" class="block text-sm font-medium text-muted">
                {{ copy('account.phone_label', 'Phone number') }}
              </label>
              <span
                v-if="currentPhone"
                class="rounded-full px-2 py-0.5 text-xs"
                :class="phoneUnverified ? 'bg-soft text-faint' : 'bg-accent-soft text-accent'"
              >
                {{ copy(phoneUnverified ? 'account.unverified' : 'account.verified', phoneUnverified ? 'Not verified' : 'Verified') }}
              </span>
            </div>
            <div class="mt-1 flex items-center gap-2">
              <button
                type="button"
                class="pen-btn"
                :class="{ 'is-active': editPhone }"
                :aria-label="copy(editPhone ? 'profile.edit_cancel' : 'profile.edit', editPhone ? 'Cancel editing' : 'Edit')"
                :title="copy(editPhone ? 'profile.edit_cancel' : 'profile.edit', editPhone ? 'Cancel editing' : 'Edit')"
                :aria-pressed="editPhone"
                @click="toggleEdit('phone')"
              >
                <XMarkIcon v-if="editPhone" class="h-4 w-4" aria-hidden="true" />
                <PencilIcon v-else class="h-4 w-4" aria-hidden="true" />
              </button>
              <input
                id="profile-phone"
                v-model="phoneInput"
                type="tel"
                inputmode="tel"
                autocomplete="tel"
                :readonly="!editPhone"
                :placeholder="copy('account.phone_placeholder', '+40 7xx xxx xxx')"
                class="profile-field"
                @keydown.enter="securitySubmit"
              >
            </div>
            <!-- SMS code: opens after a code is sent; footer button confirms -->
            <div v-if="phonePending" class="mt-2 rounded-xl bg-soft p-4">
              <label for="profile-code" class="block text-sm font-medium text-muted">
                {{ copy('profile.code_label', 'SMS code') }}
              </label>
              <div class="mt-1 flex items-center gap-2">
                <input
                  id="profile-code"
                  v-model="codeInput"
                  type="text"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  maxlength="6"
                  :placeholder="copy('account.code_placeholder', '6-digit code')"
                  class="min-w-0 flex-1 rounded-xl border border-edge bg-body px-3 py-2 font-code text-lg tracking-widest text-content outline-none focus:border-accent"
                  @keydown.enter="securitySubmit"
                >
                <button
                  type="button"
                  class="shrink-0 text-sm font-medium text-muted transition hover:text-accent disabled:opacity-40"
                  :disabled="busy"
                  @click="resendCode"
                >
                  {{ copy('profile.resend_code', 'Resend code') }}
                </button>
              </div>
            </div>
          </div>

          <!-- Password: pen to edit; full-width field with eye toggle -->
          <div class="border-t border-edge pt-4">
            <label for="profile-password" class="block text-sm font-medium text-muted">
              {{ copy('account.password_label', 'Password') }}
            </label>
            <div class="mt-1 flex items-center gap-2">
              <button
                type="button"
                class="pen-btn"
                :class="{ 'is-active': editPassword }"
                :aria-label="copy(editPassword ? 'profile.edit_cancel' : 'profile.edit', editPassword ? 'Cancel editing' : 'Edit')"
                :title="copy(editPassword ? 'profile.edit_cancel' : 'profile.edit', editPassword ? 'Cancel editing' : 'Edit')"
                :aria-pressed="editPassword"
                @click="toggleEdit('password')"
              >
                <XMarkIcon v-if="editPassword" class="h-4 w-4" aria-hidden="true" />
                <PencilIcon v-else class="h-4 w-4" aria-hidden="true" />
              </button>
              <div class="relative min-w-0 flex-1">
                <input
                  id="profile-password"
                  v-model="newPassword"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="new-password"
                  :readonly="!editPassword"
                  :placeholder="editPassword ? copy('account.new_password_label', 'New password') : '••••••••'"
                  class="profile-field pr-10"
                  @keydown.enter="securitySubmit"
                >
                <button
                  v-if="editPassword"
                  type="button"
                  class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted transition hover:text-accent"
                  :aria-label="copy(showPassword ? 'account.password_hide' : 'account.password_show', showPassword ? 'Hide password' : 'Show password')"
                  @click="showPassword = !showPassword"
                >
                  <EyeSlashIcon v-if="showPassword" class="h-5 w-5" aria-hidden="true" />
                  <EyeIcon v-else class="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
            <p v-if="editPassword" class="mt-1 text-xs text-faint">{{ copy('account.password_min', 'At least 8 characters.') }}</p>
          </div>
        </div>

        <!-- Panel footer: message left, Save / Confirm / Verify right -->
        <div class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-edge pt-4">
          <p
            v-if="securityStatus?.text"
            class="min-w-0 flex-1 rounded-xl px-4 py-2 text-sm"
            :class="{
              'bg-accent-soft text-accent': securityStatus.kind === 'success',
              'bg-soft text-muted': securityStatus.kind === 'info',
              'bg-soft text-content': securityStatus.kind === 'error'
            }"
            aria-live="polite"
            role="status"
          >
            {{ securityStatus.text }}
          </p>
          <span v-else class="flex-1" aria-hidden="true" />
          <button
            type="button"
            class="shrink-0 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-on-accent transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="busy || securityAction === 'none'"
            @click="securitySubmit"
          >
            {{
              securityAction === 'confirm'
                ? copy('profile.confirm_code', 'Confirm')
                : securityAction === 'verify'
                  ? copy('account.verify', 'Verify')
                  : copy('account.save', 'Save')
            }}
          </button>
        </div>
      </section>

    </div>

    <!-- Status / error line (announced to screen readers) -->
    <p
      v-if="status?.text"
      class="mt-4 rounded-xl px-4 py-2 text-sm"
      :class="{
        'bg-accent-soft text-accent': status.kind === 'success',
        'bg-soft text-muted': status.kind === 'info',
        'bg-soft text-content': status.kind === 'error'
      }"
      aria-live="polite"
      role="status"
    >
      {{ status.text }}
    </p>
  </main>
</template>

<style scoped>
/* Round pen / ✕ button left of each Identity + Security field. */
.pen-btn {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid var(--color-edge);
  border-radius: 9999px;
  color: var(--color-muted);
  transition: border-color 0.15s, color 0.15s, background-color 0.15s;
}
.pen-btn:hover,
.pen-btn.is-active {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.pen-btn.is-active {
  background: var(--color-accent-soft);
}

/* Full-width field: read-only looks flat and muted, editing looks live. */
.profile-field {
  min-width: 0;
  width: 100%;
  flex: 1 1 0%;
  border: 1px solid var(--color-edge);
  border-radius: 0.75rem;
  background: var(--color-body);
  padding: 0.5rem 0.75rem;
  color: var(--color-content);
  outline: none;
}
.profile-field:focus {
  border-color: var(--color-accent);
}
.profile-field:read-only {
  cursor: default;
  background: var(--color-surface-soft);
  color: var(--color-muted);
}
.profile-field:read-only:focus {
  border-color: var(--color-edge);
}
</style>
