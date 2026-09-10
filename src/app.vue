// Root Vue entry — mounts the page router with a global loading bar.
<template>
  <div class="min-h-screen bg-body text-content antialiased">
    <NuxtLoadingIndicator color="#3b6ee0" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
