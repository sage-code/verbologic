# Lectures after LT01: grammar first, then the country

Date: 2026-11-02. Replaces the LT02 to LT12 outline in `manual/curriculum.md` (Lectures section).
**Status 2026-11-02:** your answers are applied and Phase 0 step 0.1 is done (see "Phase 0 result" at the end). LT01 stays as it is; the rest of this plan is to be completed and finalised later.

Decisions taken: (1) LT02 is a brief introduction to grammar with one topic per category of word; (2) "the country" means the home country **and** the other countries that speak the language, including its colonial spread; (3) learner progress for purged items is deleted; (4) chapters LT15 to LT17 are dropped, so the curriculum ends at LT14. Where the text below still mentions LT15 to LT17, the older LT02 outline, or the open questions, the "Phase 0 result" section and `manual/curriculum.md` are authoritative.

## Why the old LT02 to LT12 goes

Measured today:

| Chapter | Items | What they are | Verdict |
| --- | --- | --- | --- |
| LT01 | 466 | Letters, groups, syllables, stress, sound changes, elision, intonation (articles + audio) | **Keep** |
| LT02 | 412 | Sentence, question and command lists (`sentence_*`, `question_*`) | Purge |
| LT03 to LT12 | 7 to 27 each | Phrase lists and a few `ro`-only rows; most topics hold 1 to 3 items | Purge |

The old order mixes a phrasebook (greetings, shopping, health) with grammar (pronouns, cases, tenses), repeats ideas (questions in LT02, conditionals in LT08 and LT10), and teaches a topic by listing expressions. A learner never gets the *rules*. The new order explains the rules after the sounds, and ends with the country.

## Principles

1. **Every lecture item is an article.** No row exists without an article behind it. No list of words or phrases is a lesson. Examples appear *inside* an article, as a short table or bullet list, always with a reason ("these three verbs end in -ez because...").
2. **A chapter is a concept, the same for every language.** Topic names are generic English concepts (`Gender`, `Cases`, `Subjunctive`). If a language lacks the feature, its article says so and teaches how that language does the same job (English has no noun gender, so the article shows what `he/she/it` and `-ess` do instead). A topic is never empty for a language; it is never skipped.
3. **Directional topics, many items per language.** Each article targets one language (`"target": "ro"`). A topic may hold several articles per language; the culture chapters use this (one article per city, per festival). Topics stay generic; the items carry the country.
4. **Rules come from data, prose comes from the model.** Paradigm tables (conjugations, declensions, plurals) are rendered from a hand-checked seed file, as for the LT01 closed word list. The model writes the explanation around them and may quote only seed examples. This keeps wrong forms and invented IPA out.
5. **Written natively per language, never translated.** One English outline per article (headings, seed examples, one idea per section), then the article is written for each explanation language from that outline. Missing languages fall back to English, as today.
6. **Format.** Headers (`##` starts a reading page), bullet lists and tables. The reader (`src/lib/article.ts` into `ArticleText`) renders parsed headings, lists and tables, not raw HTML, so write them as article blocks. To verify in Phase 1.
7. **Length.** A concept article is 600 to 1,200 words, 3 to 6 `##` sections, at least one table. The two overview articles in LT02 may be longer.

## The new curriculum (17 chapters, 108 topics)

Level is CEFR (`A1`..`C2`), set per topic as today.

### Part A. Grammar (LT02 to LT10)

**LT02 Sentences & Word Classes** (A1) - the map of grammar

| Topic | Article |
| --- | --- |
| T01 Sentences & phrases | **Overview article.** What a sentence, clause and phrase are. Kinds of sentence (statement, question, command, exclamation). Subject and predicate. The ten word classes: noun, pronoun, article, adjective, verb, adverb, preposition, conjunction, numeral, interjection. The grammar concepts used everywhere after this: gender, number, case, person, tense, mood, voice, aspect, agreement, word order. A table per group, one line each, with one example. |
| T02 Nouns, pronouns & articles | Elaborates the "naming" word classes: what each is, subtypes, how it changes, with examples. |
| T03 Adjectives, numerals & adverbs | Elaborates the "describing" word classes. |
| T04 Verbs | What a verb carries (person, number, tense, mood, voice, aspect), infinitive, stem and ending, auxiliary and main verbs, regular and irregular. |
| T05 Prepositions, conjunctions & interjections | Elaborates the "linking" classes. |
| T06 Gender, number, case & person | The four categories of nouns, pronouns and verbs; which of them this language has. |
| T07 Tense, mood, voice & aspect | The four categories of the verb; which of them this language has. |
| T08 Word order & agreement | Basic order (SVO or other), what moves for emphasis, what must agree with what. Ends with a one-page "grammar sheet" of the language. |

**LT03 Nouns & Noun Phrases** (A1 to A2): T01 Kinds of noun (common, proper, countable, abstract, collective) / T02 Gender / T03 Plural formation / T04 Articles & determiners / T05 Adjectives: agreement and position / T06 Demonstratives, possessives & quantifiers / T07 Comparison: comparative and superlative / T08 Building a noun phrase.

**LT04 Pronouns** (A1 to A2): T01 Personal pronouns & dropped subjects / T02 Object pronouns: direct, indirect, stressed forms / T03 Reflexive & reciprocal / T04 Possessive & demonstrative pronouns / T05 Relative & interrogative pronouns / T06 Indefinite & negative pronouns / T07 Address & politeness (you: familiar vs formal).

**LT05 Cases & Prepositions** (A2 to B1): T01 What cases do / T02 Subject and object marking / T03 Possession & recipients / T04 Prepositions of place & direction / T05 Prepositions of time & other relations / T06 Government: which case follows which word (or suffixes and postpositions, where that is how the language works).

**LT06 Verbs: Present & Questions** (A1 to A2): T01 Verb anatomy: stem, ending, classes / T02 Being, having & existence / T03 The present tense: regular verbs / T04 Irregular & stem-changing verbs / T05 Modal & auxiliary verbs / T06 Reflexive & impersonal verbs / T07 Negation / T08 Forming questions / T09 Commands & requests.

**LT07 Past, Future & Aspect** (A2 to B1): T01 Past: completed actions / T02 Past: habits & ongoing / T03 Perfect, pluperfect & telling a story / T04 Future / T05 Aspect (perfective and imperfective) & time expressions / T06 Infinitive, participle & gerund.

**LT08 Moods & Voice** (B1 to B2): T01 Subjunctive / T02 Conditional / T03 Passive voice / T04 Impersonal constructions / T05 Evidential & presumptive forms (where the language has them) / T06 Expressing obligation, possibility & permission.

**LT09 Building Sentences** (B1 to B2): T01 Word order & emphasis / T02 Adverbs & adverbials: time, place, manner, frequency / T03 Numbers, dates & time in grammar / T04 Coordination / T05 Subordination: relative, time, cause, purpose, result / T06 Conditional sentences & concession / T07 Reported speech / T08 Linking a text: discourse markers.

**LT10 Words, Register & Style** (B2 to C1): T01 Word formation: prefixes, suffixes, compounds / T02 Diminutives, augmentatives & feeling / T03 Register & formality / T04 How idioms and collocations work (the patterns, not lists of them) / T05 Written style: formal, academic, literary.

### Part B. The country (LT11 to LT17)

Each topic is generic; each language fills it with articles about its own country (primary country first; see the open decisions). The four chapters you named come first, then three I propose.

**LT11 Culture & Tradition** (A2 to B2): T01 Family & daily customs / T02 Holidays & festivals / T03 Food & drink / T04 Music, dance & folk art / T05 Beliefs, religion & folklore / T06 Etiquette & manners.

**LT12 Places & Landscape** (A2 to B2): T01 The country at a glance / T02 Regions / T03 The capital / T04 Cities & towns / T05 Villages & rural life / T06 Mountains, rivers & coasts / T07 Landmarks & heritage sites.

**LT13 History & People** (B1 to C1): T01 Origins & early history / T02 From the Middle Ages to modern times / T03 The modern state / T04 Rulers & leaders / T05 Writers, thinkers & artists / T06 Migration, minorities & the country abroad.

**LT14 Science & Discoveries** (B1 to C1): T01 Scientists & inventors / T02 Discoveries & firsts / T03 Technology & industry / T04 Medicine & health / T05 Universities, research & space.

**LT15 Arts & Letters** (proposed, B2 to C1): T01 Literature / T02 Painting & sculpture / T03 Architecture / T04 Theatre & cinema / T05 Design & craft.

**LT16 The Language Itself** (proposed, B2 to C2): T01 Origins & language family / T02 Dialects & regions / T03 Loanwords & borrowing / T04 The writing system & its reforms / T05 The language in the world today.

**LT17 Modern Society** (proposed, B2 to C1): T01 Government & institutions / T02 Education / T03 Economy & work / T04 Media & communication / T05 Sport & leisure.

### How the same topic differs by language

| Feature | ro | en | de | ru | it | es | fr | pt | hu |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Noun gender | 3 | only pronouns | 3 | 3 | 2 | 2 | 2 | 2 | none |
| Cases on nouns | 5 | none | 4 | 6 | none | none | none | none | about 18 |
| Articles | suffix | yes | yes | none | yes | yes | yes | yes | yes |
| Aspect | no | partly | no | **yes** | no | no | no | no | no |
| Subject often dropped | yes | no | no | no | yes | yes | no | yes | yes |

Topics such as `Cases` or `Aspect` stay in the curriculum for every language. For `it`, `es`, `fr`, `pt` the `Cases` article is short and explains pronoun forms and prepositions. This table goes into the Phase 1 authoring brief so each article states what its language does.

## Phase 0. Purge (first, in two steps)

**Scope** (everything except LT01): sidebar chapters LT02 to LT12; 412 + 100 items in `media/lectures/LT02..LT12` (about 85 MB, 5,700 files, in R2 too); the matching `units` rows and any `article_docs` rows for LT02+; seed files; planned-source tables in `scripts/archive-topics.mjs`; roadmap references; docs. Dictionary and Stories are not touched.

**Step 0.1 Soft purge (reversible, git only).**
1. `git tag pre-lecture-purge` and save the list of R2 keys of the purged manifests (`planning/baseline/purged-lecture-keys.txt`) before deleting.
2. Delete `media/lectures/LT02` to `LT12`, and the empty `content/lectures/LT03T01`.
3. Replace sidebar chapters LT02 to LT12 with the new skeleton (all 17 chapters and 108 topics, `names` in 9 languages, `layout: article`, `mode: directional`, `level`, no items). Empty topics stay disabled in the nav, so the site shows no empty lessons. Keep LT01 untouched.
4. `./run.sh media index`, `./run.sh validate`, `./run.sh build`, then check that `/library/lectures` renders and LT01 still plays.
5. Delete progress for removed items so nobody has orphans: `learned_items` and `listen_counts` rows whose `entity_id` is a purged lecture id (a migration with a `where entity_id in (...)` list generated from the purged manifests). This loses those learners' ticks; you said content loss is acceptable. Please confirm this one.
6. Clean mentions: `manual/curriculum.md` (Lectures section, "Planned lessons", the 2026-09-26 re-home record for L2-L12), `CLAUDE.md` lecture lines, `scripts/archive-topics.mjs` `PLANNED_SOURCES`, `scripts/entities-to-manifests.mjs`, `RoadmapShell.vue`, `planning/lecture-articles-review.md`.

**Step 0.2 Hard purge (irreversible, later).** `./run.sh sync` prunes the Supabase rows; `./run.sh media prune` (report first) then `--apply` removes the R2 objects. Do this only after Phase 2 has shipped, so the old audio is a fallback until the new curriculum is live. The old phrase audio is not reused (the new articles use their own examples and read-aloud clips).

*Done when:* build and `validate` pass, the lectures sidebar shows 17 chapters with only LT01 enabled, nothing outside LT01 references a purged id.

## Phase 1. Foundations (before any article)

1. **Curriculum doc.** Rewrite the Lectures section of `manual/curriculum.md` from this plan. It also changes the current rules there: chapters are not capped at 12, lecture topics are always `article` and `directional`, and no table-layout lectures.
2. **Validator.** `validate-data.mjs`: for `library/lectures`, reject any topic that is not `article` + `directional`, and any item without an article doc; require a `level` on each topic. Check that no chapter-count limit exists in `validate-data`, the nav or the roadmap (nothing found in a first search, but to be confirmed by running it).
3. **Reader check.** Publish one test article with `##` sections, bullets and a table; open `/learn/read?id=<topic>:<id>` and check the table, the two-panel layout and the read-aloud (what is spoken, what is skipped: a table is not read, bracketed target words with IPA are).
4. **Seed format.** `scripts/seeds/grammar-<lang>.json`: per topic the facts the article may use (paradigm tables, examples with IPA and glosses in the 9 languages, the language's answer to "does it have this feature"). One generator renders the paradigm tables from it. Extend `create-lecture-articles.py` (today T03 to T06 of LT01 only) to read these seeds; `--check` rejects words outside the seed.
5. **Outline, then native per language.** `./run.sh create lecture <topic> --target xx` writes the English outline from the seed, then each explanation language natively from that outline (same pattern as `create-stories.py`).
6. **Topic titles and sound.** Each new topic needs title clips in 9 languages. Add `LT02`.. to `SOUND_GUARDED` in `scripts/lib/sound-chapters.mjs` chapter by chapter, once `./run.sh missing` shows no missing or stale clip.
7. **Item numbering.** Continue the `L<n>` article ids after the current maximum used by LT01.

## Phase 2. Pilot: LT02 for Romanian and English

LT02 is eight articles per language, the smallest complete chapter, and it exercises every part of the pipeline. Write T01 and T02 first (they set the template: the overview and the elaboration), review them with you, then T03 to T08. Build, check the rendered pages, read-aloud and title clips, then deploy. This is also the point to confirm length and tone.

## Phase 3. The other languages for LT02, then LT03 to LT10

Language order follows the LT01 plan (cheapest first): ro, en, es, it, fr, de, pt, ru, hu. Per language the same loop as LT01: seed, outline, native article, `--check`, read-aloud, build, review. After each chapter run the build and look at the pages. Ru and hu take longer (cases, aspect, 43 letters, voice quirks).

## Phase 4. Country chapters (LT11 to LT17)

Written after LT02 to LT10 are done for a language, because culture articles are also simple-English reading practice at the right level. Each language picks the topics it can fill well first; a topic with no article stays disabled for that language. Facts (dates, places, names) come from a seed list per language that you approve before writing, so the model never invents history.

## Sizing

| | Per language | All 9 languages |
| --- | --- | --- |
| Grammar articles (LT02 to LT10) | about 63 | about 570 |
| Country articles (LT11 to LT17), about 2.5 per topic | about 100 | about 900 |
| Total | about 165 | about 1,470 |

Each article is also written in up to 9 explanation languages (about 13,000 texts at full coverage), and each gets read-aloud clips. So full coverage is a long programme; the plan ships in slices: a chapter is live for a language as soon as its English page exists, and other explanation languages fill in later (English fallback already works).

## Decisions I need from you

1. **Grammar spread over LT02 to LT10 (9 chapters)** instead of all in LT02. You asked for LT02 to hold the overview and the elaboration articles; I kept it as the map of grammar, with the deep dives in the chapters after it. If you want fewer chapters, LT05 and LT08 can be merged into LT04 and LT07.
2. **Which country for each language:** ro = Romania (and Moldova), en = United Kingdom (and USA), de = Germany (and Austria, Switzerland), ru = Russia, it = Italy, es = Spain (and Latin America), fr = France (and Francophonie), pt = Portugal (and Brazil), hu = Hungary. OK, or should the country-specific language (for example Brazil for pt) lead?
3. **Progress rows** for purged items are deleted (Step 0.1, point 5). OK?
4. **Proposed extra chapters** LT15 (Arts & Letters), LT16 (The Language Itself), LT17 (Modern Society): keep, drop or rename?
5. **Go-ahead for Step 0.1.** I will tag first, so the purge is one `git revert` away until the R2 prune.

## Phase 0 result (2026-11-02)

Step 0.1 is done:
- `git tag pre-lecture-purge` marks the state before the purge.
- `media/lectures/LT02` to `LT12` (manifests and audio, 93 MB) were moved out of the repo to `C:/Users/eluci/sage-code/purged-lectures-2026-11-02/`. The binaries are gitignored, so git alone could not restore them; that folder can.
- R2 keys of the purged files: `planning/baseline/purged-lecture-keys.txt` (4,695). Legacy ids: `purged-lecture-legacy-ids.txt` (253). The R2 objects are still in the bucket.
- The lectures sidebar has LT01 (unchanged) plus the empty skeleton LT02 to LT14: 13 chapters, 92 topics, names in all 9 languages, all `article` + `directional`.
- `./run.sh validate` passes; `./run.sh sync --dry-run` regenerated `seed/*.json` (database untouched).
- `manual/curriculum.md` (Lectures section) is rewritten to the new chapter list.

Not done yet (step 0.2, irreversible; do it after the first new chapter is live): `./run.sh sync` (prunes the old unit rows), the progress migration `supabase/migrations/20261102010000_purge_old_lecture_progress.sql` (written, not applied), and `./run.sh media prune` (report first, then `--apply`).

### Revised LT02 (replaces the LT02 table above)

Propositions & phrases, categories of words, nouns (substantives), pronouns, adjectives & articles, numerals, verbs, adverbs, prepositions & conjunctions, cases & other categories, word order & agreement: 11 topics, each a brief article with a table. The deep dives are LT03 to LT10. LT12 now opens with "Where the language is spoken" and LT13 has "Empire, colonies & the language abroad".

### Left to finalise later

Phase 1 onwards (validator rule "every lecture item has an article", reader test with a table article, grammar seed format, authoring command, title clips and sound guard for the new chapters), the per-language country scope, and the pilot (LT02 for Romanian and English).
