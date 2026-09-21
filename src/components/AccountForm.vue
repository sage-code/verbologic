// AccountForm — one self-contained form, three modes: create account /
// sign in (passwordless e-mail OTP + magic link) and profile edit (display
// name, avatar upload, e-mail change, phone number with SMS verification).
// Verification state is read from the session; errors map to i18n keys with
// the raw Supabase message as the fallback.
<script setup lang="ts">
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
const RESEND_COOLDOWN_MS = 30_000

// 1s ticker only while mounted — drives the resend cooldown label.
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  ticker = setInterval(() => (now.value = Date.now()), 1000)
})
onBeforeUnmount(() => clearInterval(ticker))
const resendIn = computed(() => Math.max(0, Math.ceil((resendAt.value - now.value) / 1000)))

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
  pending.value = 'email'
  codeInput.value = ''
  resendAt.value = Date.now() + RESEND_COOLDOWN_MS
  setStatus('info', copy('account.confirmation_sent', 'Check your inbox — we sent you a confirmation link and code.'))
}

async function verifyEmailCode() {
  const mail = email.value.trim()
  if (!mail || codeInput.value.length < 6 || busy.value) return
  busy.value = true
  const res = await store.verifyEmailOtp(mail, codeInput.value.trim())
  busy.value = false
  if (fail(res)) return
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
  if (store.isLoggedIn) nameInput.value = store.user?.name ?? ''
  // Magic-link return: Supabase consumes the session from the URL hash
  // automatically; surface the confirmed state from ?verified=1.
  if (route.query.verified) {
    setStatus('success', copy('account.email_confirmed_banner', 'E-mail confirmed — welcome!'))
  }
})

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
  <section class="rounded-2xl border border-edge bg-surface p-6">
    <!-- Supabase not configured on this deployment -->
    <p v-if="!store.isAuthConfigured" class="rounded-xl bg-soft p-4 text-sm text-muted">
      {{ copy('account.auth_not_configured', 'Authentication is not configured on this deployment.') }}
    </p>

    <!-- ── Signed out: create account / sign in ───────────────────────────── -->
    <div v-else-if="!store.isLoggedIn" class="space-y-6">
      <div class="flex gap-2" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'register'"
          class="rounded-full px-4 py-2 text-sm font-semibold transition"
          :class="tab === 'register' ? 'bg-accent text-on-accent' : 'bg-soft text-muted hover:text-accent'"
          @click="tab = 'register'"
        >
          {{ copy('account.tab_register', 'Create account') }}
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'signin'"
          class="rounded-full px-4 py-2 text-sm font-semibold transition"
          :class="tab === 'signin' ? 'bg-accent text-on-accent' : 'bg-soft text-muted hover:text-accent'"
          @click="tab = 'signin'"
        >
          {{ copy('account.tab_signin', 'Sign in') }}
        </button>
      </div>

      <div class="space-y-4">
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

        <button
          type="button"
          class="w-full rounded-full bg-accent px-5 py-2.5 font-semibold text-on-accent transition hover:bg-accent-strong disabled:opacity-40"
          :disabled="busy || !email"
          @click="sendCode"
        >
          {{ copy('account.send_code', 'Send code') }}
        </button>

        <!-- Shared OTP entry for register / sign-in -->
        <div v-if="pending === 'email'" class="space-y-3 rounded-xl bg-soft p-4">
          <p class="text-sm text-muted">{{ copy('account.or_use_link', 'or click the link we e-mailed you') }}</p>
          <input
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
          </div>
        </div>
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
        <div class="flex flex-wrap items-center gap-2">
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
  </section>
</template>
