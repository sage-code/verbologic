import { defineContentConfig, defineCollection } from '@nuxt/content'
import { z } from 'zod'

const LOCALES = ['en', 'ro', 'de', 'ru', 'it', 'es', 'fr', 'hu', 'pt'] as const
/** Languages with a live roadmap track (src/data/tracks.ts). */
const TRACK_LANGS = ['ro', 'en'] as const
/** Sidebar tracks that can host article topics (the content folder leaves). */
const TRACKS = ['dictionary', 'lectures', 'stories'] as const

/**
 * Content collections — the authoring layer for ARTICLE topics. A topic whose
 * sidebar `layout` is 'article' lists its docs here; the docs open on their
 * own prerendered pages, in ANY track:
 *
 *   content/<track>/<trackLang>/<TOPIC>/<ID>/<locale>.md
 *
 * The English document is the canonical original for lectures; every other
 * track's canonical document is the track language itself (stories: the story
 * IS the material). Translations carry `sourceSha` (sha1 of the canonical doc
 * they were made from) so the review tooling can flag stale translations the
 * moment the original changes.
 *
 * Front matter is validated here at build time and joined into the runtime
 * payloads by scripts/media-index.mjs (titles → names, per-locale review
 * state → content meta). The prose itself renders on the article's own
 * prerendered route — never through the client-side content database.
 */
export default defineContentConfig({
  collections: {
    articles: defineCollection({
      // 'page' — a 'data' collection stores only the front matter and drops the Markdown body.
      type: 'page',
      source: '**/*.md',
      schema: z.object({
        /** Which sidebar track the article topic lives in (the content folder leaf). */
        track: z.enum(TRACKS),
        /** Which roadmap the article belongs to (differs per language by design). */
        trackLang: z.enum(TRACK_LANGS),
        /** Language THIS document is written in (the explanation language). */
        locale: z.enum(LOCALES),
        /** Sidebar topic code, e.g. 'C1T01A'. */
        topic: z.string(),
        /** Stable article id — the progress key (learned_items.entity_id). */
        article: z.string(),
        /** Article title in this document's language. */
        title: z.string(),
        /** One-liner under the title (optional). */
        summary: z.string().optional(),
        status: z.enum(['draft', 'reviewed']).default('draft'),
        /** sha1 of the canonical doc this translation was made from. */
        sourceSha: z.string().optional(),
        reviewedAt: z.string().optional(),
        /** Media manifest id of the embedded video (optional — prose-only articles are fine). */
        video: z.string().optional(),
        /** Media manifest id of the lead image (optional). */
        image: z.string().optional(),
        /** Related dictionary/expression ids — the "practise these" strip. */
        related: z.array(z.string()).default([]),
        order: z.number().default(0),
        minutes: z.number().optional()
      })
    })
  }
})