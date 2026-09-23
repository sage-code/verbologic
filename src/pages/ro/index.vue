// Romanian Roadmap — chapter/topic browser over the curriculum (RoadmapShell
// template: sidebar → topics → word table with sequential play-all).
<script setup lang="ts">
const copy = useCopy()
const { lang: uiLang, setLocale, isLoaded } = useLocale()
const { languageName } = useNavigation()

// Preload UI chrome when the page is rendered on the client.
onMounted(() => {
  if (!isLoaded()) void setLocale(uiLang.value)
})

const toggleUi = () => void setLocale(uiLang.value === 'en' ? 'ro' : 'en')
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-4">
    <header class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl font-bold text-content">{{ copy('roadmap.ro_title', 'Romanian Roadmap') }}</h1>
        <p class="mt-0.5 text-sm text-muted">
          {{ copy('roadmap.ro_intro', 'Browse the Romanian curriculum chapter by chapter — words and expressions with pronunciation audio.') }}
        </p>
      </div>
      <!-- Meter slot: DictionaryLayout teleports its two progress meters here -->
      <div class="hidden flex-1 justify-end sm:flex">
        <div id="track-meters" class="flex w-1/2 items-end gap-4" />
      </div>
      <button
        type="button"
        class="shrink-0 rounded-full border border-edge px-3 py-1 text-xs font-medium text-muted hover:border-accent hover:text-accent"
        @click="toggleUi"
      >
        {{ copy('roadmap.ui_label', 'UI:') }} {{ languageName(uiLang) }}
      </button>
    </header>

    <section class="mt-3">
      <RoadmapShell lang="ro" />
    </section>
  </main>
</template>
