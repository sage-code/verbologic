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

export function useProgress(locale: () => string) {
  const supabase = useSupabase()
  const userStore = useUserStore()

  /** Learned entity ids for the active locale. Replaced (never mutated) for reactivity. */
  const learned = ref<Set<string>>(new Set())
  const ready = ref(false)

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

  /** Load the learned set for the active locale. */
  async function refresh(): Promise<void> {
    ready.value = false
    const userId = userStore.user?.id
    if (supabase && userId) {
      const { data, error } = await supabase
        .from('learned_items')
        .select('entity_id')
        .eq('user_id', userId)
        .eq('locale', locale())
      if (!error && data) {
        learned.value = new Set(data.map((r) => r.entity_id))
        ready.value = true
        return
      }
      console.warn('[progress] load failed — falling back to local', error.message)
    }
    learned.value = new Set(readLocal()[locale()] ?? [])
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
          .eq('entity_id', entityId)
        if (error) console.warn('[progress] unlearn failed', error.message)
      } else {
        const { error } = await supabase
          .from('learned_items')
          .upsert(
            { user_id: userId, locale: locale(), entity_id: entityId },
            { onConflict: 'user_id,entity_id', ignoreDuplicates: true }
          )
        if (error) console.warn('[progress] mark failed', error.message)
      }
      return
    }

    // Signed-out / no credentials — localStorage fallback.
    const map = readLocal()
    const ids = new Set(map[locale()] ?? [])
    if (wasLearned) ids.delete(entityId)
    else ids.add(entityId)
    map[locale()] = [...ids]
    writeLocal(map)
  }

  return { learned, ready, refresh, isLearned, toggleLearned }
}