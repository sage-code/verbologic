// Practice — placeholder hub for the upcoming practice modes: speaking with an
// AI Mentor, exercises and games. The cards are data-driven from the practice
// sidebars (src/data/sidebars/practice/*/sidebar.json — build-inlined, like
// navigation.json); the modes land here in later phases (credit_ledger
// 'ai_mentor' spend, quiz_results / QuizEngine).
<script setup lang="ts">
import type { Component } from 'vue'
import { ChatBubbleLeftRightIcon, PencilSquareIcon, PuzzlePieceIcon } from '@heroicons/vue/24/outline'
import { mediaName } from '~/composables/useMedia'
import type { Sidebar } from '~/types/sidebars'

const copy = useCopy()
const { lang, setLocale, isLoaded } = useLocale()
const { practice } = useSidebars()

// Preload UI chrome on the client (mirrors the other pages).
onMounted(() => {
  if (!isLoaded()) void setLocale(lang.value)
})

/** Card icon per practice sidebar id. */
const ICONS: Record<string, Component> = {
  'practice/mentors': ChatBubbleLeftRightIcon,
  'practice/exercises': PencilSquareIcon,
  'practice/games': PuzzlePieceIcon
}

/** The practice modes come from the sidebars — no hardcoding. */
const MODES = practice()

const titleOf = (sidebar: Sidebar) => mediaName(sidebar.names, lang.value, sidebar.id)
const descriptionOf = (sidebar: Sidebar) =>
  sidebar.descriptions ? sidebar.descriptions[lang.value] || sidebar.descriptions.en || '' : ''
</script>

<template>
  <main class="mx-auto max-w-4xl">
    <h1 class="text-3xl font-bold text-content">{{ copy('practice.title', 'Practice') }}</h1>
    <p class="mt-2 text-muted">
      {{ copy('practice.intro', 'Speak with an AI mentor, do exercises, play games.') }}
    </p>

    <!-- Planned modes — preview cards driven by the practice sidebars -->
    <ul class="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <li
        v-for="mode in MODES"
        :key="mode.id"
        class="rounded-2xl border border-edge bg-surface p-6"
      >
        <component :is="ICONS[mode.id]" class="h-8 w-8 text-accent" aria-hidden="true" />
        <h2 class="mt-3 text-lg font-bold text-content">{{ titleOf(mode) }}</h2>
        <p class="mt-1 text-sm text-muted">{{ descriptionOf(mode) }}</p>
        <span class="mt-4 inline-block rounded-full bg-soft px-3 py-1 text-xs font-semibold text-faint">
          {{ copy('practice.coming_soon', 'Coming soon') }}
        </span>
      </li>
    </ul>
  </main>
</template>