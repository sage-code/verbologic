/**
 * Phonetic content — alphabets and letter groups.
 *
 * A phonetic topic teaches the SOUNDS of ONE target language. Unlike
 * dictionary/lecture prose (reversible: the same concept in every language),
 * the German alphabet is not a translation of the Romanian one — it is a
 * different object. So the facts that belong to the language (glyph, IPA,
 * example) are stored ONCE, and only the explanation varies per UI locale.
 *
 * Authoring surface: src/data/alphabets/<lang>.json, one file per language.
 * Manifests are DERIVED from these files, never hand-written. The article is
 * rendered by `PhoneticArticle.vue` from the same data — there is no Markdown
 * for a letter (planning/performance-and-content-refactor.md §3 phase 3).
 */
import type { MediaNames } from './media'

/**
 * One section of a phonetic article. The reading view paginates by section —
 * one section = one page — so each is short and self-contained.
 */
export interface PhoneticSection {
  /** Section heading in the explanation language. */
  title: string
  /** Section body (plain text; inline `**bold**` and `` `ipa` `` are rendered). */
  text: string
}

/**
 * The four sections of a phonetic article, in reading order. Every field is
 * optional: an entry that only has a `note` renders as the single-paragraph
 * article it always was, and gains sections as the content is authored.
 */
export interface PhoneticSections {
  sound?: PhoneticSection
  howToSay?: PhoneticSection
  spelling?: PhoneticSection
  compare?: PhoneticSection
}

/**
 * One pronunciation variant of a letter — the same glyph sounds different
 * depending on position, neighbouring letters, or the word's origin. Each
 * variant carries its own IPA and its own examples, so the article can teach
 * "A is /a/ in *casă*, but /ə/ in *casa*" instead of one flat transcription.
 */
export interface PhoneticVariation {
  /** IPA of this variant, e.g. "/ə/". */
  ipa: string
  /** When this variant occurs, in the explanation language. */
  when: string
  /** Example words in the target language, each with its own IPA. */
  examples: { word: string; ipa: string }[]
}

/** One letter or letter group of a target language. */
export interface PhoneticEntry {
  /** Stable item code (L001, L342, …) — the manifest/article id. */
  code: string
  /** The letter or group as written, e.g. "A", "th", "ea in seară". */
  glyph: string | null
  /** IPA transcription in the target language, e.g. "/aː/". */
  ipa: string | null
  /** The letter's name in the target language, when it differs from the glyph. */
  letterName: string | null
  /** Example word in the target language. */
  example: string | null
  /** IPA of the example word, e.g. "/ˈa.pfel/". */
  exampleIpa?: string | null
  /** The example word's meaning per UI locale — the translation column. */
  exampleTranslation?: MediaNames
  /** Pronunciation variants, in teaching order (most common first). */
  variations?: PhoneticVariation[]
  /** Explanation per UI locale — the only genuinely translated field. */
  note: MediaNames
  /**
   * Structured article sections per UI locale. Absent for an entry that has
   * only a `note`; the renderer then falls back to the one-paragraph form.
   */
  sections?: Record<string, PhoneticSections>
}

/** One language's phonetic content. */
export interface AlphabetData {
  /** Target language this alphabet belongs to. */
  lang: string
  /** Topic title per UI locale. */
  title: MediaNames
  /** Single letters, in teaching order. */
  letters: PhoneticEntry[]
  /** Multi-character groups (digraphs, diphthongs, silent patterns). */
  groups: PhoneticEntry[]
}
