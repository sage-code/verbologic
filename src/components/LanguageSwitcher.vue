// LanguageSwitcher — dropdown listing the 9 interface languages (flag + constant code + localized name).
<script setup lang="ts">
import { ChevronDownIcon } from '@heroicons/vue/20/solid'
import type { LocaleCode } from '~/composables/useLocale'

const { languages, languageName } = useNavigation()
const { lang, setLocale, t } = useLocale()
const open = ref(false)

const current = computed(() => languages.find((l) => l.locale === lang.value) ?? languages[0])

async function select(locale: string) {
  open.value = false
  await setLocale(locale as LocaleCode)
}

// Close when clicking outside.
const root = ref<HTMLElement | null>(null)
function onDocClick(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-full bg-surface px-1.5 py-0.5 text-sm font-medium text-content transition hover:bg-soft"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-label="t('ui.change_language') ?? 'Change language'"
      @click="open = !open"
    >
      <LanguageFlag :code="current.flag" :label="languageName(current.locale)" size="md" />
      <span class="font-semibold tracking-wide">{{ current.code }}</span>
      <ChevronDownIcon class="h-4 w-4" />
    </button>

    <ul
      v-if="open"
      class="absolute right-0 z-50 mt-2 max-h-72 w-56 overflow-auto rounded-xl border border-edge bg-surface py-1 text-content shadow-lg"
      role="listbox"
    >
      <li v-for="l in languages" :key="l.code">
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-accent-soft hover:text-accent"
          :class="{ 'bg-accent-soft font-semibold text-accent': l.locale === lang }"
          role="option"
          :aria-selected="l.locale === lang"
          @click="select(l.locale)"
        >
          <LanguageFlag :code="l.flag" :label="languageName(l.locale)" size="md" />
          <span class="font-semibold tracking-wide text-faint">{{ l.code }}</span>
          <span class="ml-1 truncate">{{ languageName(l.locale) }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
