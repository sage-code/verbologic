/**
 * One-shot migration: express phonetic topic ownership as `sourceLang`.
 *
 * Before: 11 topics scoped by `langs`, each with a language-qualified title
 * ("Romanian alphabet & letters", "German alphabet & letters", …). Two problems:
 *   1. `langs` is a VISIBILITY filter, so nothing told the audio pipeline that
 *      a topic belongs to exactly one language — it synthesised nine voices and
 *      media-index discarded eight (86 % waste).
 *   2. The language-qualified titles duplicated the language the learner had
 *      already selected, and disagreed with the topic-title manifests, which
 *      already say the generic "Alphabet & letters".
 *
 * After: `sourceLang` states the ownership fact. The runtime shows a topic only
 * when `sourceLang` matches the active language, so the eleven topics are never
 * visible together — the sidebar reads as one "Alphabet & letters" and one
 * "Letter groups & sounds" per language, and audio generation makes one voice.
 *
 * Topic codes are unchanged: they key the media folders.
 *
 *   node scripts/migrate-phonetic-topics.mjs [--apply]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOCALES } from './lib/locales.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SIDEBAR = join(ROOT, 'src', 'data', 'sidebars', 'library', 'lectures', 'sidebar.json')
const apply = process.argv.includes('--apply')

/** The two phonetic subjects, with their title in every UI locale. */
const SUBJECTS = {
  letters: {
    en: 'Alphabet & letters',
    ro: 'Alfabet și litere',
    de: 'Alphabet & Buchstaben',
    ru: 'Алфавит и буквы',
    it: 'Alfabeto e lettere',
    es: 'Alfabeto y letras',
    fr: 'Alphabet et lettres',
    hu: 'Ábécé és betűk',
    pt: 'Alfabeto e letras'
  },
  groups: {
    en: 'Letter groups & sounds',
    ro: 'Grupuri de litere și sunete',
    de: 'Buchstabengruppen & Laute',
    ru: 'Группы букв и звуки',
    it: 'Gruppi di lettere e suoni',
    es: 'Grupos de letras y sonidos',
    fr: 'Groupes de lettres et sons',
    hu: 'Betűcsoportok és hangok',
    pt: 'Grupos de letras e sons'
  }
}

/** Topic codes that teach letter GROUPS rather than single letters. */
const GROUP_TOPICS = new Set(['LT01T02', 'LT01T08'])

const sidebar = JSON.parse(readFileSync(SIDEBAR, 'utf8'))
const chapter = sidebar.sections.find((s) => s.code === 'LT01')

let changed = 0
for (const topic of chapter.topics) {
  if (topic.phonetic !== true) continue
  const sourceLang = topic.langs?.[0] ?? topic.sourceLang
  if (!sourceLang) {
    console.warn(`skip ${topic.code}: no single source language`)
    continue
  }
  const subject = GROUP_TOPICS.has(topic.code) ? SUBJECTS.groups : SUBJECTS.letters

  // Rebuild `names` in registry order so the diff is stable and complete.
  topic.names = Object.fromEntries(LOCALES.map((l) => [l, subject[l] ?? subject.en]))
  // `sourceLang` replaces `langs`: the topic is not "hidden from" other
  // languages, it is OWNED by one — its content is that language's alphabet.
  delete topic.langs
  topic.sourceLang = sourceLang
  changed++
  console.log(`${topic.code}: "${subject.en}" · sourceLang=${sourceLang} · ${topic.items.length} item(s)`)
}

if (!apply) {
  console.log(`\n${changed} topic(s) would change (dry run — pass --apply to write)`)
  process.exit(0)
}

writeFileSync(SIDEBAR, `${JSON.stringify(sidebar, null, 2)}\n`, 'utf8')
console.log(`\nwrote ${SIDEBAR} (${changed} topic(s))`)
