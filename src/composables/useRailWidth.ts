// useRailWidth — the width of the curriculum tree beside tracks and articles.
//
// One width for every page that has the rail (the track tables and the article
// page), so dragging the splitter on one stays put on the next. The reader's
// choice lives in localStorage; the server always renders the default, and the
// stored value is applied after mount (see RailSplitter.vue).

/** The default rail width in px: the old 280px plus 20%. */
export const RAIL_DEFAULT = 336
export const RAIL_MIN = 220
export const RAIL_MAX = 640

const STORAGE_KEY = 'verbologic.rail-width'

const clampWidth = (px: number, max = RAIL_MAX): number =>
  Math.min(max, Math.max(RAIL_MIN, Math.round(px)))

export function useRailWidth() {
  const width = useState<number>('rail-width', () => RAIL_DEFAULT)

  /** Apply the stored width. Storage can be blocked or empty — never throw. */
  function restore(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const stored = raw === null ? Number.NaN : Number(raw)
      if (Number.isFinite(stored)) width.value = clampWidth(stored)
    } catch {
      // Private window or blocked storage: keep the default.
    }
  }

  /** Change the width while dragging; `max` keeps room for the content. */
  function set(px: number, max = RAIL_MAX): void {
    width.value = clampWidth(px, max)
  }

  /** Remember the current width for the next visit. */
  function save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, String(width.value))
    } catch {
      // Not persisted this time; the width still applies to this session.
    }
  }

  function reset(): void {
    width.value = RAIL_DEFAULT
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Nothing stored to remove.
    }
  }

  return { width, set, save, reset, restore }
}
