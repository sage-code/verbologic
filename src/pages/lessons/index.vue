// Lessons — placeholder hub; structured lessons land in Phase 3 (@nuxt/content).
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
    <h1 class="text-3xl font-bold text-content">{{ copy('lessons.title', 'Lessons') }}</h1>
    <p class="mt-2 text-muted">
      {{ copy('lessons.intro', 'Structured lessons land in Phase 3. Until then, browse the Romanian and English roadmaps — already fully searchable.') }}
    </p>
  </main>
</template>
