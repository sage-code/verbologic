// English Roadmap — alphabet & pronunciation patterns with legacy IPA for Romanian speakers.
<script setup lang="ts">
const copy = useCopy()
const { t, lang: uiLang, setLocale, isLoaded } = useLocale()

onMounted(() => {
  if (!isLoaded()) void setLocale(uiLang.value)
})

const toggleUi = () => void setLocale(uiLang.value === 'en' ? 'ro' : 'en')
</script>

<template>
  <main class="mx-auto max-w-3xl px-6 py-12">
    <div class="flex items-center justify-between">
      <NuxtLink to="/" class="text-sm text-accent hover:underline">← {{ copy('ui.back', 'Back') }}</NuxtLink>
      <button
        type="button"
        class="rounded-full border border-edge px-3 py-1 text-xs font-medium text-muted hover:border-accent hover:text-accent"
        @click="toggleUi"
      >
        {{ copy('roadmap.ui_label', 'UI:') }} {{ t(`languages.${uiLang}`) ?? (uiLang === 'en' ? 'English' : 'Română') }}
      </button>
    </div>

    <header class="mt-4">
      <h1 class="text-3xl font-bold text-content">{{ copy('roadmap.en_title', 'English Roadmap') }}</h1>
      <p class="mt-1 text-muted">
        {{ copy('roadmap.en_intro', '74 letters, sound-spelling patterns and silent-letter clusters — each with IPA and a Romanian gloss.') }}
      </p>
    </header>

    <section class="mt-8">
      <ExpressionSearch lang="en" />
    </section>
  </main>
</template>
