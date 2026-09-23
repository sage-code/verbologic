/**
 * Per-language learning-track metadata for the Library panels.
 *
 * Each owned language exposes three distinct tracks — Dictionary, Lectures and
 * Stories. Only languages with live content have an entry in TRACKS; every
 * track without a live route resolves `null` and the panel shows the
 * "coming soon" state for that track.
 *
 * Live routes are served by src/pages/learn/[locale]/[track].vue
 * (Dictionary renders the shared RoadmapShell). All 9 languages × 3 tracks
 * are pre-rendered from src/data/navigation.json in nuxt.config.ts.
 *
 * Word totals mirror the decoupled entity collections in public/data/entities/
 * (ro: 532 entities across vocabulary/sentences/imperative/questions/greetings/
 * alphabet; en: 74 alphabet rows).
 */

export const TRACK_IDS = ['dictionary', 'lectures', 'stories'] as const

export type TrackId = (typeof TRACK_IDS)[number]

export interface TrackMeta {
  /** Total vocabulary items available in the track (progress denominator). */
  words: number
  /** In-app route per track id, or null while that track is not live. */
  tracks: Record<TrackId, string | null>
}

export const TRACKS: Record<string, TrackMeta> = {
  ro: {
    words: 532,
    tracks: { dictionary: '/learn/ro/dictionary', lectures: null, stories: null }
  },
  en: {
    words: 74,
    tracks: { dictionary: '/learn/en/dictionary', lectures: null, stories: null }
  }
}

/** Track metadata for a language; unknown languages resolve to a stub. */
export function trackFor(locale: string): TrackMeta {
  return TRACKS[locale] ?? { words: 0, tracks: emptyTracks() }
}

/** All track routes nulled — the stub shape for languages without content. */
function emptyTracks(): Record<TrackId, string | null> {
  return { dictionary: null, lectures: null, stories: null }
}

/** In-app route of one track for a language, or null when it is not live. */
export function trackRoute(locale: string, track: TrackId): string | null {
  return trackFor(locale).tracks[track] ?? null
}

/** True when the track has a live route for the language. */
export function isTrackLive(locale: string, track: TrackId): boolean {
  return trackRoute(locale, track) !== null
}