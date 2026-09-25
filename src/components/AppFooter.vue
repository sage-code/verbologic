// AppFooter — frozen to the bottom of the screen (sticky): one row of social
// links (Bluesky, Discord, YouTube, Reddit) from navigation.json, with the
// copyright line centered underneath on its own row.
<script setup lang="ts">
const { social } = useNavigation()
</script>

<template>
  <footer class="sticky bottom-0 z-40 border-t border-edge bg-chrome">
    <div class="app-container app-footer-inner flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5 py-3">
      <a
        v-for="s in social"
        :key="s.id"
        :href="s.url"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-2 text-sm text-muted transition hover:text-accent"
        :aria-label="s.label"
      >
        <SocialIcon :icon="s.icon" size-class="h-5 w-5" />
        <span class="hover-label hidden sm:inline">{{ s.label }}</span>
      </a>
      <!-- w-full wraps it onto its own centered row under the buttons -->
      <p class="w-full text-center text-xs text-faint">
        © 2026
        <a
          href="https://sagecode.org"
          target="_blank"
          rel="noopener noreferrer"
          class="transition hover:text-accent"
        >Sage-Code Laboratory</a>
      </p>
    </div>
  </footer>
</template>

<style scoped>
@media (max-width: 640px) {
  .hover-label {
    display: none;
  }
}
</style>
