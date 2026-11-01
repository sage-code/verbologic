/**
 * theme.client.ts — applies the persisted theme before the app paints.
 * Runs client-side only; toggling writes ../data + localStorage.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const stored = localStorage.getItem('verbologic-theme')
  if (stored !== 'dark' && stored !== 'light') return
  document.documentElement.dataset.theme = stored
  // The static page is built with the 'light' default; once hydrated, bring the shared state
  // (read by the account dialog and the profile page toggles) in line with the saved choice.
  nuxtApp.hook('app:mounted', () => {
    useState<'light' | 'dark'>('app-theme').value = stored
  })
})
