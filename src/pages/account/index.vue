// Account — registration / sign-in / profile editing (passwordless OTP).
// Prerendered shell; all auth state resolves client-side in <AccountForm />.
// Query params: ?next=/pricing resumes an interrupted flow, ?verified=1 is
// the e-mail-confirmation redirect target.
<script setup lang="ts">
const copy = useCopy()
const { lang, setLocale, isLoaded } = useLocale()

// Preload UI chrome on the client (mirrors the other pages).
onMounted(() => {
  if (!isLoaded()) void setLocale(lang.value)
})
</script>

<template>
  <main class="mx-auto max-w-xl">
    <header>
      <h1 class="text-3xl font-bold text-content">{{ copy('account.title', 'Account') }}</h1>
      <p class="mt-2 text-muted">
        {{ copy('account.subtitle', 'Create an account or manage your profile.') }}
      </p>
    </header>

    <AccountForm class="mt-8" />
  </main>
</template>
