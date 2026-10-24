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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      abandoned_languages: {
        Row: {
          abandoned_at: string
          credits_allocated_at: number
          credits_returned: number
          enrollment_id: number | null
          id: number
          locale: string
          user_id: string
          words_learned_at: number
        }
        Insert: {
          abandoned_at?: string
          credits_allocated_at?: number
          credits_returned?: number
          enrollment_id?: number | null
          id?: never
          locale: string
          user_id: string
          words_learned_at?: number
        }
        Update: {
          abandoned_at?: string
          credits_allocated_at?: number
          credits_returned?: number
          enrollment_id?: number | null
          id?: never
          locale?: string
          user_id?: string
          words_learned_at?: number
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_languages_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
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
          abandoned_at: string | null
          credits_allocated: number
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
          abandoned_at?: string | null
          credits_allocated?: number
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
          abandoned_at?: string | null
          credits_allocated?: number
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
      listen_counts: {
        Row: {
          count: number
          entity_id: string
          id: number
          locale: string
          updated_at: string
          user_id: string
        }
        Insert: {
          count?: number
          entity_id: string
          id?: never
          locale: string
          updated_at?: string
          user_id: string
        }
        Update: {
          count?: number
          entity_id?: string
          id?: never
          locale?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_domains: string[] | null
          avatar_url: string | null
          credit_pool: number
          display_name: string | null
          id: string
          instruction_lang: string
          updated_at: string | null
          xp: number | null
        }
        Insert: {
          active_domains?: string[] | null
          avatar_url?: string | null
          credit_pool?: number
          display_name?: string | null
          id: string
          instruction_lang?: string
          updated_at?: string | null
          xp?: number | null
        }
        Update: {
          active_domains?: string[] | null
          avatar_url?: string | null
          credit_pool?: number
          display_name?: string | null
          id?: string
          instruction_lang?: string
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
          abandoned_at: string | null
          credits_allocated: number | null
          credits_consumed: number | null
          credits_left: number | null
          credits_total: number | null
          locale: string | null
          started_at: string | null
          status: string | null
          tier_id: string | null
          updated_at: string | null
          user_id: string | null
          words_learned: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      abandon_language: {
        Args: { p_locale: string; p_recuperate?: boolean }
        Returns: number
      }
      add_credits: { Args: { p_credits: number }; Returns: number }
      allocate_credits: {
        Args: { p_credits: number; p_locale: string }
        Returns: number
      }
      restore_language: { Args: { p_locale: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

// ── App-facing aliases (stable across regenerations) ────────────────────────
// `supabase gen types` rewrites this file wholesale, so these are re-appended
// after every regeneration — keep them at the bottom, below the generated code.

/** Non-updatable view row — the one query the Library reads.
 *
 *  Declared explicitly rather than derived from the generated type: Postgres
 *  views do not carry NOT NULL, so `supabase gen types` marks every view column
 *  nullable even though these all come from NOT NULL enrollment columns or a
 *  `coalesce(...)`. Only `abandoned_at` is genuinely nullable. */
export interface EnrollmentsOverviewRow {
  user_id: string
  locale: string
  tier_id: string
  status: string
  credits_total: number
  credits_allocated: number
  credits_consumed: number
  credits_left: number
  words_learned: number
  started_at: string
  updated_at: string
  abandoned_at: string | null
}

/** DB stores these as text + CHECK constraints, so generation yields `string`. */
export type EnrollmentTier = 'prospect' | 'starter' | 'prepaid_credit'
export type EnrollmentStatus = 'active' | 'trial' | 'abandoned'

/** Narrow a raw `tier_id`/`status` string from the DB to its app union. */
export function asTier(v: string): EnrollmentTier {
  return (v === 'prospect' || v === 'starter' || v === 'prepaid_credit' ? v : 'prospect') as EnrollmentTier
}
export function asStatus(v: string): EnrollmentStatus {
  if (v === 'trial' || v === 'abandoned') return v
  return 'active'
}