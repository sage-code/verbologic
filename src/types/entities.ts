/**
 * Decoupled entity schema — mirror of the legacy extraction spec.
 * Language-neutral objects; all UI strings live in public/data/locales/*.json.
 */

export interface TranslationMap {
  en?: string
  es?: string
  it?: string
  fr?: string
  ro?: string
}

export type EntityType = 'word' | 'sentence' | 'question' | 'imperative' | 'letter' | 'greeting'
export type Lang = 'ro' | 'en'

export interface CategoryRef {
  id: string
  title: string
}

export interface VerbologicEntity {
  id: string
  type: EntityType
  lang: Lang
  term: string
  ipa: string | null
  /** English alphabet rows only: a target-language example word. */
  example?: string
  /** Glosses in other languages (en for ro entities, ro for en entities). */
  translations: TranslationMap
  /** Usage context (greetings) or pronunciation pattern description (en alphabet). */
  context?: string | null
  /** Thematic section, ro_vocabulary rows only. */
  category?: CategoryRef | null
  /** R2 URL, or null when TTS regeneration is queued. */
  audio: string | null
}

/** Entity collections per target language, matching public/data/entities files. */
export const ENTITY_FILES: Record<Lang, readonly string[]> = {
  ro: [
    'ro_vocabulary',
    'ro_sentences',
    'ro_imperative',
    'ro_questions',
    'ro_greetings',
    'ro_alphabet'
  ],
  en: ['en_alphabet']
}
