/**
 * theme.client.ts — applies the persisted theme before the app paints.
 * Runs client-side only; toggling writes ../data + localStorage.
 */
export default defineNuxtPlugin(() => {
  const stored = localStorage.getItem('verbologic-theme')
  if (stored === 'dark' || stored === 'light') {
    document.documentElement.dataset.theme = stored
  }
})
