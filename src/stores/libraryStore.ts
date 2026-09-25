/**
 * libraryStore — the user's language enrollments (orders/subscriptions) and
 * per-language progress. localStorage-first (same pattern as userStore);
 * when Supabase is configured and the user is signed in, hydrate from the
 * enrollments_overview view instead (setFromOverview).
 *
 * Library pages are mostly READ-ONLY consumers: nothing mutates the enrollment
 * records — enroll()/markLearned() exist as the documented write seam for the
 * flows that land later (pricing checkout, QuizEngine/SRS activity). Credits
 * live in a user-level POOL (one balance for all languages): purchases add to
 * the pool (addCredits), the per-language gear dialog moves credits between
 * the pool and each language's allocation, and learning spends from the
 * allocation. Both the pool and the allocations are local preferences on
 * their own keys — never enrollment mutations.
 */
import { defineStore } from 'pinia'
import {
  asStatus,
  asTier,
  type EnrollmentsOverviewRow,
  type EnrollmentStatus,
  type EnrollmentTier
} from '~/types/database'

export type { EnrollmentStatus, EnrollmentTier }

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
/**
 * Hide preference — a separate local key, deliberately NOT a field on the
 * enrollment. Hiding is a *view* preference: the enrollment record (tier,
 * credits, words, timestamps) is never mutated or deleted, and learned-item
 * progress is never touched, so re-adding a language brings back the previous
 * progress. A separate key also survives the signed-in setFromOverview()
 * refresh (which replaces the enrollment list from the server view) —
 * localStorage 'verbologic-library-hidden' = { [locale]: hiddenAt ISO }.
 */
const HIDDEN_KEY = 'verbologic-library-hidden'
/**
 * Credit allocation per language — a separate local key, again deliberately
 * NOT a field on the enrollment (the enrollments_overview view has no such
 * column). Same pattern as the hide preference: `verbologic-library-allocations`
 * = { [locale]: allocatedCredits }. Allocations carve slices of the POOL
 * (see POOL_KEY) into per-language budgets; the unallocated remainder of the
 * pool is the "credit available". Managed only through the per-language
 * settings dialog (Apply commits, Cancel discards).
 */
const ALLOCATIONS_KEY = 'verbologic-library-allocations'
/**
 * User-level credit pool — the credits bought with the Add-credits button
 * (one balance for every language). Allocations carve slices of this pool
 * per language via the gear dialog; the unallocated remainder is the
 * "credit available". A local key like the allocations: per-computer until
 * a server-side balance lands.
 */
const POOL_KEY = 'verbologic-credit-pool'

export const useLibraryStore = defineStore('library', () => {
  // Supabase client (null without credentials) — enrollments persist to the
  // enrollments table when signed in; localStorage stays the fast path.
  const supabase = useSupabase()

  const enrollments = ref<Enrollment[]>([])
  const hidden = ref<Record<string, string>>({})
  const allocations = ref<Record<string, number>>({})
  /** User-level credit pool (bought credits, before per-language allocation). */
  const creditPool = ref(0)

  const isEmpty = computed(() => visible.value.length === 0)

  /** Most-recently-updated first — the Library panel order. */
  const sorted = computed(() =>
    [...enrollments.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  )

  /** Enrollments shown in the Library: sorted, minus the hidden languages. */
  const visible = computed(() => sorted.value.filter((e: Enrollment) => !isHidden(e.locale)))

  /** How many languages are currently hidden (drives the empty-state hint). */
  const hiddenCount = computed(() => Object.keys(hidden.value).length)

  /** True when the language is hidden from the Library (progress kept). */
  function isHidden(locale: string): boolean {
    return Boolean(hidden.value[locale])
  }

  /** Credits earmarked for one language (0 when never allocated). */
  function allocationFor(locale: string): number {
    return Math.max(0, allocations.value[locale] ?? 0)
  }

  /** Sum of every language's allocation. */
  const allocatedTotal = computed(() =>
    (Object.values(allocations.value) as number[]).reduce((sum: number, n: number) => sum + Math.max(0, n), 0)
  )

  /** The unallocated slice of the pool — what the gear dialog can still hand
   *  out (and what "take credits back" returns to). */
  const poolAvailable = computed(() => Math.max(0, creditPool.value - allocatedTotal.value))

  /** Buy credits into the pool (the Add-credits dialog). */
  function addCredits(credits: number) {
    creditPool.value += Math.max(0, credits)
    if (import.meta.client) localStorage.setItem(POOL_KEY, JSON.stringify(creditPool.value))
  }

  /** Commit a new credit allocation for one language (settings dialog Apply). */
  function setAllocation(locale: string, credits: number) {
    const e = activeFor(locale)
    if (!e) return
    // The ceiling is the language's current allocation plus whatever is
    // still unallocated in the pool — moving credits between languages goes
    // through the pool, so nothing is ever created out of thin air.
    const ceiling = allocationFor(locale) + poolAvailable.value
    allocations.value[locale] = Math.max(0, Math.min(credits, ceiling))
    if (import.meta.client) {
      localStorage.setItem(ALLOCATIONS_KEY, JSON.stringify(allocations.value))
    }
  }

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

  function persistHidden() {
    if (import.meta.client) {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden.value))
    }
  }

  /** Replace state from the Supabase enrollments_overview view (snake_case → camel). */
  function setFromOverview(rows: EnrollmentsOverviewRow[]) {
    enrollments.value = rows.map((r) => ({
      locale: r.locale,
      tierId: asTier(r.tier_id),
      status: asStatus(r.status),
      creditsTotal: r.credits_total,
      creditsConsumed: r.credits_consumed,
      wordsLearned: r.words_learned,
      startedAt: r.started_at,
      updatedAt: r.updated_at
    }))
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
    try {
      const rawHidden = localStorage.getItem(HIDDEN_KEY)
      hidden.value = rawHidden ? (JSON.parse(rawHidden) as Record<string, string>) : {}
    } catch {
      // Corrupt payload — nothing hidden.
      hidden.value = {}
    }
    try {
      const rawAlloc = localStorage.getItem(ALLOCATIONS_KEY)
      allocations.value = rawAlloc ? (JSON.parse(rawAlloc) as Record<string, number>) : {}
    } catch {
      // Corrupt payload — nothing allocated.
      allocations.value = {}
    }
    try {
      const rawPool = localStorage.getItem(POOL_KEY)
      creditPool.value = rawPool ? (JSON.parse(rawPool) as number) : 0
    } catch {
      // Corrupt payload — empty pool.
      creditPool.value = 0
    }
  }

  // --- Write seam (Supabase Phase 5) ---

  /** Upsert one enrollment to the enrollments table (signed in only,
   *  fire-and-forget — localStorage is always written first). */
  async function syncToDb(e: Enrollment): Promise<void> {
    if (!supabase || !import.meta.client) return
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user?.id
    if (!userId) return
    const { error } = await supabase.from('enrollments').upsert(
      {
        user_id: userId,
        locale: e.locale,
        tier_id: e.tierId,
        status: e.status,
        credits_total: e.creditsTotal,
        started_at: e.startedAt,
        updated_at: e.updatedAt
      },
      { onConflict: 'user_id,locale' }
    )
    if (error) console.warn('[library] enrollment sync failed', error.message)
  }

  /** Sync every local enrollment to the DB (anonymous → signed-in adoption). */
  async function syncAll(): Promise<void> {
    for (const e of enrollments.value) await syncToDb(e)
  }

  /** Record a new order/subscription from the pricing checkout. */
  function enroll(input: Omit<Enrollment, 'startedAt' | 'updatedAt'>) {
    const now = new Date().toISOString()
    const e = { ...input, startedAt: now, updatedAt: now }
    enrollments.value.push(e)
    persist()
    void syncToDb(e)
  }

  /** Bump the learned-word counter after learning activity (quiz/SRS). */
  function markLearned(locale: string, count = 1) {
    const e = activeFor(locale)
    if (!e) return
    e.wordsLearned += count
    e.updatedAt = new Date().toISOString()
    persist()
  }

  /**
   * Hide a language from the Library. Purely a view preference: the enrollment
   * record and learned-item progress are left untouched, so restoring brings
   * back the previous progress. Reversible via restore() (Add Language dialog).
   */
  function hide(locale: string) {
    if (!activeFor(locale) || hidden.value[locale]) return
    hidden.value[locale] = new Date().toISOString()
    persistHidden()
  }

  /** Un-hide a previously hidden language (no enrollment is created). */
  function restore(locale: string) {
    if (!hidden.value[locale]) return
    delete hidden.value[locale]
    persistHidden()
  }

  return {
    enrollments,
    hidden,
    creditPool,
    allocatedTotal,
    poolAvailable,
    isEmpty,
    sorted,
    visible,
    hiddenCount,
    isHidden,
    allocationFor,
    creditsLeft,
    activeFor,
    hydrate,
    setFromOverview,
    enroll,
    addCredits,
    syncAll,
    markLearned,
    hide,
    restore,
    setAllocation
  }
})