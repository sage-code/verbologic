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
import { LOCALES } from './locales'

export const TRACK_IDS = ['dictionary', 'lectures', 'stories'] as const

export type TrackId = (typeof TRACK_IDS)[number]

export interface TrackMeta {
  /** Total vocabulary items available in the track (progress denominator). */
  words: number
  /** In-app route per track id, or null while that track is not live. */
  tracks: Record<TrackId, string | null>
}

/** Every registered language gets all three tracks live — the routes are
 *  prerendered for each of them from navigation.json (nuxt.config.ts). */
const liveTracks = (locale: string): Record<TrackId, string | null> => ({
  dictionary: `/learn/${locale}/dictionary`,
  lectures: `/learn/${locale}/lectures`,
  stories: `/learn/${locale}/stories`
})

/** Progress denominators per language (0 = no vocabulary counted yet). */
const WORD_COUNTS: Record<string, number> = { ro: 405, en: 74 }

export const TRACKS: Record<string, TrackMeta> = Object.fromEntries(
  LOCALES.map((locale) => [locale, { words: WORD_COUNTS[locale] ?? 0, tracks: liveTracks(locale) }])
)

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