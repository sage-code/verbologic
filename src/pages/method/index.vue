// Method — the Verbologic learning approach; hosts the system-features overview
// moved off the homepage. The full method write-up lands with Phase 3 content.
<script setup lang="ts">
import type { Component } from 'vue'
import { ChartBarIcon, ClockIcon, SparklesIcon } from '@heroicons/vue/24/outline'

const { lang, setLocale, isLoaded } = useLocale()
const copy = useCopy()

const FEATURES: { key: string; icon: Component; title: string; desc: string }[] = [
  {
    key: 'ai',
    icon: SparklesIcon,
    title: 'AI Context Engines',
    desc: 'Every expression is learned in context, never in isolation.'
  },
  {
    key: 'srs',
    icon: ClockIcon,
    title: 'Spaced Repetition',
    desc: 'Adaptive review scheduling locks vocabulary into long-term memory.'
  },
  {
    key: 'analytics',
    icon: ChartBarIcon,
    title: 'Precision Analytics',
    desc: 'Progress tracked letter by letter, word by word.'
  }
]

// Preload UI chrome on the client (mirrors the track pages).
onMounted(() => {
  if (!isLoaded()) void setLocale(lang.value)
})
</script>

<template>
  <main class="mx-auto max-w-3xl">
    <h1 class="text-3xl font-bold text-content">{{ copy('method.title', 'Method') }}</h1>
    <p class="mt-2 text-muted">
      {{ copy('method.intro', 'Contextual acquisition and adaptive spaced repetition — the full method write-up is on its way. Until then, browse the Romanian and English roadmaps, already fully searchable.') }}
    </p>

    <!-- System features -->
    <section class="py-10 sm:py-14">
      <h2 class="text-center text-2xl font-bold text-content sm:text-3xl">
        {{ copy('method.features_title', 'System features') }}
      </h2>
      <p class="mx-auto mt-2 max-w-xl text-center text-muted">
        {{ copy('method.features_subtitle', 'Built for acquisition that sticks.') }}
      </p>
      <div class="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div v-for="f in FEATURES" :key="f.key" class="rounded-2xl border border-edge bg-surface p-6">
          <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <component :is="f.icon" class="h-6 w-6" aria-hidden="true" />
          </span>
          <h3 class="mt-4 text-lg font-bold text-content">{{ copy(`method.feature_${f.key}_title`, f.title) }}</h3>
          <p class="mt-1 text-sm text-muted">{{ copy(`method.feature_${f.key}_desc`, f.desc) }}</p>
        </div>
      </div>
    </section>
  </main>
</template>
