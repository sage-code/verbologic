/**
 * useLanguageNames — localized display names for the 9 interface languages,
 * rendered in the language currently set on the toolbar.
 *
 * Data: src/data/language-names.json, shaped
 * { "<ui locale>": { "<target locale>": "Name" } } — a 9 × 9 matrix that is
 * **build-inlined** (imported like navigation.json, zero runtime round-trips),
 * so the names cannot 404 and the list re-renders synchronously when the
 * toolbar language changes — no network race, no first-paint flash.
 * Fallback chain lives in useNavigation.languageName().
 */
import languageNamesJson from '~/data/language-names.json'

const languageNames: Record<string, Record<string, string>> = languageNamesJson

export function useLanguageNames() {
  const { lang } = useLocale()

  /** Name of `locale` in the active UI language, or null when unavailable. */
  function nameFor(locale: string): string | null {
    const name = languageNames[lang.value]?.[locale] ?? null
    if (!name && import.meta.dev) {
      console.warn(`[language-names] missing name for '${locale}' in UI locale '${lang.value}'`)
    }
    return name
  }

  return { nameFor }
}
