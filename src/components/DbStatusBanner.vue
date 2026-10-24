// DbStatusBanner — the "database offline for maintenance" notice.
//
// Shown at the top of the page whenever useDbStatus() reports the backend
// unreachable. It is deliberately loud (accent border, full width) because the
// consequence is real: the dictionary falls back to the bundled English data,
// and the Library and Profile pages are disabled until the database returns.
//
// Practice stays available — it runs on bundled data — so the banner says so,
// otherwise the outage reads as "the whole site is broken".
//
// Client-only: the prerendered HTML must never bake in a status, or a build
// made while the database was down would ship "offline" to everyone.
<script setup lang="ts">
import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/vue/24/outline'

const copy = useCopy()
const { isOffline, checking, check } = useDbStatus()

async function retry() {
  await check(true)
}
</script>

<template>
  <div
    v-if="isOffline"
    class="border-b border-accent/40 bg-accent-soft"
    role="alert"
    aria-live="assertive"
  >
    <div class="app-container flex flex-wrap items-center gap-3 py-2.5">
      <ExclamationTriangleIcon class="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
      <p class="min-w-0 flex-1 text-sm font-medium text-content">
        {{ copy('status.db_offline', 'Database offline for maintenance.') }}
        <span class="font-normal text-muted">
          {{ copy('status.db_offline_detail', 'The dictionary is showing the built-in English content. Library and Profile are unavailable; Practice still works.') }}
        </span>
      </p>
      <button
        type="button"
        class="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/50 px-3 py-1.5 text-sm font-semibold text-accent transition hover:bg-accent hover:text-on-accent disabled:opacity-50"
        :disabled="checking"
        @click="retry"
      >
        <ArrowPathIcon class="h-4 w-4" :class="{ 'animate-spin': checking }" aria-hidden="true" />
        {{ checking ? copy('status.checking', 'Checking…') : copy('status.retry', 'Retry') }}
      </button>
    </div>
  </div>
</template>
