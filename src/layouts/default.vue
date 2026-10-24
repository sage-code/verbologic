// Default layout — the app frame: frozen header, page, frozen footer.
// The frame's width per device/orientation lives in layout.css (.app-frame).
//
// The database-status banner sits between the header and the page so an outage
// is visible on every route, not just the ones that happen to query content.
// The probe runs once on mount (client-only — the prerendered HTML must never
// bake in a status).
<script setup lang="ts">
const { check } = useDbStatus()

onMounted(() => {
  void check()
})
</script>

<template>
  <div class="app-frame text-content antialiased">
    <AppHeader />

    <DbStatusBanner />

    <div class="app-main">
      <slot />
    </div>

    <AppFooter />
  </div>
</template>
