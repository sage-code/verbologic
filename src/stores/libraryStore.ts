/**
 * libraryStore — the user's language enrollments (orders/subscriptions) and
 * per-language progress. localStorage-first (same pattern as userStore);
 * Phase 5 will hydrate this from Supabase (profiles + orders tables) instead.
 *
 * The Library page is a READ-ONLY consumer: nothing in the UI mutates state —
 * enroll()/topUp()/markLearned() exist as the documented write seam for the
 * flows that land later (pricing checkout, QuizEngine/SRS activity).
 */
import { defineStore } from 'pinia'

export type EnrollmentTier = 'prospect' | 'starter' | 'prepaid_credit'
export type EnrollmentStatus = 'active' | 'trial'

export interface Enrollment {
  /** Target-language locale code ('ro', 'en', …). */
  locale: string
  /** Pricing tier the language was acquired under (prices.json ids). */
  tierId: EnrollmentTier
  status: EnrollmentStatus
  /** Credit allotment granted by the tier (0 for non-credit tiers). */
  creditsTotal: number
  /** Credits already spent (lessons, TTS, reviews — billing-defined). */
  creditsConsumed: number
  /** Vocabulary items marked as learned by learning activity. */
  wordsLearned: number
  startedAt: string
  updatedAt: string
}

const STORAGE_KEY = 'verbologic-library'

export const useLibraryStore = defineStore('library', () => {
  const enrollments = ref<Enrollment[]>([])

  const isEmpty = computed(() => enrollments.value.length === 0)

  /** Most-recently-updated first — the Library panel order. */
  const sorted = computed(() =>
    [...enrollments.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  )

  /** Remaining credit balance for one enrollment (never negative). */
  function creditsLeft(e: Enrollment): number {
    return Math.max(0, e.creditsTotal - e.creditsConsumed)
  }

  /** The enrollment for one language, if owned. */
  function activeFor(locale: string): Enrollment | null {
    return enrollments.value.find((e: Enrollment) => e.locale === locale) ?? null
  }

  function persist() {
    if (import.meta.client) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(enrollments.value))
    }
  }

  /**
   * Client-side hydration from localStorage. Called from onMounted so the
   * prerendered HTML (always empty) never mismatches during hydration.
   */
  function hydrate() {
    if (!import.meta.client) return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      enrollments.value = raw ? (JSON.parse(raw) as Enrollment[]) : []
    } catch {
      // Corrupt payload — start empty.
      enrollments.value = []
    }
  }

  // --- Write seam (Supabase Phase 5; unused by the read-only Library UI) ---

  /** Record a new order/subscription from the pricing checkout. */
  function enroll(input: Omit<Enrollment, 'startedAt' | 'updatedAt'>) {
    const now = new Date().toISOString()
    enrollments.value.push({ ...input, startedAt: now, updatedAt: now })
    persist()
  }

  /** Add credits to an existing enrollment (top-up purchase). */
  function topUp(locale: string, credits: number) {
    const e = activeFor(locale)
    if (!e) return
    e.creditsTotal += credits
    e.updatedAt = new Date().toISOString()
    persist()
  }

  /** Bump the learned-word counter after learning activity (quiz/SRS). */
  function markLearned(locale: string, count = 1) {
    const e = activeFor(locale)
    if (!e) return
    e.wordsLearned += count
    e.updatedAt = new Date().toISOString()
    persist()
  }

  return {
    enrollments,
    isEmpty,
    sorted,
    creditsLeft,
    activeFor,
    hydrate,
    enroll,
    topUp,
    markLearned
  }
})