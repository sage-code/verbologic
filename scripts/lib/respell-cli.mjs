/**
 * respell-cli — expose `transliterate()` to the Python authoring scripts.
 *
 * The alphabet validator has to know what a page will SOUND like, not just
 * what it looks like: two different IPA symbols can respell to the same string
 * in the reader's language (Romanian reads both /æ/ and /ɑː/ as "a"), and a
 * page that lists them without a qualifier leaves the learner unable to tell
 * the variants apart by ear. That check needs the real transliterator, so this
 * CLI is the seam — reimplementing the map in Python would drift from it.
 *
 * Usage: echo '[{"ipa":"/æ/","lang":"ro"}]' | node scripts/lib/respell-cli.mjs
 * Prints a JSON array of respelled strings, in input order.
 */
import { transliterate } from './ipa-translit.mjs'

const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)

const input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '[]')
const out = input.map(({ ipa, lang }) => transliterate(String(ipa ?? ''), String(lang ?? 'en')))
process.stdout.write(JSON.stringify(out))
