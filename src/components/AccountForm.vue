// AccountForm — one self-contained form, three modes: create account /
// sign in (passwordless: paste the 6-digit code e-mailed by Supabase) and
// profile edit (display name, avatar upload, e-mail change, phone number
// with SMS verification once the provider is enabled).
// Verification state is read from the session; errors map to i18n keys with
// the raw Supabase message as the fallback. Attempt limiting is UX-level
// deterrence only (see src/lib/otpAttempts.ts).
<script setup lang="ts">
import {
  MAX_ATTEMPTS,
  clearOtpAttempts,
  formatOtp,
  isWellFormedOtp,
  normalizeOtp,
  otpState,
  registerOtpFailure
} from '~/lib/otpAttempts'
import { EMAIL_CODE_ENABLED } from '~/config/auth'
import { EyeIcon, EyeSlashIcon } from '@heroicons/vue/20/solid'

const route = useRoute()
const copy = useCopy()
const store = useUserStore()

// ── Flow context ────────────────────────────────────────────────────────────
// Resume target (?next=/pricing) — same-origin paths only (no open redirects).
const nextUrl = computed(() => {
  const next = route.query.next
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : ''
})

// ── Local state ─────────────────────────────────────────────────────────────
const tab = ref<'register' | 'signin'>('register')
const email = ref('')
const codeInput = ref('')
const nameInput = ref('')
const newEmail = ref('')
const newPhone = ref('')
/** Which verification is awaited by the shared code input. */
const pending = ref<'none' | 'email' | 'email_change' | 'phone_change'>('none')
const busy = ref(false)
const status = ref<{ kind: 'info' | 'error' | 'success'; text: string } | null>(null)
const avatarPreview = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const resendAt = ref(0)
// GoTrue rate-limits OTP requests to once per 60 s per user — stay above it.
const RESEND_COOLDOWN_MS = 60_000

// 1s ticker only while mounted — drives the resend cooldown label.
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  ticker = setInterval(() => (now.value = Date.now()), 1000)
})
onBeforeUnmount(() => clearInterval(ticker))
const resendIn = computed(() => Math.max(0, Math.ceil((resendAt.value - now.value) / 1000)))

// ── Temporary password mode (e-mail verification postponed) ─────────────────
// EMAIL_CODE_ENABLED === false → register/sign-in via e-mail + password.
// "Confirm email" must be OFF in the dashboard so signUp returns a session.
const password = ref('')
const showPassword = ref(false)

/** Dialog title follows the mode: Account (auth) / Profile (signed in). */
const dialogTitle = computed(() =>
  store.isLoggedIn
    ? copy('account.profile_title', 'Profile')
    : copy('account.title', 'Account')
)

/** Close (✕ / Escape / backdrop) → back to the resume target or home. */
function closeDialog() {
  void navigateTo(nextUrl.value || '/')
}

/** Submit the temporary password auth for the active mode. */
async function submitAuth() {
  const mail = email.value.trim()
  if (!mail || password.value.length < 8 || busy.value) return
  busy.value = true
  const res =
    tab.value === 'register'
      ? await store.signUpWithPassword(mail, password.value)
      : await store.signInWithPassword(mail, password.value)
  busy.value = false
  if (fail(res)) return
  await afterAuth()
}

/** The secondary bottom-bar button flips the mode (and clears any status). */
function switchMode() {
  tab.value = tab.value === 'register' ? 'signin' : 'register'
  status.value = null
}

// ── Attempt limiting (UX deterrence — see src/lib/otpAttempts.ts) ───────────
const attempts = ref<{ attemptsLeft: number; locked: boolean }>({ attemptsLeft: MAX_ATTEMPTS, locked: false })
const otpDigits = computed(() => normalizeOtp(codeInput.value))
const otpReady = computed(() => otpDigits.value.length === 6 && !attempts.value.locked)

/** Live-updating attempts label for the current e-mail. */
function attemptsText(): string {
  const left = attempts.value.attemptsLeft
  return copy('account.attempts_left', 'Attempts left: {n} of 5.').replace('{n}', String(left))
}

function setStatus(kind: 'info' | 'error' | 'success', text: string) {
  status.value = { kind, text }
}

/** Map a raw Supabase message onto an `account.*` i18n key when recognizable. */
function errKey(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('sms') || (m.includes('phone') && (m.includes('provider') || m.includes('not enabled')))) {
    return 'account.sms_not_configured'
  }
  if (m.includes('invalid') || m.includes('expired') || m.includes('token')) return 'account.invalid_code'
  if (m.includes('already') && (m.includes('registered') || m.includes('exists'))) return 'account.already_registered'
  if (m.includes('rate') || m.includes('too many')) return 'account.rate_limited'
  return 'account.error_generic'
}

function fail(res: { ok: false; error: string } | { ok: true }): boolean {
  if (res.ok) return false
  setStatus('error', copy(errKey(res.error), res.error))
  return true
}

// ── Registration / sign-in ──────────────────────────────────────────────────
async function sendCode() {
  const mail = email.value.trim()
  if (!mail || busy.value) return
  busy.value = true
  const res =
    tab.value === 'register' ? await store.registerWithEmail(mail) : await store.signInWithEmail(mail)
  busy.value = false
  if (fail(res)) return
  // A fresh code resets the (client-side) attempt counter.
  clearOtpAttempts(mail)
  attempts.value = { attemptsLeft: MAX_ATTEMPTS, locked: false }
  pending.value = 'email'
  codeInput.value = ''
  resendAt.value = Date.now() + RESEND_COOLDOWN_MS
  setStatus('info', copy('account.code_sent_6', 'We e-mailed you a 6-digit code — paste it below.'))
}

/** Close the code panel and go back to the e-mail step (fixes a stuck panel). */
function cancelOtp() {
  pending.value = 'none'
  codeInput.value = ''
  status.value = null
  attempts.value = { attemptsLeft: MAX_ATTEMPTS, locked: false }
}

async function verifyEmailCode() {
  const mail = email.value.trim()
  if (!mail || busy.value) return
  // Format gate: a mistyped code fails here without burning an attempt.
  if (!isWellFormedOtp(codeInput.value)) {
    setStatus('error', copy('account.code_invalid_format', 'Enter all 6 digits.'))
    return
  }
  if (attempts.value.locked) {
    setStatus('error', copy('account.locked', 'Too many attempts. Request a new code.'))
    return
  }
  busy.value = true
  const res = await store.verifyEmailOtp(mail, otpDigits.value)
  busy.value = false
  if (fail(res)) {
    // Register the failure client-side (UX deterrence; GoTrue enforces its own).
    attempts.value = registerOtpFailure(mail)
    setStatus(
      'error',
      attempts.value.locked
        ? copy('account.locked', 'Too many attempts. Request a new code.')
        : `${copy('account.invalid_code', 'The code is invalid or expired.')} ${attemptsText()}`
    )
    return
  }
  clearOtpAttempts(mail)
  await afterAuth()
}

async function afterAuth() {
  pending.value = 'none'
  codeInput.value = ''
  setStatus('success', copy('account.saved', 'Saved.'))
  if (nextUrl.value) await navigateTo(nextUrl.value)
}

// ── Profile editing (signed in) ─────────────────────────────────────────────
onMounted(async () => {
  await store.hydrate()
  if (store.isLoggedIn) {
    nameInput.value = store.user?.name ?? ''
    // E-mail link return: Supabase consumes the session from the URL
    // automatically — greet only when a session actually materialised.
    if (route.query.verified) {
      setStatus('success', copy('account.email_confirmed_banner', 'E-mail confirmed — welcome!'))
    }
    return
  }

  // Signed out, but the URL smells like an auth callback (PKCE code,
  // implicit tokens, or an expired/denied link). Wait briefly for the
  // session; if it never arrives, point the user at the code path instead
  // of pretending the link worked.
  const hasCallback = 'code' in route.query || 'verified' in route.query || isAuthHash(route.hash)
  if (!hasCallback) return

  setStatus('info', copy('account.signing_in', 'Signing you in…'))
  const sessionArrived = await waitForSession(4000)
  if (sessionArrived) {
    nameInput.value = store.user?.name ?? ''
    setStatus('success', copy('account.email_confirmed_banner', 'E-mail confirmed — welcome!'))
    if (nextUrl.value) await navigateTo(nextUrl.value)
  } else {
    setStatus('error', copy('account.link_failed', 'That link couldn’t complete sign-in — paste the code from the e-mail instead.'))
  }
})

/** Does the URL fragment carry Supabase implicit-flow tokens or an error? */
function isAuthHash(hash: string): boolean {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  return params.has('access_token') || params.has('error') || params.has('error_description')
}

/** Resolve once a session shows up (GoTrue consumes URL callbacks async). */
function waitForSession(timeoutMs: number): Promise<boolean> {
  if (store.isLoggedIn) return Promise.resolve(true)
  const started = Date.now()
  return new Promise((resolve) => {
    const id = setInterval(() => {
      if (store.isLoggedIn) {
        clearInterval(id)
        resolve(true)
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(id)
        resolve(false)
      }
    }, 250)
  })
}

async function saveName() {
  if (busy.value) return
  busy.value = true
  const res = await store.updateDisplayName(nameInput.value.trim())
  busy.value = false
  if (fail(res)) return
  setStatus('success', copy('account.saved', 'Saved.'))
}

async function startEmailChange() {
  const mail = newEmail.value.trim()
  if (!mail || busy.value) return
  busy.value = true
  const res = await store.updateEmail(mail)
  busy.value = false
  if (fail(res)) return
  pending.value = 'email_change'
  codeInput.value = ''
  resendAt.value = Date.now() + RESEND_COOLDOWN_MS
  setStatus('info', copy('account.confirmation_sent', 'Check your inbox — we sent you a confirmation link and code.'))
}

async function verifyEmailChangeCode() {
  const mail = newEmail.value.trim()
  if (!mail || codeInput.value.length < 6 || busy.value) return
  busy.value = true
  const res = await store.verifyEmailChange(mail, codeInput.value.trim())
  busy.value = false
  if (fail(res)) return
  newEmail.value = ''
  await afterAuth()
}

async function sendSms() {
  const phone = newPhone.value.replace(/[\s\-()]/g, '')
  if (!phone || busy.value) return
  busy.value = true
  const res = await store.updatePhone(phone)
  busy.value = false
  if (fail(res)) return
  pending.value = 'phone_change'
  codeInput.value = ''
  resendAt.value = Date.now() + RESEND_COOLDOWN_MS
  setStatus('info', copy('account.sms_sent', 'We sent an SMS code to your phone.'))
}

async function verifySmsCode() {
  const phone = newPhone.value.replace(/[\s\-()]/g, '')
  if (!phone || codeInput.value.length < 6 || busy.value) return
  busy.value = true
  const res = await store.verifyPhoneOtp(phone, codeInput.value.trim())
  busy.value = false
  if (fail(res)) return
  newPhone.value = ''
  await afterAuth()
}

async function onAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  avatarPreview.value = URL.createObjectURL(file)
  busy.value = true
  const res = await store.uploadAvatar(file)
  busy.value = false
  input.value = '' // allow re-selecting the same file
  if (fail(res)) {
    avatarPreview.value = ''
    return
  }
  setStatus('success', copy('account.saved', 'Saved.'))
}

async function removeAvatar() {
  if (busy.value) return
  busy.value = true
  const res = await store.removeAvatar()
  busy.value = false
  if (fail(res)) return
  avatarPreview.value = ''
  if (fileInput.value) fileInput.value.value = ''
  setStatus('success', copy('account.saved', 'Saved.'))
}

async function doSignOut() {
  await store.signOut()
  pending.value = 'none'
  nameInput.value = ''
  status.value = null
}
</script>

<template>
  <AppDialog
    :title="dialogTitle"
    :close-label="copy('account.close', 'Close')"
    @close="closeDialog"
  >
    <!-- Supabase not configured on this deployment -->
    <p v-if="!store.isAuthConfigured" class="rounded-xl bg-soft p-4 text-sm text-muted">
      {{ copy('account.auth_not_configured', 'Authentication is not configured on this deployment.') }}
    </p>

    <!-- ── Signed out: e-mail + password (verification postponed) ─────────── -->
    <div v-else-if="!store.isLoggedIn" class="space-y-4">
      <p class="text-xs text-faint">
        {{ copy('account.verification_postponed', 'E-mail verification is temporarily disabled.') }}
      </p>

      <div>
        <label for="account-email" class="block text-sm font-medium text-muted">
          {{ copy('account.email_label', 'E-mail') }}
        </label>
        <input
          id="account-email"
          v-model="email"
          type="email"
          autocomplete="email"
          :placeholder="copy('account.email_placeholder', 'you@example.com')"
          class="mt-1 w-full rounded-xl border border-edge bg-body px-3 py-2 text-content outline-none focus:border-accent"
        >
      </div>

      <div>
        <label for="account-password" class="block text-sm font-medium text-muted">
          {{ copy('account.password_label', 'Password') }}
        </label>
        <div class="relative mt-1">
          <input
            id="account-password"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            :autocomplete="tab === 'register' ? 'new-password' : 'current-password'"
            :placeholder="copy('account.password_placeholder', '••••••••')"
            class="w-full rounded-xl border border-edge bg-body px-3 py-2 pr-10 text-content outline-none focus:border-accent"
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

      <!-- POSTPONED: e-mail code verification (needs custom SMTP + {{ .Token }}).
           Restored by EMAIL_CODE_ENABLED = true in src/config/auth.ts. -->
      <div v-if="EMAIL_CODE_ENABLED && pending === 'email'" class="space-y-3 rounded-xl bg-soft p-4">
        <label for="account-code" class="block text-sm font-medium text-muted">
          {{ copy('account.code_label', 'Confirmation code') }}
        </label>
        <input
          id="account-code"
          :value="formatOtp(codeInput)"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="7"
          :placeholder="copy('account.code_placeholder', '123 456')"
          :disabled="attempts.locked"
          class="w-40 rounded-xl border border-edge bg-body px-3 py-2 font-code text-lg tracking-widest text-content outline-none focus:border-accent disabled:opacity-40"
          @input="codeInput = normalizeOtp(($event.target as HTMLInputElement).value)"
        >
        <p class="text-xs text-faint">{{ copy('account.codes_expire', 'Codes expire after about an hour.') }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition hover:bg-accent-strong disabled:opacity-40"
            :disabled="busy || !otpReady"
            @click="verifyEmailCode"
          >
            {{ copy('account.verify', 'Verify') }}
          </button>
          <button
            type="button"
            class="rounded-full border border-edge px-4 py-2 text-sm font-medium text-content transition hover:border-accent disabled:opacity-40"
            :disabled="busy || resendIn > 0"
            @click="sendCode"
          >
            {{ copy('account.resend_code', 'Resend code') }}<span v-if="resendIn > 0"> ({{ resendIn }}s)</span>
          </button>
          <button
            type="button"
            class="rounded-full px-4 py-2 text-sm font-medium text-muted transition hover:text-accent"
            @click="cancelOtp"
          >
            {{ copy('account.cancel', 'Cancel') }}
          </button>
        </div>
        <p v-if="attempts.locked" class="text-xs text-content">
          {{ copy('account.locked', 'Too many attempts. Request a new code.') }}
        </p>
        <p v-else-if="attempts.attemptsLeft < MAX_ATTEMPTS" class="text-xs text-faint">
          {{ attemptsText() }}
        </p>
      </div>
    </div>

    <!-- ── Signed in: profile editing ─────────────────────────────────────── -->
    <div v-else class="space-y-6">
      <h2 class="text-lg font-bold text-content">{{ copy('account.profile_title', 'Profile') }}</h2>

      <!-- Avatar -->
      <div class="flex flex-wrap items-center gap-4">
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
            class="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition hover:bg-accent-strong disabled:opacity-40"
            :disabled="busy"
            @click="fileInput?.click()"
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
        <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" @change="onAvatarChange">
      </div>

      <!-- Display name -->
      <div>
        <label for="account-name" class="block text-sm font-medium text-muted">
          {{ copy('account.name_label', 'Full name') }}
        </label>
        <input
          id="account-name"
          v-model="nameInput"
          type="text"
          autocomplete="name"
          class="mt-1 w-full rounded-xl border border-edge bg-body px-3 py-2 text-content outline-none focus:border-accent"
        >
        <button
          type="button"
          class="mt-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-on-accent transition hover:bg-accent-strong disabled:opacity-40"
          :disabled="busy"
          @click="saveName"
        >
          {{ copy('account.save', 'Save') }}
        </button>
      </div>

      <!-- E-mail (verified badge + change flow) -->
      <div class="space-y-2 border-t border-edge pt-4">
        <p class="text-sm text-muted">
          {{ copy('account.email_label', 'E-mail') }}:
          <span class="font-medium text-content">{{ store.user?.email }}</span>
          <span
            class="ml-2 rounded-full px-2 py-0.5 text-xs"
            :class="store.user?.emailVerified ? 'bg-accent-soft text-accent' : 'bg-soft text-faint'"
          >
            {{ copy(store.user?.emailVerified ? 'account.verified' : 'account.unverified', store.user?.emailVerified ? 'Verified' : 'Not verified') }}
          </span>
        </p>
        <!-- POSTPONED with the code flow: changing the e-mail needs the same
             confirmation mail (custom SMTP + {{ .Token }}). -->
        <div v-if="EMAIL_CODE_ENABLED" class="flex flex-wrap items-center gap-2">
          <input
            v-model="newEmail"
            type="email"
            autocomplete="email"
            :placeholder="copy('account.email_placeholder', 'you@example.com')"
            class="w-56 rounded-xl border border-edge bg-body px-3 py-2 text-sm text-content outline-none focus:border-accent"
          >
          <button
            type="button"
            class="rounded-full border border-edge px-4 py-2 text-sm font-medium text-content transition hover:border-accent hover:text-accent disabled:opacity-40"
            :disabled="busy || !newEmail"
            @click="startEmailChange"
          >
            {{ copy('account.change_email', 'Change e-mail') }}
          </button>
        </div>
        <p v-else class="text-xs text-faint">
          {{ copy('account.email_change_unavailable', 'Changing the e-mail is temporarily unavailable.') }}
        </p>
      </div>

      <!-- Phone (SMS verification) -->
      <div class="space-y-2 border-t border-edge pt-4">
        <p class="text-sm text-muted">
          {{ copy('account.phone_label', 'Phone number') }}:
          <span class="font-medium text-content">{{ store.user?.phone ?? '—' }}</span>
          <span
            class="ml-2 rounded-full px-2 py-0.5 text-xs"
            :class="store.user?.phoneVerified ? 'bg-accent-soft text-accent' : 'bg-soft text-faint'"
          >
            {{ copy(store.user?.phoneVerified ? 'account.verified' : 'account.unverified', store.user?.phoneVerified ? 'Verified' : 'Not verified') }}
          </span>
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <input
            v-model="newPhone"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            :placeholder="copy('account.phone_placeholder', '+40 7xx xxx xxx')"
            class="w-56 rounded-xl border border-edge bg-body px-3 py-2 text-sm text-content outline-none focus:border-accent"
          >
          <button
            type="button"
            class="rounded-full border border-edge px-4 py-2 text-sm font-medium text-content transition hover:border-accent hover:text-accent disabled:opacity-40"
            :disabled="busy || !newPhone"
            @click="sendSms"
          >
            {{ copy('account.change_phone', 'Change phone') }}
          </button>
        </div>
      </div>

      <!-- Shared OTP entry for e-mail change / phone change -->
      <div v-if="pending !== 'none'" class="space-y-2 rounded-xl bg-soft p-4">
        <label for="account-code" class="block text-sm font-medium text-muted">
          {{ copy('account.code_label', 'Confirmation code') }}
        </label>
        <input
          id="account-code"
          v-model="codeInput"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          :placeholder="copy('account.code_placeholder', '6-digit code')"
          class="w-40 rounded-xl border border-edge bg-body px-3 py-2 font-code text-lg tracking-widest text-content outline-none focus:border-accent"
        >
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition hover:bg-accent-strong disabled:opacity-40"
            :disabled="busy || codeInput.length < 6"
            @click="pending === 'email_change' ? verifyEmailChangeCode() : verifySmsCode()"
          >
            {{ copy('account.verify', 'Verify') }}
          </button>
          <button
            type="button"
            class="rounded-full border border-edge px-4 py-2 text-sm font-medium text-content transition hover:border-accent disabled:opacity-40"
            :disabled="busy || resendIn > 0"
            @click="pending === 'email_change' ? startEmailChange() : sendSms()"
          >
            {{ copy('account.resend_code', 'Resend code') }}<span v-if="resendIn > 0"> ({{ resendIn }}s)</span>
          </button>
        </div>
      </div>

      <button
        type="button"
        class="rounded-full border border-edge px-5 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-accent"
        @click="doSignOut"
      >
        {{ copy('account.sign_out', 'Sign out') }}
      </button>
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

    <!-- Bottom bar: Register / Sign in side by side (signed out only) -->
    <template v-if="!store.isLoggedIn" #footer>
      <button
        type="button"
        class="flex-1 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="busy || !email || password.length < 8"
        @click="submitAuth"
      >
        {{ copy(tab === 'register' ? 'account.tab_register' : 'account.tab_signin', tab === 'register' ? 'Register' : 'Sign in') }}
      </button>
      <button
        type="button"
        class="flex-1 rounded-full border border-edge px-4 py-2.5 text-sm font-medium text-content transition hover:border-accent hover:text-accent"
        @click="switchMode"
      >
        {{ copy(tab === 'register' ? 'account.tab_signin' : 'account.tab_register', tab === 'register' ? 'Sign in' : 'Create account') }}
      </button>
    </template>
  </AppDialog>
</template>
