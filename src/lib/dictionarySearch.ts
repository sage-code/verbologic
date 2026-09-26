/**
 * dictionarySearch — pure helpers behind the roadmap's one search box
 * (WordSearchBar), live as the user types:
 *
 * - 1-2 folded characters: diacritic-folded PREFIX on `term` only — the
 *   classic letter scanner (fast, cheap, matches on every keystroke);
 * - 3+ characters ("looks like a word"): a SUBSTRING match against BOTH the
 *   target-language `term` and the rendered translation/gloss — so typing a
 *   word finds it whichever language you typed it in.
 *
 * `glossName` is the single source of truth for what the table's translation
 * column shows, so the text the user searches is always exactly the text they
 * see. Dependency-free (type-only imports) so plain node can import the
 * module for the verification script (temp/verify_dictionary_search.mjs).
 */
import type { MediaNames, MediaRow } from '~/types/media'

/** Lowercase + diacritics folded ('ă'→'a', 'ș'→'s') for prefix/substring matching. */
export function fold(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

/**
 * The translation (gloss) shown for a row: the UI language first — unless it
 * equals the row's target language, when the English canonical stands in
 * (the target-language column already shows the term) — then English.
 * Mirrors the gloss column of the dictionary table.
 */
export function glossName(names: MediaNames | undefined, targetLang: string, uiLang: string): string {
  if (!names) return ''
  const glossLang = uiLang !== targetLang ? uiLang : 'en'
  return names[glossLang] || names.en || ''
}

/** Below this length we only prefix-scan the term — short strings are treated
 *  as "the first letters", not yet a whole word worth of both-language search. */
const WORD_LENGTH_THRESHOLD = 3

/**
 * Does one row match the live search query?
 * - 1-2 characters: prefix match on the target-language term;
 * - 3+ characters: substring match on the term OR the translation/gloss —
 *   both languages, so the query matches however the user typed the word.
 */
export function matchesDictionaryQuery(
  row: Pick<MediaRow, 'term' | 'names' | 'lang'>,
  query: string,
  uiLang: string
): boolean {
  const folded = fold(query)
  if (!folded) return true
  if (folded.length < WORD_LENGTH_THRESHOLD) return fold(row.term).startsWith(folded)
  return (
    fold(row.term).includes(folded) || fold(glossName(row.names, row.lang, uiLang)).includes(folded)
  )
}
