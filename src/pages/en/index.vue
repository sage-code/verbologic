// English Roadmap — chapter/topic browser over the curriculum (RoadmapShell
// template: sidebar → topics → word table with sequential play-all).
<script setup lang="ts">
const copy = useCopy()
const { lang: uiLang, setLocale, isLoaded } = useLocale()
const { languageName } = useNavigation()

onMounted(() => {
  if (!isLoaded()) void setLocale(uiLang.value)
})

const toggleUi = () => void setLocale(uiLang.value === 'en' ? 'ro' : 'en')
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-4">
    <header class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl font-bold text-content">{{ copy('roadmap.en_title', 'English Roadmap') }}</h1>
        <p class="mt-0.5 text-sm text-muted">
          {{ copy('roadmap.en_intro', 'Browse the English curriculum chapter by chapter — words and expressions with pronunciation audio.') }}
        </p>
      </div>
      <!-- Meter slot: RoadmapShell teleports the two progress meters here -->
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
      <RoadmapShell lang="en" />
    </section>
  </main>
</template>
