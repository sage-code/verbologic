/**
 * useDbStatus — is the Supabase backend reachable?
 *
 * The site is a static bundle, but from Phase 6 on the dictionary content comes
 * from Supabase. If the project is paused (Free tier pauses after 7 days of
 * inactivity) or otherwise unreachable, the content pages have nothing to show.
 * This composable is the single source of truth for that state, so the UI can
 * degrade deliberately instead of failing per-request:
 *
 *   online   — the last probe succeeded (or none has run yet)
 *   offline  — the probe failed; content falls back to the bundled English data
 *              and the account-backed pages are disabled
 *
 * The probe is a cheap `HEAD`-style read against `topics` with `limit=1`. It is
 * deliberately NOT the heartbeat (scripts/db-heartbeat.mjs): that one runs on a
 * schedule to keep the project awake, this one runs in the browser to tell the
 * user what is happening.
 *
 * State is shared through `useState` so every component sees the same answer
 * without re-probing, and it is client-only — the prerendered HTML must never
 * bake in a status, or a build made while the DB was down would ship "offline"
 * to everyone.
 */

/** How long a probe result is trusted before re-checking. */
const RECHECK_MS = 60_000
/** A probe that takes longer than this counts as offline. */
const PROBE_TIMEOUT_MS = 8_000

export type DbStatus = 'unknown' | 'online' | 'offline'

export function useDbStatus() {
  const supabase = useSupabase()

  const status = useState<DbStatus>('db-status', () => 'unknown')
  const checkedAt = useState<number>('db-status-checked-at', () => 0)
  /** True while a probe is in flight (drives the banner's "checking" state). */
  const checking = useState<boolean>('db-status-checking', () => false)

  const isOffline = computed(() => status.value === 'offline')
  const isOnline = computed(() => status.value === 'online')

  /**
   * Probe the backend once. Resolves the resulting status.
   *
   * `force` bypasses the RECHECK_MS cache — used by the banner's retry button.
   * Never throws: a failed probe is a normal outcome, not an error.
   */
  async function check(force = false): Promise<DbStatus> {
    if (!import.meta.client) return status.value
    // No credentials configured at all — the site runs on bundled data only,
    // which is not an "outage", so report online and let the static path work.
    if (!supabase) {
      status.value = 'online'
      return status.value
    }
    if (!force && status.value !== 'unknown' && Date.now() - checkedAt.value < RECHECK_MS) {
      return status.value
    }
    if (checking.value) return status.value

    checking.value = true
    try {
      const probe = supabase.from('topics').select('topic', { head: true, count: 'exact' }).limit(1)
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('probe timeout')), PROBE_TIMEOUT_MS)
      )
      const { error } = await Promise.race([probe, timeout])
      status.value = error ? 'offline' : 'online'
    } catch {
      status.value = 'offline'
    } finally {
      checking.value = false
      checkedAt.value = Date.now()
    }
    return status.value
  }

  /**
   * Mark the backend offline without probing — called when a content query
   * fails, so one failed request flips the whole UI instead of each component
   * discovering the outage separately.
   */
  function markOffline() {
    status.value = 'offline'
    checkedAt.value = Date.now()
  }

  return { status, checking, isOffline, isOnline, check, markOffline }
}
