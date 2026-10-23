/**
 * Phonetic content loader — resolves the alphabet for a target language.
 *
 * The data files are small (one per language, ~30 letters) and are inlined at
 * build time, so a phonetic topic renders with zero runtime round-trips.
 * A language without a data file simply has no alphabet yet — the topic then
 * renders disabled, exactly like an unwritten topic does.
 */
import type { AlphabetData, PhoneticEntry } from '~/types/phonetic'
import ro from '~/data/alphabets/ro.json'
import en from '~/data/alphabets/en.json'
import de from '~/data/alphabets/de.json'
import ru from '~/data/alphabets/ru.json'
import it from '~/data/alphabets/it.json'
import es from '~/data/alphabets/es.json'
import fr from '~/data/alphabets/fr.json'
import hu from '~/data/alphabets/hu.json'
import pt from '~/data/alphabets/pt.json'

const BY_LANG: Record<string, AlphabetData> = { ro, en, de, ru, it, es, fr, hu, pt } as Record<string, AlphabetData>

/** The alphabet of a target language, or null when it has none yet. */
export function alphabetFor(lang: string): AlphabetData | null {
  return BY_LANG[lang] ?? null
}

/** Every language that has phonetic content. */
export function alphabetLangs(): string[] {
  return Object.keys(BY_LANG)
}

/** All entries of a language (letters then groups), in teaching order. */
export function phoneticEntries(lang: string): PhoneticEntry[] {
  const data = alphabetFor(lang)
  return data ? [...data.letters, ...data.groups] : []
}

/** One entry by item code, or null. */
export function phoneticEntry(lang: string, code: string): PhoneticEntry | null {
  return phoneticEntries(lang).find((e) => e.code === code) ?? null
}
