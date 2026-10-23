/**
 * dictionarySearch — pure helpers behind the roadmap's one search box
 * (WordSearchBar), live as the user types:
 *
 * - 1-2 folded characters: diacritic-folded PREFIX on the term or any
 *   registered translation;
 * - 3+ characters: SUBSTRING match across the term and all translations.
 *
 * Dependency-free (type-only imports) so plain node can import the module
 * for the verification script (temp/verify_dictionary_search.mjs).
 */
import type { MediaNames, MediaRow } from '~/types/media'

/** Lowercase + diacritics folded ('ă'→'a', 'ș'→'s') for prefix/substring matching.
 *  Null-safe: manifests carry `null` for locales that have no translation yet. */
export function fold(value: string | null | undefined): string {
  if (typeof value !== 'string') return ''
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

/**
 * The native gloss shown for a row (the first column of the word table): the
 * UI language first — unless it equals the row's target language, when the
 * English canonical stands in (the target-language column already shows the
 * term) — then English.
 */
export function glossName(names: MediaNames | undefined, targetLang: string, uiLang: string): string {
  if (!names) return ''
  const glossLang = uiLang !== targetLang ? uiLang : 'en'
  return names[glossLang] || names.en || ''
}

/** Below this length we only prefix-scan the term — short strings are treated
 *  as "the first letters", not yet a whole word worth of both-language search. */
const WORD_LENGTH_THRESHOLD = 3

/** Prefixes for short queries and substrings for longer queries across all names. */
export function matchesDictionaryQuery(
  row: Pick<MediaRow, 'term' | 'names' | 'lang'>,
  query: string,
  _uiLang: string
): boolean {
  const folded = fold(query)
  if (!folded) return true
  // `names` values are null for locales without a translation — fold() drops them.
  const names = [row.term, ...Object.values(row.names ?? {})].map(fold).filter(Boolean)
  if (folded.length < WORD_LENGTH_THRESHOLD) {
    return names.some((name) => name.startsWith(folded))
  }
  return names.some((name) => name.includes(folded))
}
