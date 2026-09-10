import { fileURLToPath } from 'node:url'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-09-09',
  devtools: { enabled: true },

  // Full static-site generation: `nuxt generate` pre-renders every route.
  ssr: true,
  nitro: {
    prerender: {
      routes: ['/']
    }
  },

  // Source lives under src/ (app.vue, pages, components, stores, lib) — content/ and
  // public/ remain at the repo root per the decoupled O(N) architecture.
  srcDir: 'src/',
  dir: {
    // Absolute path keeps public/ at the repo root even with a custom srcDir.
    public: fileURLToPath(new URL('./public', import.meta.url))
  },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Verbologic — Foreign Language Learning',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content:
            'An enterprise-grade, decoupled platform for foreign language learning with instant client-side search.'
        }
      ],
      // Google Fonts — typography system, see src/assets/css/tailwind.css.
      // display=swap avoids invisible text while webfonts load; each family's
      // cyrillic (RU) and latin-ext (HU 'ő'/'ű') subsets are served on demand
      // via unicode-range @font-face blocks in the css2 response.
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Plus+Jakarta+Sans:wght@600&family=Space+Grotesk:wght@700&display=swap'
        }
      ]
    }
  },

  modules: ['@pinia/nuxt', '@nuxtjs/tailwindcss'],

  // Tailwind entrypoint — utility-first styling for all components.
  css: [
    '~/assets/css/tailwind.css',
    '~/assets/css/themes.css',
    '~/assets/css/layout.css'
  ]
})
