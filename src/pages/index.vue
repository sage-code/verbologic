// Temporary landing page — replaced as tracks/locales land in Phase 2.
<template>
  <main class="mx-auto max-w-3xl px-6 py-16">
    <h1 class="text-4xl font-extrabold tracking-tight text-accent">
      Verbologic
    </h1>
    <p class="mt-2 text-lg text-muted">Decoupled language learning platform.</p>

    <ul class="mt-8 space-y-3">
      <li>
        <NuxtLink
          to="/ro"
          class="inline-block rounded-lg bg-accent px-4 py-2 font-medium text-on-accent transition hover:bg-accent-strong"
        >
          Romanian roadmap (from English)
        </NuxtLink>
      </li>
      <li>
        <NuxtLink
          to="/en"
          class="inline-block rounded-lg bg-accent px-4 py-2 font-medium text-on-accent transition hover:bg-accent-strong"
        >
          English roadmap (from Romanian)
        </NuxtLink>
      </li>
    </ul>
  </main>
</template>
