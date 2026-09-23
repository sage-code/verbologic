/**
 * dictionarySearch — pure helpers behind the Dictionary track's search box.
 *
 * The toolbar commits the query only on Enter / the filter button (never while
 * typing); the store then matches rows through `matchesDictionaryQuery`:
 *
 * - term mode (filter off): diacritic-folded PREFIX on `term` — the classic
 *   letter scanner, scoped to the open topic (unchanged behavior);
 * - translation mode (filter on): diacritic-folded SUBSTRING on the row's
 *   rendered translation — searched across the WHOLE dictionary.
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

/**
 * Does one row match the committed dictionary query?
 * - translation mode: substring match on the rendered gloss (missing glosses
 *   never match — there is nothing displayed to find);
 * - term mode: prefix match on the target-language term (1–2 letters typical).
 */
export function matchesDictionaryQuery(
  row: Pick<MediaRow, 'term' | 'names' | 'lang'>,
  query: string,
  inTranslation: boolean,
  uiLang: string
): boolean {
  const folded = fold(query)
  if (!folded) return true
  if (inTranslation) return fold(glossName(row.names, row.lang, uiLang)).includes(folded)
  return fold(row.term).startsWith(folded)
}
