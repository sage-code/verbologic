// Default layout — responsive app shell: header (with nav), page, footer.
<template>
  <div class="flex min-h-screen flex-col bg-body text-content antialiased">
    <AppHeader />

    <div class="app-container w-full flex-1 py-5">
      <main class="app-main mt-2">
        <slot />
      </main>
    </div>

    <AppFooter />
  </div>
</template>
