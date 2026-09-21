/**
 * useSupabase — typed accessor for the browser Supabase client registered by
 * src/plugins/supabase.client.ts. Returns null when no credentials are
 * configured; every consumer must branch on the null case (localStorage
 * fallback) so the static build works with or without Supabase.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database'

export function useSupabase(): SupabaseClient<Database> | null {
  const nuxtApp = useNuxtApp()
  return (nuxtApp.$supabase as SupabaseClient<Database> | null) ?? null
}