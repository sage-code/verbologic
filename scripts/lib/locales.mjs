/**
 * Locale registry loader for Node scripts.
 *
 * Reads src/data/navigation.json — the single source of truth for the set of
 * interface languages — so no script re-declares the list. Mirrors
 * src/data/locales.ts (Vue/TS) and scripts/lib/locales.py (Python).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Every registered interface language, in navigation.json order. */
export const LOCALE_ENTRIES = JSON.parse(
  readFileSync(join(ROOT, 'src', 'data', 'navigation.json'), 'utf8')
).languages

/** Lowercase locale codes, in navigation.json order. */
export const LOCALES = LOCALE_ENTRIES.map((l) => l.locale)

/** The fallback locale — canonical language for shared article prose. */
export const DEFAULT_LOCALE = 'en'

/** True when `value` is a registered locale code. */
export const isLocale = (value) => typeof value === 'string' && LOCALES.includes(value)
