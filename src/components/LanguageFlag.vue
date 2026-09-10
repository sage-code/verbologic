// LanguageFlag — real SVG flag (flag-icons) bundled at build time.
<script setup lang="ts">
// The 9 language codes shipped in navigation.json, mapped to flag-icons SVGs.
import usFlag from 'flag-icons/flags/4x3/us.svg'
import roFlag from 'flag-icons/flags/4x3/ro.svg'
import deFlag from 'flag-icons/flags/4x3/de.svg'
import ruFlag from 'flag-icons/flags/4x3/ru.svg'
import itFlag from 'flag-icons/flags/4x3/it.svg'
import esFlag from 'flag-icons/flags/4x3/es.svg'
import frFlag from 'flag-icons/flags/4x3/fr.svg'
import huFlag from 'flag-icons/flags/4x3/hu.svg'
import ptFlag from 'flag-icons/flags/4x3/pt.svg'

const FLAGS: Record<string, string> = {
  us: usFlag,
  ro: roFlag,
  de: deFlag,
  ru: ruFlag,
  it: itFlag,
  es: esFlag,
  fr: frFlag,
  hu: huFlag,
  pt: ptFlag
}

const props = withDefaults(
  defineProps<{ code: string; label?: string; size?: 'sm' | 'md' }>(),
  { label: '', size: 'sm' }
)

const src = computed(() => FLAGS[props.code] ?? '')
const box = computed(() =>
  props.size === 'md' ? 'h-7 w-9' : 'h-4 w-6'
)
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[3px] ring-1 ring-black/10"
    :class="box"
  >
    <img
      v-if="src"
      :src="src"
      :alt="label || code.toUpperCase()"
      :title="label || code.toUpperCase()"
      class="h-full w-full object-cover"
      loading="lazy"
    >
    <span v-else class="rounded bg-edge px-1 text-[10px] font-bold text-muted">{{ code }}</span>
  </span>
</template>
