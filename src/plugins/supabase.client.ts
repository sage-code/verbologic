/**
 * supabase.client.ts — browser-only Supabase client for the static site.
 *
 * This project is pure SSG (Workers Static Assets, no server runtime), so
 * @supabase/ssr's createServerClient has no runtime to run in; the browser
 * client is the only active path. Sessions persist in cookies via
 * createBrowserClient's default storage.
 *
 * When NUXT_PUBLIC_SUPABASE_URL / _ANON_KEY are missing (no .env), the plugin
 * still registers and provides null — every consumer degrades to the
 * localStorage-only behavior and the site builds/runs unchanged.
 */
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '~/types/database'

export default defineNuxtPlugin((nuxtApp) => {
  const url = useRuntimeConfig().public.supabaseUrl
  const key = useRuntimeConfig().public.supabaseAnonKey

  if (!url || !key) {
    console.warn(
      '[supabase] NUXT_PUBLIC_SUPABASE_URL / NUXT_PUBLIC_SUPABASE_ANON_KEY missing — ' +
        'auth & progress disabled (localStorage fallback). Copy .env.example to .env.'
    )
    nuxtApp.provide('supabase', null)
    return
  }

  nuxtApp.provide('supabase', createBrowserClient<Database>(url, key))
})