// TermRow — MDC component for `::term{addresses="id1,id2"}` blocks: renders the
// referenced records as playable chips (term + IPA + audio). Rows resolve from
// the lecture page's provided payload rows; unknown ids are build-time errors
// (media-index) so a silent empty chip means the page payload is missing.
<script setup lang="ts">
import type { Ref } from 'vue'
import { LECTURE_ROWS_KEY } from '~/lib/lectureRows'
import type { MediaRow } from '~/types/media'

const props = defineProps<{ addresses?: string }>()

const { lang } = useLocale()
const rows = inject<Ref<Map<string, MediaRow>> | null>(LECTURE_ROWS_KEY, null)

const list = computed<MediaRow[]>(() => {
  const map = rows?.value
  if (!map) return []
  return (props.addresses ?? '')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)
    .map((id) => map.get(id))
    .filter((r): r is MediaRow => Boolean(r))
})
</script>

<template>
  <ul class="my-4 grid gap-2 sm:grid-cols-2">
    <li
      v-for="r in list"
      :key="r.entity_id"
      class="flex items-center gap-3 rounded-lg border border-edge bg-surface px-3 py-2"
    >
      <MediaViewer :src="r.media.url" :mime="r.media.mime" :label="r.term" />
      <span class="min-w-0">
        <span class="block font-medium text-content">{{ r.names[lang] || r.term }}</span>
        <span v-if="r.ipa" class="block font-code text-xs text-muted">{{ r.ipa }}</span>
      </span>
    </li>
  </ul>
</template>