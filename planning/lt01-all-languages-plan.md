# LT01 for every language: sound first, then content, language by language

Date: 2026-11-01. Follows `planning/lt01-english-plan.md` (English done) and `planning/status-2026-11-01.md`.
Rule for the whole plan: **the sound must match the name**. A topic or item clip speaks exactly the name the site shows in that language, and nothing ships with a missing clip.

## Where things stand (measured today)

| Topic x target | Items | Title clips | Pages (languages) | Read audio |
| --- | --- | --- | --- | --- |
| T01 ro, en | 31, 26 | complete | 9 of 9 | complete |
| T01 de ru it es fr hu pt | 30, 33, 26, 27, 26, 43, 26 | complete | **1 of 9 (English only)** | complete for that page |
| T02 ro, en | 23, 53 | complete | 9 of 9 | complete |
| T02 de ru it es fr hu pt | none | n/a | **no items** | n/a |
| T03 to T06 en | 12, 14, 12, 12 | complete | 9 of 9 | complete |
| T03 to T06 ro | 20, 15, 12, 18 | complete | **1 of 9** (3 old ro pages in T03) | complete for those |
| T03 to T06 de ru it es fr hu pt | none | n/a | **no items** | n/a |

Title clips for items are complete in all 9 languages (4,131 of 4,131; letters unreadable by a reader's voice reuse the clip of the letter's own language). **But three topic-title clips speak an old name** (the manifest name differs from the sidebar name the site shows), in every language:

| Topic | Site shows (en) | Clip speaks (en) |
| --- | --- | --- |
| LT01T02 | Letter groups & sounds | Vowel & consonant groups |
| LT01T04 | Sound changes & spelling patterns | Sound alternations & phonetic shifts |
| LT01T01 (ro only) | Alfabet și litere | Alfabetul și literele |

LT01T04 also carries a stale Russian `ttsText`. Chapter LT01 and topics T03, T05, T06 match.

## Part 1. Sound foundation (do this before any new content)

**S1. Make topic titles match (about 19 clips).** Set each LT01 title manifest's `name` (and `ipa`) to the sidebar topic name in every language, remove the stale `ttsText`, delete the 19 old clips, regenerate with `generate-audio.py --audio` on the title manifests (they are `topic-title` items under `media/lectures/LT01/<TOPIC>/item.json`). Check each by reading the manifest back. *Review: play the three topic titles in three languages.*

**S2. Never drift again: a guard in `./run.sh validate`.** New check: for every chapter/topic/item manifest, `locales[l].name` (or `ttsText`) must equal what the site shows (sidebar names for titles, `terms` of the article for items), and every shown name needs a clip file. A mismatch or a missing clip is an error, not a warning.

**S3. Record what was spoken.** `generate-audio.py` stores the SHA-1 of the spoken text beside the clip's bytes and sha1 in `files` (`"text": "<sha1>"`). From then on a name change makes the clip *detectably stale* and `media upload` only needs the changed ones. The 4,131 existing item clips and 63 title clips have no such record, so:
- **S3a. Baseline** (pick one; recommended: sample first). (1) Trust them. (2) Sample 200 clips across languages, transcribe each with Gemini's audio input and compare with the expected name; if more than about 2% differ, go to (3). (3) Regenerate all 4,194 clips once (about 1.5 hours unattended, no content change) and the records start clean. Letters whose clip is a copy of the target-language clip get `"copyOf": "sound/<target>.mp3"` so the audit knows they are intentional.

**S4. Coverage report.** Extend `./run.sh missing` with a "Sound coverage" table: per topic x target x language, title clips present/expected, read clips present/expected, stale. It becomes the checklist for every language below.

**S5. Voice failures are fixed at the source.** Document in `manual/MAINTENANCE.md` section 3.3: unreadable glyphs reuse the target clip (`fill-letter-clips.mjs`); other refusals get a `ttsText` respelling (existing rule); Russian and Hungarian stalls: run per language with a timeout and re-run (skipped files cost nothing).

*Done when:* `./run.sh missing` shows 100% title and read coverage, 0 stale, 0 mismatched; `validate` passes with the new guard.

## Status of part 1 (2026-11-01): DONE

- S1: the 19 title clips were re-recorded after `sync-title-names.mjs` copied the sidebar names into the title manifests (three topic descriptions were also wrong and were corrected).
- S2: `validate` now fails, for the chapters in `scripts/lib/sound-chapters.mjs` (LT01), on a title name that differs from the sidebar, a shown name without a clip, or a clip whose recorded text is not what the site shows now (`audit-sound.mjs`). Tested with a deliberate rename.
- S3: `generate-audio.py` records the SHA-1 of what each clip says (`text`; `copyOf` for reused letter clips). Baseline by sampling: sample 1 (200 clips) found 190 right, with the mismatches concentrated in the Romanian lessons of T05 whose titles were renamed after recording, so all 585 clips of the Romanian lessons in T03 to T06 were re-recorded. Sample 2 (200 more) found no real stale clip (5 misses: 3 voice pronunciations of foreign words, 2 judge false alarms). The remaining unverified clips were stamped as trusted: 5,xxx clips, audit clean.
- S4: `./run.sh missing` ends its report with the sound audit table.
- S5: `manual/MAINTENANCE.md` section 3.3, "Sound must match the name".
- Known limit: a voice mispronounces foreign words (the Russian voice says "Утю" for "Would you"); fixing it needs a per-language `ttsText`, not a re-recording.

Part 2 (content, language by language) starts with Romanian.

## Part 2. Content, language by language

Order (cheapest first, each ends with build, review and deploy before the next):

1. **Romanian (finish).** Letters and groups are done. Missing: T03 to T06 pages in 8 more languages for the 65 existing items (seed `scripts/seeds/lectures-LT01-ro.json` already holds hand-written IPA). The old English pages of those items quote words outside their seed (`--check` found 75 problems), so regenerate them: `create-lecture-articles.py --target ro --topic LT01T0n --locales all --overwrite --apply`. About 65 x 9 = 585 pages and read clips. Rewrite the three old translated pages (L627 to L629).
2. **Spanish, Italian, French, German, Portuguese** (Latin alphabets, voices read the glyphs): the same seven steps as English for each.
3. **Russian and Hungarian last** (Cyrillic and 43 letters; voice quirks, more retries, native review matters most).

Steps per language (mirrors the English tasks, with the lessons learned):

| Step | Work | Size (rough) |
| --- | --- | --- |
| L1 T01 explanations | Regenerate the letter pages in the other 8 languages from `src/data/alphabets/<lang>.json` (`generate-alphabet-content.py --lang xx`, then `converge-alphabet-pages.py --lang xx`, then `alphabet-to-articles.mjs --target xx --locales all`); fix `exampleTranslation` by hand where the generator is wrong; `verify-alphabet-glosses.py --lang xx` | 26 to 43 letters x 8 languages |
| L2 T02 groups | Author the group list the language needs (curriculum section 4: es diphthongs, `ll ch qu gu rr`; it `gn gl sc ch gh`, double consonants; fr nasal vowels, `ou oi eau gn ill`; de `ch sch ei ie eu`, umlauts; pt nasal vowels, `lh nh ão`; ru hard/soft pairs, `ь ъ ё`; hu digraphs and long/short vowels) as `groups` in the alphabet JSON with hand-written IPA, then pages in 9 languages, names for the manifests (`add-lt01-english-groups.mjs` is the template) | about 30 to 50 groups x 9 |
| L3 to L6 T03 to T06 | Seed rows (stress and syllables, spelling patterns, elision and contractions, intonation and punctuation) per language, 12 to 15 each, then `create-lecture-articles.py --target xx --topic LT01T0n --locales all --apply` | about 50 lessons x 9 |
| L7 Sound | Title clips for every item and topic, read clips for every page, then S4 coverage must be 100% | automatic |
| L8 Review | Read the target-language pages yourself or send to a native reviewer: IPA, examples, wrong claims | per language |

Per language about 1,000 pages and as many read clips; Romanian alone is about 600. Do not start a language before the previous one is deployed and reviewed.

## Rules that must carry over (from the English run)

- Seed `exampleTranslation` and glosses by hand; the generator translated other words for 15 of 22 groups.
- Pick examples that are not cognates in the reader languages (nature, train, social broke the "bare word" check). For a language pair with many cognates expect more retries.
- Read every target-language page as the language's own teacher would; the bugs found were factual (doubled consonants "held longer", "I've" = possess, wrong open/closed syllable).
- Never filter checker output with `sed`; use `converge-alphabet-pages.py`, which re-checks everything each round.
- Hand-written IPA only (General American for English, the standard of the taught language otherwise); native review before publishing.
- `./run.sh publish` already uploads media and syncs the database; run `media prune` (dry run first) after each language to drop retired files.

## Decisions I need from you

1. Language order (default above), or should Romanian wait?
2. S3a baseline: sample first (recommended), trust, or regenerate everything?
3. Do you want native reviewers (you or others) per language before it is deployed, or deploy and fix after?
