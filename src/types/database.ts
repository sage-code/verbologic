/**
 * database.ts — GENERATED Supabase types (via MCP generate_typescript_types,
 * project vmxkimcdtluoghcaxqht, PostgREST 14.5). Regenerate after schema
 * changes: `npx supabase gen types typescript --project-id vmxkimcdtluoghcaxqht
 * --schema public > src/types/database.ts`.
 *
 * The named aliases at the bottom keep the app code stable across regenerations.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: {
      credit_ledger: {
        Row: {
          created_at: string
          delta: number
          id: number
          locale: string
          reason: string
          ref_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: never
          locale: string
          reason?: string
          ref_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: never
          locale?: string
          reason?: string
          ref_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          credits_total: number
          id: number
          locale: string
          started_at: string
          status: string
          tier_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          credits_total?: number
          id?: never
          locale: string
          started_at?: string
          status?: string
          tier_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          credits_total?: number
          id?: never
          locale?: string
          started_at?: string
          status?: string
          tier_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      learned_items: {
        Row: {
          created_at: string
          entity_id: string
          id: number
          locale: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          id?: never
          locale: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          id?: never
          locale?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_domains: string[] | null
          id: string
          instruction_lang: string
          target_lang: string
          updated_at: string | null
          xp: number | null
        }
        Insert: {
          active_domains?: string[] | null
          id: string
          instruction_lang?: string
          target_lang?: string
          updated_at?: string | null
          xp?: number | null
        }
        Update: {
          active_domains?: string[] | null
          id?: string
          instruction_lang?: string
          target_lang?: string
          updated_at?: string | null
          xp?: number | null
        }
        Relationships: []
      }
      quiz_results: {
        Row: {
          created_at: string
          id: number
          passed: boolean
          quiz_id: string
          score: number
          total_questions: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          passed: boolean
          quiz_id: string
          score: number
          total_questions: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          passed?: boolean
          quiz_id?: string
          score?: number
          total_questions?: number
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      enrollments_overview: {
        Row: {
          credits_consumed: number
          credits_left: number
          credits_total: number
          locale: string
          started_at: string
          status: string
          tier_id: string
          updated_at: string
          user_id: string
          words_learned: number
        }
        Relationships: []
      }
    }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

// ── App-facing aliases (stable across regenerations) ────────────────────────

/** Non-updatable view row — the one query the Library reads. */
export type EnrollmentsOverviewRow = DatabaseWithoutInternals['public']['Views']['enrollments_overview']['Row']

/** DB stores these as text + CHECK constraints, so generation yields `string`. */
export type EnrollmentTier = 'prospect' | 'starter' | 'prepaid_credit'
export type EnrollmentStatus = 'active' | 'trial'

/** Narrow a raw `tier_id`/`status` string from the DB to its app union. */
export function asTier(v: string): EnrollmentTier {
  return (v === 'prospect' || v === 'starter' || v === 'prepaid_credit' ? v : 'prospect') as EnrollmentTier
}
export function asStatus(v: string): EnrollmentStatus {
  return (v === 'trial' ? 'trial' : 'active') as EnrollmentStatus
}