// Homepage — hero only; language selection lives in the Library (Add Language
// dialog), system features on /method.
<script setup lang="ts">
import { SparklesIcon } from '@heroicons/vue/24/outline'

const { lang, setLocale, isLoaded } = useLocale()
const copy = useCopy()

// Preload UI chrome on the client (mirrors the track pages).
onMounted(() => {
  if (!isLoaded()) void setLocale(lang.value)
})
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="py-14 text-center sm:py-20">
      <p
        class="inline-flex items-center gap-2 rounded-full bg-accent-soft px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-accent"
      >
        <SparklesIcon class="h-4 w-4" aria-hidden="true" />
        {{ copy('home.eyebrow', 'AI-powered language learning') }}
      </p>
      <h1 class="mx-auto mt-6 max-w-3xl text-4xl font-extrabold tracking-tight text-content sm:text-6xl">
        {{ copy('home.hero_title', 'Master Vocabulary in Context') }}
      </h1>
      <p class="mx-auto mt-4 max-w-2xl text-lg text-muted sm:text-xl">
        {{ copy('home.hero_subtitle', 'Accelerate retention with interactive AI Mentors and visual anchors.') }}
      </p>
      <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
        <NuxtLink
          to="/library"
          class="rounded-full border border-edge bg-surface px-6 py-3 font-semibold text-content transition hover:border-accent hover:bg-accent hover:text-on-accent hover:shadow-sm"
        >
          {{ copy('home.cta_start', 'Get Started Free') }}
        </NuxtLink>
        <NuxtLink
          to="/method"
          class="rounded-full border border-edge bg-surface px-6 py-3 font-medium text-content transition hover:border-accent hover:text-accent"
        >
          {{ copy('home.cta_method', 'How It Works') }}
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

