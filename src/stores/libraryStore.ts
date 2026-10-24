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
  /** Slice of the user-level pool earmarked for this language. */
  creditsAllocated: number
  /** Credits already spent (lessons, TTS, reviews — billing-defined). */
  creditsConsumed: number
  /** Vocabulary items marked as learned by learning activity. */
  wordsLearned: number
  startedAt: string
  updatedAt: string
  /** Set when the language was abandoned; null while active. */
  abandonedAt: string | null
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
 * NOT a field on the enrollment. `verbologic-library-allocations`
 * = { [locale]: allocatedCredits }. Allocations carve slices of the POOL
 * (see POOL_KEY) into per-language budgets; the unallocated remainder of the
 * pool is the "credit available".
 *
 * Signed in, the server is authoritative: `profiles.credit_pool` and
 * `enrollments.credits_allocated` hold the same numbers, and the RPCs
 * (allocate_credits / add_credits / abandon_language) are what mutate them.
 * These local keys stay as the signed-out fast path and the offline mirror.
 */
const ALLOCATIONS_KEY = 'verbologic-library-allocations'
/**
 * User-level credit pool — the credits bought with the Add-credits button
 * (one balance for every language). Allocations carve slices of this pool
 * per language via the gear dialog; the unallocated remainder is the
 * "credit available". Mirrors `profiles.credit_pool` when signed in.
 */
const POOL_KEY = 'verbologic-credit-pool'
/** How many languages may be active at once (mirrors the DB trigger's cap). */
export const ACTIVE_LANGUAGE_CAP = 3

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

  /** Enrollments shown in the Library: sorted, minus hidden and abandoned. */
  const visible = computed(() =>
    sorted.value.filter((e: Enrollment) => !isHidden(e.locale) && e.status !== 'abandoned')
  )

  /** Languages the user has abandoned — restorable, progress intact. */
  const abandoned = computed(() =>
    sorted.value.filter((e: Enrollment) => e.status === 'abandoned')
  )

  /**
   * Active languages — the ones that count against ACTIVE_LANGUAGE_CAP.
   *
   * Hidden languages are EXCLUDED. Hiding is a view preference, but a hidden
   * language is not one the user is learning right now, so it must not hold a
   * slot. Counting them was a bug: hiding every language left the Library
   * empty while the cap still reported "2 of 2", so no language could be added
   * and none were visible to remove.
   */
  const active = computed(() =>
    enrollments.value.filter((e: Enrollment) => e.status !== 'abandoned' && !isHidden(e.locale))
  )

  /** True when another language cannot be added without abandoning one. */
  const atLanguageCap = computed(() => active.value.length >= ACTIVE_LANGUAGE_CAP)

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
  async function addCredits(credits: number) {
    const amount = Math.max(0, credits)
    if (!amount) return
    creditPool.value += amount
    if (import.meta.client) localStorage.setItem(POOL_KEY, JSON.stringify(creditPool.value))
    // Signed in, the server owns the balance — mirror the result back.
    if (supabase && import.meta.client) {
      const { data, error } = await supabase.rpc('add_credits', { p_credits: amount })
      if (error) console.warn('[library] add_credits failed', error.message)
      else if (typeof data === 'number') {
        creditPool.value = data
        if (import.meta.client) localStorage.setItem(POOL_KEY, JSON.stringify(creditPool.value))
      }
    }
  }

  /** Commit a new credit allocation for one language (settings dialog Apply). */
  async function setAllocation(locale: string, credits: number) {
    const e = activeFor(locale)
    if (!e) return
    // The ceiling is the language's current allocation plus whatever is
    // still unallocated in the pool — moving credits between languages goes
    // through the pool, so nothing is ever created out of thin air.
    const ceiling = allocationFor(locale) + poolAvailable.value
    const target = Math.max(0, Math.min(credits, ceiling))
    allocations.value[locale] = target
    if (import.meta.client) {
      localStorage.setItem(ALLOCATIONS_KEY, JSON.stringify(allocations.value))
    }
    if (supabase && import.meta.client) {
      const { data, error } = await supabase.rpc('allocate_credits', {
        p_locale: locale,
        p_credits: target
      })
      if (error) console.warn('[library] allocate_credits failed', error.message)
      else if (typeof data === 'number') {
        // The server clamps to the same ceiling; adopt its answer.
        allocations.value[locale] = data
        creditPool.value = Math.max(0, creditPool.value - (data - target))
        if (import.meta.client) {
          localStorage.setItem(ALLOCATIONS_KEY, JSON.stringify(allocations.value))
          localStorage.setItem(POOL_KEY, JSON.stringify(creditPool.value))
        }
      }
    }
  }

  /**
   * Abandon a language. Progress is never touched — the enrollment flips to
   * 'abandoned' and every learned_item / listen_count stays attached, so
   * restore() brings the language back exactly as it was.
   *
   * `recuperate` decides what happens to the language's credit allocation:
   * true returns it to the pool, false forfeits it. Either way the language's
   * allocation drops to zero.
   *
   * Returns the number of credits returned to the pool.
   */
  async function abandon(locale: string, recuperate = true): Promise<number> {
    const e = activeFor(locale)
    if (!e || e.status === 'abandoned') return 0

    const returned = recuperate ? allocationFor(locale) : 0
    e.status = 'abandoned'
    e.abandonedAt = new Date().toISOString()
    e.updatedAt = e.abandonedAt
    delete allocations.value[locale]
    creditPool.value += returned
    persist()
    if (import.meta.client) {
      localStorage.setItem(ALLOCATIONS_KEY, JSON.stringify(allocations.value))
      localStorage.setItem(POOL_KEY, JSON.stringify(creditPool.value))
    }

    if (supabase && import.meta.client) {
      const { data, error } = await supabase.rpc('abandon_language', {
        p_locale: locale,
        p_recuperate: recuperate
      })
      if (error) console.warn('[library] abandon_language failed', error.message)
      else if (typeof data === 'number') return data
    }
    return returned
  }

  /**
   * Bring an abandoned language back. A status flip — the progress was never
   * removed. Credits are not re-allocated; the user re-earmarks them from the
   * pool with the per-language settings dialog.
   */
  async function restoreAbandoned(locale: string) {
    const e = activeFor(locale)
    if (!e || e.status !== 'abandoned') return
    if (atLanguageCap.value) return
    e.status = 'active'
    e.abandonedAt = null
    e.updatedAt = new Date().toISOString()
    persist()
    if (supabase && import.meta.client) {
      const { error } = await supabase.rpc('restore_language', { p_locale: locale })
      if (error) console.warn('[library] restore_language failed', error.message)
    }
  }

  /** Remaining credit balance for one enrollment (never negative). */
  function creditsLeft(e: Enrollment): number {
    return Math.max(0, e.creditsAllocated - e.creditsConsumed)
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
      creditsAllocated: r.credits_allocated,
      creditsConsumed: r.credits_consumed,
      wordsLearned: r.words_learned,
      startedAt: r.started_at,
      updatedAt: r.updated_at,
      abandonedAt: r.abandoned_at
    }))
    // The server is authoritative for allocations once we have its rows.
    const serverAllocations: Record<string, number> = {}
    for (const r of rows) {
      if (r.credits_allocated > 0) serverAllocations[r.locale] = r.credits_allocated
    }
    allocations.value = serverAllocations
    if (import.meta.client) {
      localStorage.setItem(ALLOCATIONS_KEY, JSON.stringify(allocations.value))
    }
  }

  /** Adopt the server-side credit pool (profiles.credit_pool). */
  function setCreditPool(pool: number) {
    creditPool.value = Math.max(0, pool)
    if (import.meta.client) localStorage.setItem(POOL_KEY, JSON.stringify(creditPool.value))
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
        credits_allocated: e.creditsAllocated,
        started_at: e.startedAt,
        updated_at: e.updatedAt,
        abandoned_at: e.abandonedAt
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
  function enroll(input: Omit<Enrollment, 'startedAt' | 'updatedAt' | 'abandonedAt'>) {
    const now = new Date().toISOString()
    const e = { ...input, startedAt: now, updatedAt: now, abandonedAt: null }
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
    abandoned,
    active,
    atLanguageCap,
    hiddenCount,
    isHidden,
    allocationFor,
    creditsLeft,
    activeFor,
    hydrate,
    setFromOverview,
    setCreditPool,
    enroll,
    addCredits,
    syncAll,
    markLearned,
    hide,
    restore,
    abandon,
    restoreAbandoned,
    setAllocation
  }
})