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
 * Manifests and articles are DERIVED from these files, never hand-written.
 */
import type { MediaNames } from './media'

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
  /** Explanation per UI locale — the only genuinely translated field. */
  note: MediaNames
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
