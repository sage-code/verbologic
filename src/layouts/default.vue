// Default layout — the app frame: frozen header, page, frozen footer.
// The frame's width per device/orientation lives in layout.css (.app-frame).
<template>
  <div class="app-frame text-content antialiased">
    <AppHeader />

    <div class="app-main">
      <slot />
    </div>

    <AppFooter />
  </div>
</template>
