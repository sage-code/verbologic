// Method — the Verbologic learning approach. Three panels, each the entry
// point to the part of the product that delivers it: Practice (context
// learning), Library (the native-audio dictionary) and Profile (progress
// tracking, which requires an account).
<script setup lang="ts">
import type { Component } from 'vue'
import {
  ArrowRightIcon,
  BuildingLibraryIcon,
  SparklesIcon,
  UserCircleIcon
} from '@heroicons/vue/24/outline'

const { lang, setLocale, ensureLocale } = useLocale()
const copy = useCopy()

/** The three panels — each one links to the page that delivers it. */
const PANELS: {
  key: string
  icon: Component
  to: string
  title: string
  desc: string
}[] = [
  {
    key: 'practice',
    icon: SparklesIcon,
    to: '/practice',
    title: 'Context Learning',
    desc: 'Words stick when they live inside a sentence and a situation. Every expression is taught in context, so you can remember it and use it.'
  },
  {
    key: 'library',
    icon: BuildingLibraryIcon,
    to: '/library',
    title: 'Audio Dictionary',
    desc: 'Hear a word before you read it. Every term has a native voice, so the ear learns the sound first and the eyes learn the spelling second.'
  },
  {
    key: 'profile',
    icon: UserCircleIcon,
    to: '/profile',
    title: 'Progress Tracking',
    desc: 'Memory grows through repetition. Listen to a term five times to mark it learned and follow your chapter progress.'
  }
]

// Preload UI chrome on the client (mirrors the track pages).
onMounted(() => {
  void ensureLocale()
})
</script>

<template>
  <main class="mx-auto max-w-4xl">
    <h1 class="text-center text-3xl font-bold text-content">{{ copy('method.title', 'Method') }}</h1>
    <p class="mt-2 text-center text-muted">
      {{ copy('method.intro', 'Contextual acquisition with native audio in nine languages. Pick a panel below to start.') }}
    </p>

    <!-- Three panels: the method, and where each part of it lives. -->
    <section class="py-8 sm:py-10">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <NuxtLink
          v-for="panel in PANELS"
          :key="panel.key"
          :to="panel.to"
          class="group flex flex-col rounded-2xl border border-edge bg-surface p-6 transition hover:border-accent"
        >
          <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <component :is="panel.icon" class="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 class="mt-4 text-lg font-bold text-content">
            {{ copy(`method.panel_${panel.key}_title`, panel.title) }}
          </h2>
          <p class="mt-1 flex-1 text-sm text-muted">
            {{ copy(`method.panel_${panel.key}_desc`, panel.desc) }}
          </p>
          <span class="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent">
            {{ copy('method.panel_open', 'Open') }}
            <ArrowRightIcon class="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </NuxtLink>
      </div>
    </section>
  </main>
</template>
