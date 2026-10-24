// DbOfflineNotice — the full-page stand-in for a database-backed page while the
// backend is unreachable.
//
// Used by the Library and Profile pages: both are entirely account-backed, so
// there is nothing meaningful to render offline. Rather than showing an empty
// shell that looks broken, they render this instead — an explanation plus a
// route back to the parts of the site that still work.
//
// Practice is deliberately NOT gated: it runs on bundled data, so it stays
// available during an outage.
<script setup lang="ts">
import { ArrowPathIcon, ExclamationTriangleIcon, SparklesIcon } from '@heroicons/vue/24/outline'

defineProps<{
  /** Page name for the heading, e.g. "Library". */
  page: string
}>()

const copy = useCopy()
const { checking, check } = useDbStatus()

async function retry() {
  await check(true)
}
</script>

<template>
  <main class="mx-auto w-full max-w-2xl">
    <div class="rounded-2xl border border-edge bg-surface p-8 text-center">
      <ExclamationTriangleIcon class="mx-auto h-10 w-10 text-accent" aria-hidden="true" />
      <h1 class="mt-4 text-2xl font-bold text-content">
        {{ copy('status.page_unavailable', '{page} is unavailable').replace('{page}', page) }}
      </h1>
      <p class="mt-2 text-muted">
        {{ copy('status.db_offline', 'Database offline for maintenance.') }}
        {{ copy('status.page_unavailable_detail', 'This page needs the database, so it is paused until the connection returns. Your progress is safe.') }}
      </p>

      <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-semibold text-on-accent transition hover:bg-accent-strong disabled:opacity-50"
          :disabled="checking"
          @click="retry"
        >
          <ArrowPathIcon class="h-5 w-5" :class="{ 'animate-spin': checking }" aria-hidden="true" />
          {{ checking ? copy('status.checking', 'Checking…') : copy('status.retry', 'Retry') }}
        </button>
        <NuxtLink
          to="/practice"
          class="inline-flex items-center gap-2 rounded-full border border-edge px-5 py-2.5 font-medium text-content transition hover:border-accent hover:text-accent"
        >
          <SparklesIcon class="h-5 w-5" aria-hidden="true" />
          {{ copy('status.go_practice', 'Practice still works') }}
        </NuxtLink>
      </div>
    </div>
  </main>
</template>
