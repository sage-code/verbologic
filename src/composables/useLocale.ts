/**
 * Client-side locale resolver over public/data/locales/*.json.
 * Supports all 9 interface languages; missing locale files gracefully
 * fall back to English (generic chrome) while the navigation JSON —
 * which is build-inlined — is fully localized.
 */

type LocaleDict = Record<string, unknown>

const LOCALE_CODES = ['en', 'ro', 'de', 'ru', 'it', 'es', 'fr', 'hu', 'pt'] as const
export type LocaleCode = (typeof LOCALE_CODES)[number]

/** Traverse a dotted key through a nested dictionary; resolve to a string or null. */
function lookup(dict: LocaleDict, key: string): string | null {
  const parts = key.split('.')
  let node: unknown = dict
  for (const part of parts) {
    if (typeof node !== 'object' || node === null) return null
    node = (node as LocaleDict)[part]
  }
  return typeof node === 'string' ? node : null
}

const cache = new Map<LocaleCode, LocaleDict>()

export function useLocale() {
  const lang = useState<LocaleCode>('app-locale', () => 'en')
  const dict = useState<LocaleDict>('locale-dict', () => ({}))

  const t = (key: string): string | null => lookup(dict.value, key)

  const isLoaded = () => Object.keys(dict.value).length > 0

  const setLocale = async (code: LocaleCode) => {
    lang.value = code
    const cached = cache.get(code)
    if (cached) {
      dict.value = cached
      return
    }
    let locale: LocaleDict
    try {
      locale = await $fetch<LocaleDict>(`/data/locales/${code}.json`)
    } catch {
      // Unlisted generic chrome (e.g. missing file) falls back to English.
      locale = cache.get('en') ?? (await $fetch<LocaleDict>('/data/locales/en.json'))
    }
    cache.set(code, locale)
    dict.value = locale
  }

  return { lang, t, isLoaded, setLocale }
}
