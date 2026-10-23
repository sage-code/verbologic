/**
 * Local media root override.
 *
 * The media payloads (public/data/media/**) bake ABSOLUTE R2 URLs at build time
 * — scripts/media-index.mjs joins src/data/media.config.json's `root` with each
 * manifest key. That is right for production (one CDN origin, no runtime
 * lookup) but wrong for local development: until the files are uploaded to R2,
 * every audio request 404s.
 *
 * Setting NUXT_PUBLIC_MEDIA_ROOT rewrites the origin of every media URL as the
 * payloads are loaded, so the same build can play audio from a local static
 * server. Empty (the default) leaves the baked URLs untouched.
 *
 *   NUXT_PUBLIC_MEDIA_ROOT=http://localhost:4180/
 *   .venv\Scripts\python.exe -m http.server 4180 --directory media
 */
import type { MediaMedia, MediaRecords, MediaSearchIndex, MediaTitles } from '~/types/media'

/** Trailing-slash-normalized override root, or '' when unset. */
function overrideRoot(): string {
  const configured = useRuntimeConfig().public.mediaRoot as string | undefined
  if (!configured) return ''
  return configured.endsWith('/') ? configured : `${configured}/`
}

/**
 * Rewrite a baked media URL onto the override origin, keeping its path.
 * Returns the input unchanged when no override is set or the URL is null.
 */
export function localMediaUrl(url: string | null): string | null {
  const root = overrideRoot()
  if (!root || !url) return url
  try {
    const parsed = new URL(url)
    return `${root}${parsed.pathname.replace(/^\//, '')}`
  } catch {
    // Relative or malformed URL — leave it alone rather than corrupt it.
    return url
  }
}

/** The minimum shape every media payload row shares. */
interface MediaUrlCarrier {
  media: { url: string | null }
  read?: { url: string | null } | null
}

/** Rewrite one row's media + read URLs, preserving its concrete type. */
function rewriteRecord<T extends MediaUrlCarrier>(record: T): T {
  return {
    ...record,
    media: { ...record.media, url: localMediaUrl(record.media.url) },
    read: record.read ? { ...record.read, url: localMediaUrl(record.read.url) } : record.read
  }
}

/** Rewrite every record of a topic payload. */
export function localizeMediaRecords(payload: MediaRecords): MediaRecords {
  if (!overrideRoot()) return payload
  return payload.map(rewriteRecord)
}

/** Rewrite every record of a search payload (an object wrapping `records`). */
export function localizeMediaSearch(payload: MediaSearchIndex): MediaSearchIndex {
  if (!overrideRoot()) return payload
  return { ...payload, records: payload.records.map(rewriteRecord) }
}

/** Rewrite the chapter/topic title audio maps. */
export function localizeMediaTitles(payload: MediaTitles): MediaTitles {
  if (!overrideRoot()) return payload
  const rewriteMap = (map: Record<string, Record<string, MediaMedia>>) =>
    Object.fromEntries(
      Object.entries(map).map(([code, byLang]) => [
        code,
        Object.fromEntries(
          Object.entries(byLang).map(([lang, media]) => [lang, { ...media, url: localMediaUrl(media.url) }])
        )
      ])
    )
  return { ...payload, chapters: rewriteMap(payload.chapters), topics: rewriteMap(payload.topics) }
}
