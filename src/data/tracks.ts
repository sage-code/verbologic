/**
 * Per-language learning-track metadata for the Library panels.
 * Only languages with a live track page have an entry; languages without one
 * resolve `route: null` and the panel shows a "coming soon" state.
 * Word totals mirror the decoupled entity collections in public/data/entities/
 * (ro: 532 entities across vocabulary/sentences/imperative/questions/greetings/
 * alphabet; en: 74 alphabet rows).
 */
export interface TrackMeta {
  /** In-app route of the track page, or null while the track is not live. */
  route: string | null
  /** Total vocabulary items available in the track (progress denominator). */
  words: number
}

export const TRACKS: Record<string, TrackMeta> = {
  ro: { route: '/ro', words: 532 },
  en: { route: '/en', words: 74 }
}

/** Track metadata for a language; unknown languages resolve to a stub. */
export function trackFor(locale: string): TrackMeta {
  return TRACKS[locale] ?? { route: null, words: 0 }
}