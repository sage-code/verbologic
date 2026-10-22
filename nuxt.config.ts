import { fileURLToPath } from 'node:url'
import navigation from './src/data/navigation.json'
import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Enumerate prerendered article routes from the content tree. Shared
 * dictionary, lecture, and shared story docs are emitted for each registered
 * target language, while Markdown is stored once per explanation locale.
 */
function contentDocRoutes(): string[] {
  const root = fileURLToPath(new URL('./content', import.meta.url))
  if (!existsSync(root)) return []
  const routes: string[] = []
  const walk = (dir: string, parts: string[] = []) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const next = [...parts, entry.name]
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), next)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const locale = entry.name.replace(/\.md$/, '')
        if (parts[0] === 'dictionary' && parts.length === 3) {
          const [, topic, article] = parts
          for (const language of navigation.languages) {
            routes.push(`/learn/${language.locale}/dictionary/${topic}/${article}/${locale}`)
          }
        } else if (parts[0] === 'lectures' && parts.length === 3) {
          const [, topic, article] = parts
          for (const language of navigation.languages) {
            routes.push(`/learn/${language.locale}/lectures/${topic}/${article}/${locale}`)
          }
        } else if (parts[0] === 'stories' && parts.length === 3) {
          const [, topic, article] = parts
          for (const language of navigation.languages) {
            routes.push(`/learn/${language.locale}/stories/${topic}/${article}/${locale}`)
          }
        } else if (parts.length === 4) {
          const [track, trackLang, topic, article] = parts
          routes.push(`/learn/${trackLang}/${track}/${topic}/${article}/${locale}`)
        }
      }
    }
  }
  walk(root)
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
        // Article prose is prerendered per explanation-locale doc. Shared
        // dictionary, lecture, and shared story docs produce routes for every
        // registered target language; legacy stories retain their own tree.
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
          href: 'https://fonts.googleapis.com/css2?family=Charis+SIL&family=Inter:wght@400;500&family=Plus+Jakarta+Sans:wght@600&family=Space+Grotesk:wght@700&display=swap'
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
