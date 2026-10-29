/**
 * Phonetic content loader — resolves the alphabet for a target language and
 * the article pages of one letter.
 *
 * The data files are small (one per language, ~30 letters) and are inlined at
 * build time, so a phonetic topic renders with zero runtime round-trips.
 * A language without a data file simply has no alphabet yet — the topic then
 * renders disabled, exactly like an unwritten topic does.
 *
 * Letter articles are NOT Markdown: they are rendered from this data by
 * `PhoneticArticle.vue` (planning/performance-and-content-refactor.md §3
 * phase 3). One section = one page, the same pagination contract the reading
 * view has always had.
 */
import type { AlphabetData, PhoneticEntry, PhoneticSection } from '~/types/phonetic'
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

/**
 * The phonetic topic a code belongs to, or null when the code is not a
 * phonetic topic. Phonetic topics live in the Lectures track and declare
 * `phonetic: true` on a `directional` topic — `target` is the one language
 * whose sounds they teach.
 */
export function phoneticTopic(topicCode: string): { code: string; target: string | null } | null {
  const { all } = useSidebars()
  for (const sidebar of all()) {
    for (const section of sidebar.sections) {
      for (const topic of section.topics) {
        if (topic.code !== topicCode) continue
        if (topic.phonetic !== true || topic.mode !== 'directional') return null
        // `target` is null when the topic serves every language (each item
        // names its own language in its manifest).
        return { code: topic.code, target: topic.target ?? null }
      }
    }
  }
  return null
}

/**
 * The pages of one letter's article in one explanation language.
 *
 * An entry with authored `sections` yields one page per section, in reading
 * order. An entry that only has a `note` yields a single page — the
 * one-paragraph article it has always been — so the two forms coexist while
 * the richer content is authored.
 */
export function phoneticPages(entry: PhoneticEntry, locale: string): PhoneticSection[] {
  const sections = entry.sections?.[locale] ?? entry.sections?.en
  if (sections) {
    const ordered = [sections.sound, sections.howToSay, sections.spelling, sections.compare]
    const pages = ordered.filter((section): section is PhoneticSection => Boolean(section?.text))
    if (pages.length) return pages
  }
  const note = entry.note?.[locale] ?? entry.note?.en ?? ''
  return note ? [{ title: '', text: note }] : []
}

/** The one-line summary shown under the article title (the note's first line). */
export function phoneticSummary(entry: PhoneticEntry, locale: string): string {
  const note = entry.note?.[locale] ?? entry.note?.en ?? ''
  return note.split('\n')[0].slice(0, 160)
}
