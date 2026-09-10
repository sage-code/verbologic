// Romanian Roadmap — browser over vocabulary, phrases, Q&A drills, greetings and alphabet.
<script setup lang="ts">
const { lang: uiLang, setLocale, isLoaded } = useLocale()

// Preload UI chrome when the page is rendered on the client.
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
      <h1 class="text-3xl font-bold text-content">Romanian Roadmap</h1>
      <p class="mt-1 text-muted">
        532 searchable entities across vocabulary, phrases, Q&A drills, greetings and the
        alphabet — with 464 pronunciation clips served from media.verbologic.com.
      </p>
    </header>

    <section class="mt-8">
      <ExpressionSearch lang="ro" />
    </section>
  </main>
</template>
