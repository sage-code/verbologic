/**
 * Locale registry — the ONE place the set of interface languages is declared.
 *
 * `src/data/navigation.json` is the source of truth (it already drives the
 * prerender list in nuxt.config.ts and the language picker). This module is the
 * typed view of it for Vue/TS code, so no file has to re-declare the list.
 *
 * The Node and Python pipelines read the same JSON directly through
 * scripts/lib/locales.mjs and scripts/lib/locales.py — one file, three readers.
 *
 * Adding a language = add one entry to navigation.json `languages[]`, then add
 * its glosses to language-names.json. Nothing else enumerates locales.
 */
import navigation from './navigation.json'

export interface LocaleEntry {
  /** Uppercase display code used by the language picker (EN, RO, SP, …). */
  code: string
  /** Endonym shown in the picker. */
  label: string
  /** ISO-3166 country code resolving to a bundled SVG flag (LanguageFlag.vue). */
  flag: string
  /** Lowercase locale code — the key used everywhere in content and media. */
  locale: string
}

/** Every registered interface language, in navigation.json order. */
export const LOCALE_ENTRIES: readonly LocaleEntry[] = navigation.languages

/** Lowercase locale codes, in navigation.json order. */
export const LOCALES: readonly string[] = LOCALE_ENTRIES.map((l) => l.locale)

/** Union of the registered locale codes, e.g. 'en' | 'ro' | … */
export type Locale = (typeof LOCALE_ENTRIES)[number]['locale']

/** The fallback locale — canonical language for shared article prose. */
export const DEFAULT_LOCALE = 'en'

/** True when `value` is a registered locale code. */
export function isLocale(value: unknown): value is string {
  return typeof value === 'string' && LOCALES.includes(value)
}

/** Registry entry for a locale code, or undefined when unregistered. */
export function localeEntry(locale: string): LocaleEntry | undefined {
  return LOCALE_ENTRIES.find((l) => l.locale === locale)
}
