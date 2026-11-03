// AppFooter — frozen to the bottom of the screen (sticky): one row of social
// links (Bluesky, Discord, YouTube, Reddit) from navigation.json and a Ko-Fi eBooks
// button, with the
// copyright line centered underneath on its own row.
<script setup lang="ts">
const { social } = useNavigation()
</script>

<template>
  <footer class="sticky bottom-0 z-40 border-t border-edge bg-chrome">
    <div class="app-container app-footer-inner flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5 py-3">
      <template v-for="(s, i) in social" :key="s.id">
        <a
          :href="s.url"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-2 rounded-full border border-transparent px-3 py-1 text-sm text-muted transition hover:border-accent hover:text-accent"
          :aria-label="s.label"
        >
          <SocialIcon :icon="s.icon" size-class="h-5 w-5" />
          <span class="hover-label hidden sm:inline">{{ s.label }}</span>
        </a>
        <template v-if="i === 1">
          <a
            href="https://ko-fi.com/eluchn/shop/languages"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Download eBooks on Ko-Fi"
            class="flex items-center gap-2 rounded-full border border-edge px-3 py-1 text-sm text-muted transition hover:border-accent hover:text-accent"
          >
            <SocialIcon icon="kofi" size-class="h-5 w-5" />
            <span class="hover-label hidden sm:inline">eBooks</span>
          </a>
        </template>
      </template>
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
