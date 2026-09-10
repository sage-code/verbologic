// English Roadmap — alphabet & pronunciation patterns with legacy IPA for Romanian speakers.
<script setup lang="ts">
const { lang: uiLang, setLocale, isLoaded } = useLocale()

onMounted(() => {
  if (!isLoaded()) void setLocale(uiLang.value)
})

const toggleUi = () => void setLocale(uiLang.value === 'en' ? 'ro' : 'en')
</script>

<template>
  <main class="mx-auto max-w-3xl px-6 py-12">
    <div class="flex items-center justify-between">
      <NuxtLink to="/" class="text-sm text-accent hover:underline">← Back</NuxtLink>
      <button
        type="button"
        class="rounded-full border border-edge px-3 py-1 text-xs font-medium text-muted hover:border-accent hover:text-accent"
        @click="toggleUi"
      >
        UI: {{ uiLang === 'en' ? 'English' : 'Română' }}
      </button>
    </div>

    <header class="mt-4">
      <h1 class="text-3xl font-bold text-content">English Roadmap</h1>
      <p class="mt-1 text-muted">
        74 letters, sound-spelling patterns and silent-letter clusters — each with IPA and a
        Romanian gloss.
      </p>
    </header>

    <section class="mt-8">
      <ExpressionSearch lang="en" />
    </section>
  </main>
</template>
