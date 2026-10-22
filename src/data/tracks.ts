/**
 * Per-language learning-track metadata for the Library panels.
 *
 * The shared dictionary structure is available for every registered language.
 * Story routes share the same translated collection for every registered
 * language; lectures remain live only where that language has content.
 *
 * Live routes are served by src/pages/learn/[locale]/[track]/index.vue
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
    words: 405,
    tracks: { dictionary: '/learn/ro/dictionary', lectures: '/learn/ro/lectures', stories: '/learn/ro/stories' }
  },
  en: {
    words: 74,
    tracks: { dictionary: '/learn/en/dictionary', lectures: '/learn/en/lectures', stories: '/learn/en/stories' }
  },
  de: { words: 0, tracks: { dictionary: '/learn/de/dictionary', lectures: null, stories: '/learn/de/stories' } },
  ru: { words: 0, tracks: { dictionary: '/learn/ru/dictionary', lectures: null, stories: '/learn/ru/stories' } },
  it: { words: 0, tracks: { dictionary: '/learn/it/dictionary', lectures: null, stories: '/learn/it/stories' } },
  es: { words: 0, tracks: { dictionary: '/learn/es/dictionary', lectures: null, stories: '/learn/es/stories' } },
  fr: { words: 0, tracks: { dictionary: '/learn/fr/dictionary', lectures: null, stories: '/learn/fr/stories' } },
  hu: { words: 0, tracks: { dictionary: '/learn/hu/dictionary', lectures: null, stories: '/learn/hu/stories' } },
  pt: { words: 0, tracks: { dictionary: '/learn/pt/dictionary', lectures: null, stories: '/learn/pt/stories' } }
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