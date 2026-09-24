// Root Vue entry — mounts the page router with a global loading bar. The
// backdrop is only visible as the unused margins beside the portrait-ratio
// frame on large landscape screens (layout.css).
<template>
  <div class="app-backdrop text-content antialiased">
    <NuxtLoadingIndicator color="#3b6ee0" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
