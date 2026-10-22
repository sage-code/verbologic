/**
 * useProgress — per-locale learning progress ("Words learned").
 *
 * Signed in + Supabase configured: source of truth is the learned_items table
 * (idempotent via UNIQUE(user_id, entity_id)); the Library reads the aggregate
 * through enrollments_overview.
 * Signed out or Supabase unconfigured: localStorage fallback
 * ('verbologic-progress', keyed by locale) — identical UX, no server.
 */
import { useUserStore } from '~/stores/userStore'

const STORAGE_KEY = 'verbologic-progress'
const LISTENS_KEY = 'verbologic-listens'
/** Full listens needed for the auto-complete (5th, 10th, 15th … crossing). */
const LEARN_AFTER_LISTENS = 5

/** PostgREST-safe bulk size — the `.in()` filter is a URL list, so hundreds of
 *  ids (section-wide reset) must be sent in chunks. */
const BULK_CHUNK = 100

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export function useProgress(locale: () => string) {
  const supabase = useSupabase()
  const userStore = useUserStore()
  const { fetchIndex } = useMedia()

  /** Learned entity ids for the active locale. Replaced (never mutated) for reactivity. */
  const learned = ref<Set<string>>(new Set())
  const ready = ref(false)
  /** Full-listen counts per entity id for the active locale. */
  const listens = ref<Record<string, number>>({})
  const progressAliases = ref<Record<string, string>>({})
  let aliasesPromise: Promise<Record<string, string>> | null = null

  async function loadProgressAliases(): Promise<Record<string, string>> {
    if (!import.meta.client) return {}
    if (!aliasesPromise) {
      aliasesPromise = fetchIndex()
        .then((index) => index.progressAliases ?? {})
        .catch((error) => {
          aliasesPromise = null
          console.warn('[progress] legacy id map unavailable', error)
          return {}
        })
    }
    const aliases = await aliasesPromise
    progressAliases.value = aliases
    return aliases
  }

  function canonicalId(id: string): string {
    return progressAliases.value[id] ?? id
  }

  function legacyIds(id: string): string[] {
    return Object.entries(progressAliases.value)
      .filter(([, canonical]) => canonical === id)
      .map(([legacy]) => legacy)
  }

  function canonicalizeList(ids: string[]): string[] {
    return [...new Set(ids.map(canonicalId))]
  }

  function canonicalizeListens(counts: Record<string, number>): Record<string, number> {
    const canonical: Record<string, number> = {}
    for (const [id, count] of Object.entries(counts)) {
      const key = canonicalId(id)
      canonical[key] = Math.max(canonical[key] ?? 0, count)
    }
    return canonical
  }

  function readLocal(): Record<string, string[]> {
    if (!import.meta.client) return {}
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as Record<string, string[]>) : {}
    } catch {
      return {}
    }
  }

  function writeLocal(map: Record<string, string[]>) {
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  }

  function readLocalListens(): Record<string, Record<string, number>> {
    if (!import.meta.client) return {}
    try {
      const raw = localStorage.getItem(LISTENS_KEY)
      return raw ? (JSON.parse(raw) as Record<string, Record<string, number>>) : {}
    } catch {
      return {}
    }
  }

  /** Load the learned set + listen counts for the active locale. */
  async function refresh(): Promise<void> {
    ready.value = false
    const userId = userStore.user?.id
    await loadProgressAliases()
    if (supabase && userId) {
      const [learnedRes, listenRes] = await Promise.all([
        supabase.from('learned_items').select('entity_id').eq('user_id', userId).eq('locale', locale()),
        supabase.from('listen_counts').select('entity_id, count').eq('user_id', userId).eq('locale', locale())
      ])
      if (!learnedRes.error && learnedRes.data && !listenRes.error && listenRes.data) {
        learned.value = new Set(canonicalizeList(learnedRes.data.map((r) => r.entity_id)))
        listens.value = canonicalizeListens(Object.fromEntries(listenRes.data.map((r) => [r.entity_id, r.count])))
        ready.value = true
        return
      }
      console.warn('[progress] load failed — falling back to local', learnedRes.error?.message)
    }
    const local = readLocal()
    const oldLearned = local[locale()] ?? []
    const newLearned = canonicalizeList(oldLearned)
    if (oldLearned.length !== newLearned.length || oldLearned.some((id, i) => id !== newLearned[i])) {
      local[locale()] = newLearned
      writeLocal(local)
    }
    const localListens = readLocalListens()
    const oldListens = localListens[locale()] ?? {}
    const newListens = canonicalizeListens(oldListens)
    if (JSON.stringify(oldListens) !== JSON.stringify(newListens)) {
      localListens[locale()] = newListens
      if (import.meta.client) localStorage.setItem(LISTENS_KEY, JSON.stringify(localListens))
    }
    learned.value = new Set(newLearned)
    listens.value = newListens
    ready.value = true
  }

  function isLearned(entityId: string): boolean {
    return learned.value.has(entityId)
  }

  /**
   * Toggle learned state for one entity. Optimistic; the DB side is idempotent
   * (UNIQUE(user_id, entity_id)), so races cannot inflate the count.
   */
  async function toggleLearned(entityId: string): Promise<void> {
    const wasLearned = learned.value.has(entityId)
    const next = new Set(learned.value)
    if (wasLearned) next.delete(entityId)
    else next.add(entityId)
    learned.value = next

    const userId = userStore.user?.id
    if (supabase && userId) {
      if (wasLearned) {
        const { error } = await supabase
          .from('learned_items')
          .delete()
          .eq('user_id', userId)
          .eq('locale', locale()) // locale-scoped: unlearning ro must not touch en
          .in('entity_id', [entityId, ...legacyIds(entityId)])
        if (error) console.warn('[progress] unlearn failed', error.message)
      } else {
        const { error } = await supabase
          .from('learned_items')
          .upsert(
            { user_id: userId, locale: locale(), entity_id: entityId },
            { onConflict: 'user_id,locale,entity_id', ignoreDuplicates: true }
          )
        if (error) console.warn('[progress] mark failed', error.message)
      }
      return
    }

    // Signed-out / no credentials — localStorage fallback.
    const map = readLocal()
    const ids = new Set(map[locale()] ?? [])
    if (wasLearned) {
      ids.delete(entityId)
      for (const legacy of legacyIds(entityId)) ids.delete(legacy)
    }
    else ids.add(entityId)
    map[locale()] = [...ids]
    writeLocal(map)
  }

  /**
   * Count one full listen of an entity (row play, queue step or Repeat lap).
   * Crossing a multiple of LEARN_AFTER_LISTENS auto-marks the item learned —
   * a manual uncheck sticks until the next crossing. Optimistic like
   * toggleLearned; the signed-in DB row is upserted with the running count.
   */
  async function registerListen(entityId: string): Promise<void> {
    const count = (listens.value[entityId] ?? 0) + 1
    listens.value = { ...listens.value, [entityId]: count }

    const userId = userStore.user?.id
    if (supabase && userId) {
      const { error } = await supabase
        .from('listen_counts')
        .upsert(
          { user_id: userId, locale: locale(), entity_id: entityId, count },
          { onConflict: 'user_id,locale,entity_id' }
        )
      if (error) console.warn('[progress] listen count failed', error.message)
    } else {
      const all = readLocalListens()
      all[locale()] = { ...(all[locale()] ?? {}), [entityId]: count }
      if (import.meta.client) localStorage.setItem(LISTENS_KEY, JSON.stringify(all))
    }

    if (count % LEARN_AFTER_LISTENS === 0 && !learned.value.has(entityId)) {
      await toggleLearned(entityId)
    }
  }

  /**
   * Bulk learned-state change (the header's check-all / reset): one optimistic
   * update, one DB round-trip — upsert the missing rows or delete them by id.
   */
  async function setLearnedMany(entityIds: string[], learnedValue: boolean): Promise<void> {
    if (entityIds.length === 0) return
    const next = new Set(learned.value)
    for (const id of entityIds) {
      if (learnedValue) next.add(id)
      else next.delete(id)
    }
    learned.value = next

    const userId = userStore.user?.id
    if (supabase && userId) {
      if (learnedValue) {
        for (const part of chunk(entityIds, BULK_CHUNK)) {
          const rows = part.map((entity_id) => ({ user_id: userId, locale: locale(), entity_id }))
          const { error } = await supabase
            .from('learned_items')
            .upsert(rows, { onConflict: 'user_id,locale,entity_id', ignoreDuplicates: true })
          if (error) console.warn('[progress] bulk mark failed', error.message)
        }
      } else {
        for (const part of chunk(entityIds, BULK_CHUNK)) {
          const { error } = await supabase
            .from('learned_items')
            .delete()
            .eq('user_id', userId)
            .eq('locale', locale())
            .in('entity_id', part.flatMap((id) => [id, ...legacyIds(id)]))
          if (error) console.warn('[progress] bulk unlearn failed', error.message)
        }
      }
      return
    }

    const map = readLocal()
    const ids = new Set(map[locale()] ?? [])
    for (const id of entityIds) {
      if (learnedValue) ids.add(id)
      else {
        ids.delete(id)
        for (const legacy of legacyIds(id)) ids.delete(legacy)
      }
    }
    map[locale()] = [...ids]
    writeLocal(map)
  }

  /** Forget the listen counts of the given entities (page reset → start over:
   *  the 5-listen auto-check must not re-fire on the next listen). */
  async function clearListens(entityIds: string[]): Promise<void> {
    if (entityIds.length === 0) return
    const next = { ...listens.value }
    for (const id of entityIds) delete next[id]
    listens.value = next

    const userId = userStore.user?.id
    if (supabase && userId) {
      for (const part of chunk(entityIds, BULK_CHUNK)) {
        const { error } = await supabase
          .from('listen_counts')
          .delete()
          .eq('user_id', userId)
          .eq('locale', locale())
          .in('entity_id', part.flatMap((id) => [id, ...legacyIds(id)]))
        if (error) console.warn('[progress] listen reset failed', error.message)
      }
      return
    }
    const all = readLocalListens()
    const counts = { ...(all[locale()] ?? {}) }
    for (const id of entityIds) {
      delete counts[id]
      for (const legacy of legacyIds(id)) delete counts[legacy]
    }
    all[locale()] = counts
    if (import.meta.client) localStorage.setItem(LISTENS_KEY, JSON.stringify(all))
  }

  return {
    learned,
    ready,
    refresh,
    isLearned,
    toggleLearned,
    listens,
    registerListen,
    setLearnedMany,
    clearListens
  }
}