// About — brief platform description; all copy localized via public/data/locales/*.json.
<script setup lang="ts">
const copy = useCopy()
const { lang, setLocale, isLoaded } = useLocale()

// Preload UI chrome on the client (mirrors the other pages).
onMounted(() => {
  if (!isLoaded()) void setLocale(lang.value)
})
</script>

<template>
  <main class="mx-auto max-w-3xl">
    <h1 class="text-3xl font-bold text-content">{{ copy('about.title', 'About Verbologic') }}</h1>
    <p class="mt-2 text-muted">
      {{ copy('about.p1', 'Verbologic is a decoupled, O(N)-scaling language-learning platform: static entity data, edge-delivered audio, instant client-side search, and an agentic dual-LLM build workflow.') }}
    </p>
    <p class="mt-2 text-muted">
      {{ copy('about.p2', '532 Romanian & English entities recovered from the legacy roadmaps are already live in the searchable tracks.') }}
    </p>
  </main>
</template>
