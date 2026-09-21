// AppFooter — centered social links (Bluesky, Discord, YouTube, Reddit) from navigation.json.
<script setup lang="ts">
const { social } = useNavigation()
</script>

<template>
  <footer class="border-t border-edge bg-surface">
    <div class="app-container py-8">
      <div class="flex items-center justify-center gap-6">
        <a
          v-for="s in social"
          :key="s.id"
          :href="s.url"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-2 text-sm text-muted transition hover:text-accent"
          :aria-label="s.label"
        >
          <SocialIcon :icon="s.icon" size-class="h-6 w-6" />
          <span class="hover-label hidden sm:inline">{{ s.label }}</span>
        </a>
      </div>
      <p class="mt-6 text-center text-xs text-faint">
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
