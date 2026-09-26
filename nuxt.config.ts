import { fileURLToPath } from 'node:url'
import navigation from './src/data/navigation.json'
import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Enumerate the prerendered article routes from the content tree —
 * content/<track>/<trackLang>/<TOPIC>/<ID>/<locale>.md (one route per
 * explanation-locale doc, so each renders at build time). ANY track can host
 * article topics, so every first-level content folder is a track. Read with
 * plain fs (no module dependency): nuxt.config.ts already imports
 * build-inlined JSON the same way.
 */
function contentDocRoutes(): string[] {
  const root = fileURLToPath(new URL('./content', import.meta.url))
  if (!existsSync(root)) return []
  const routes: string[] = []
  for (const track of readdirSync(root, { withFileTypes: true })) {
    if (!track.isDirectory()) continue
    const trackLangs = join(root, track.name)
    for (const trackLang of readdirSync(trackLangs, { withFileTypes: true })) {
      if (!trackLang.isDirectory()) continue
      const topics = join(trackLangs, trackLang.name)
      for (const topic of readdirSync(topics, { withFileTypes: true })) {
        if (!topic.isDirectory()) continue
        const articles = join(topics, topic.name)
        for (const article of readdirSync(articles, { withFileTypes: true })) {
          if (!article.isDirectory()) continue
          for (const doc of readdirSync(join(articles, article.name), { withFileTypes: true })) {
            if (doc.isFile() && doc.name.endsWith('.md')) {
              routes.push(
                `/learn/${trackLang.name}/${track.name}/${topic.name}/${article.name}/${doc.name.replace(/\.md$/, '')}`
              )
            }
          }
        }
      }
    }
  }
  return routes
}

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-09-09',
  devtools: { enabled: true },

  // Full static-site generation: `nuxt generate` pre-renders every route.
  ssr: true,
  nitro: {
    prerender: {
      // The crawler discovers deep-link query variants like
      // /learn/:locale/:track?topic=CODE (ArticleRail's "jump to topic"
      // navigation). Nitro never writes routes containing "?" to disk
      // (query strings don't map to static files), so crawling them only
      // re-renders the same page under the track's shared SSR payload
      // cache key — concurrent writes to that one cache file intermittently
      // collide with EPERM on Windows. Skip them; the base track route
      // (already listed below) is what actually gets prerendered, and the
      // topic itself is selected client-side from the query on mount.
      ignore: [/\?/],
      // Library track pages (/learn/:locale/:track) are dynamic routes the
      // link crawler cannot discover, so they are listed explicitly — one
      // entry per language × track. The static host (wrangler.toml) serves
      // "404-page" for missing paths, so every navigable route must exist
      // as a prerendered file. Adding a language to navigation.json adds
      // its three track URLs automatically.
      routes: navigation.languages.flatMap((l) =>
        ['dictionary', 'lectures', 'stories'].map((t) => `/learn/${l.locale}/${t}`)
      )
        // Article pages are prerendered per *explanation* locale doc:
        // content/<track>/<trackLang>/<TOPIC>/<ID>/<locale>.md →
        // /learn/<trackLang>/<track>/<TOPIC>/<ID>/<locale> — the query then
        // runs at build time (no client-side content database).
        .concat(contentDocRoutes())
    }
  },

  // Source lives under src/ (app.vue, pages, components, stores, lib) — content/ and
  // public/ remain at the repo root per the decoupled O(N) architecture.
  srcDir: 'src/',
  dir: {
    // Absolute path keeps public/ at the repo root even with a custom srcDir.
    public: fileURLToPath(new URL('./public', import.meta.url))
  },

  // Supabase — public values baked into the static bundle at build time.
  // Set via NUXT_PUBLIC_SUPABASE_URL / NUXT_PUBLIC_SUPABASE_ANON_KEY (.env,
  // Cloudflare Workers Builds). Empty defaults keep `nuxt generate` green
  // without credentials; supabase.client.ts then no-ops gracefully.
  runtimeConfig: {
    public: {
      supabaseUrl: '',
      supabaseAnonKey: ''
    }
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
        // Favicon set — generated by scripts/generate-logos.py into public/.
        // The .ico fallback comes first; the adaptive .svg (embedded
        // prefers-color-scheme media query) upgrades Chromium/Firefox tabs.
        { rel: 'icon', type: 'image/x-icon', sizes: '16x16 32x32 48x48', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Plus+Jakarta+Sans:wght@600&family=Space+Grotesk:wght@700&display=swap'
        }
      ]
    }
  },

  modules: ['@nuxt/content', '@pinia/nuxt', '@nuxtjs/tailwindcss'],

  // Nuxt Content — the lecture/story authoring layer (content/**/*.md).
  // Build-time SQLite comes from Node's native node:sqlite (Node ≥ 22.5) —
  // no better-sqlite3 native build needed on Windows or CI. Every lecture
  // page is prerendered (routes enumerated below from the content tree), so
  // queries run at build time and the WASM client database is never needed.
  content: {
    experimental: {
      sqliteConnector: 'native'
    },
    build: {
      markdown: {
        toc: { depth: 3 }
      }
    }
  },

  // Tailwind entrypoint — utility-first styling for all components.
  css: [
    '~/assets/css/tailwind.css',
    '~/assets/css/themes.css',
    '~/assets/css/layout.css'
  ]
})
