# Library curriculum

The three library tracks (Dictionary, Lectures and Stories) each have **12 chapters of 4–8 topics**, graded from the first school year to university. The sidebars are the curriculum:

- `src/data/sidebars/library/dictionary/sidebar.json`
- `src/data/sidebars/library/lectures/sidebar.json`
- `src/data/sidebars/library/stories/sidebar.json`

They are hand-curated: no script rewrites them. Each sidebar is shared by every track language. A topic shows only the records that exist for the current language, and a topic with no content yet stays disabled in the navigation.

## Levels

Every library topic carries a `level` (CEFR). The sidebar shows it as a badge, and `run validate` rejects unknown values and warns when it is missing. One scale is used for all three tracks:

| Level | School stage | Dictionary | Stories |
| --- | --- | --- | --- |
| A1 | Primary, grades 1–2 | C1–C2 | S1–S2 |
| A2 | Primary, grades 3–4 | C3–C4 | S3–S4 |
| B1 | Middle school, grades 5–6 | C5–C6 | S5–S6 |
| B2 | Middle school, grades 7–8 | C7–C8 | S7–S8 |
| C1 | High school, grades 9–10 | C9–C10 | S9–S10 |
| C2 | High school 11–12 / university | C11–C12 | S11–S12 |

Dictionary and Stories are graded **by chapter**: two chapters per level, so a learner at a level reads the stories that match the vocabulary chapters. Lectures are graded **inside each chapter**: a chapter is a school subject and its topics climb from primary to university.

## Lectures

L1–L4 teach the language itself. L5–L12 are school subjects, taught in the track language.

| Chapter | Topics (in order) |
| --- | --- |
| **L1 Sounds & Writing** | The Romanian alphabet → letters (table) → vowels, diphthongs & triphthongs → vowel groups (table) → digraphs & trigraphs → consonant groups (table) → diacritics, syllables & stress → spelling & punctuation |
| **L2 Sentences** | What is a sentence? → statements (table) → asking and answering → questions: people, home & daily life (table) → questions: work, town, travel & help (table) → the imperative → commands (table) |
| **L3 Grammar** | Personal pronouns → *to be* & *to have* → present tense → nouns, gender & articles → adjectives & agreement → prepositions & numbers → past, future & moods → clauses & complex sentences |
| **L4 Communication & Literature** | Greetings & formulas → greetings & farewells (table) → introducing yourself → dialogs in daily life → stories & narration → poetry & figurative language → genres, analysis & themes → essay, rhetoric & style |
| **L5 Mathematics** | Numbers & counting → arithmetic → fractions, decimals & percentages → geometry & measurement → algebra & equations → functions & graphs → statistics & probability → calculus & advanced topics |
| **L6 Physics** | Matter & motion → forces & simple machines → energy, heat & light → electricity & magnetism → waves, sound & optics → mechanics & laws of motion → modern physics |
| **L7 Chemistry** | Matter, elements & particles → the periodic table → substances & compounds → reactions & basic laws → organic chemistry & life → industrial chemistry & petrochemistry |
| **L8 Biology & Health** | Living things & classification → plants → the human body & health → cells & microorganisms → ecosystems & life cycles → genetics & evolution → advanced biology & biotechnology |
| **L9 Geography & Space** | Maps, directions & landforms → weather & climate → countries & continents → Sun, Moon & the Solar System → population & cities → economic & political geography → stars, galaxies & exploration → cosmology & global systems |
| **L10 History** | Time & timelines → early civilizations → antiquity → the Middle Ages → discoveries & the early modern era → revolutions & the modern era → the 20th century & today |
| **L11 Society & Ideas** | Self, family & community → categories, properties & relations → society, culture & norms → government, law & civics → economics & personal finance → logic & reasoning → ethics & global society → philosophy |
| **L12 Arts & Technology** | Computers & digital literacy → music theory → drawing & painting → art history & styles → theatre & film → programming & algorithms → media & information literacy |

## Dictionary

All topics use the `table` layout.

| Chapter | Topics |
| --- | --- |
| **C1 First Words** (A1) | greetings & farewells · courtesy formulas · names & introductions · simple questions · numbers 0–100 · colors & shapes · family members · classroom objects |
| **C2 Me & My Home** (A1) | body parts · clothes & shoes · house & rooms · furniture & household objects · food & ingredients · animals & pets · toys & games |
| **C3 Daily Life** (A2) | daily routine · time & the clock · days, months & seasons · weather · meals & drinks · household chores · feelings & moods |
| **C4 Around Town** (A2) | town places & buildings · shops & markets · money & prices · public transport · directions & positions · jobs & occupations · doctor & pharmacy |
| **C5 Travel & Services** (B1) | airport & border · accommodation · restaurant & café · bank & post office · phone & online services · holidays & celebrations · emergencies & safety |
| **C6 School Subjects** (B1) | school & university · classroom language · maths & measurement · science lab · history & time periods · arts & music · sports & PE |
| **C7 People & Society** (B2) | character & personality · relationships · health & well-being · media & entertainment · culture & traditions · rights, law & citizenship |
| **C8 Nature & the Planet** (B2) | landscapes & landforms · wild animals & plants · climate & environment · countries & nationalities · sky & space · materials & substances |
| **C9 Work & Economy** (C1) | office & workplace · jobs & applications · meetings & e-mail · business & trade · finance & banking · industry & agriculture · contracts, salary & tax |
| **C10 Science & Technology** (C1) | computers & devices · internet & social media · scientific method · energy & engineering · medicine & biology · AI & data · emerging technologies |
| **C11 Thinking & Argument** (C2) | opinions & debate · agreement & disagreement · logical connectors · cause & effect · comparison & contrast · ethics & values · abstract ideas & philosophy |
| **C12 Nuance & Mastery** (C2) | idioms & fixed expressions · proverbs & sayings · colloquial speech & slang · register & politeness · nuanced synonyms · literary & rhetorical terms · academic vocabulary |

Each theme appears once, at one level. A theme that needs more depth later gets a new topic at a higher level; it is not repeated in the same chapter.

## Stories

All topics use the `article` layout.

| Chapter | Topics |
| --- | --- |
| **S1 Picture Tales** (A1) | fables & animal tales · fairy tales · children's books · bedtime & rhyming stories |
| **S2 First Adventures** (A1) | adventures · funny stories · friendship & school · holidays & seasons |
| **S3 Everyday Stories** (A2) | family life · in town · animals & nature · travel diaries |
| **S4 Myths & Legends** (A2) | folk legends · Greek & Roman myths · world folklore · heroes & quests |
| **S5 Mystery & Suspense** (B1) | detective stories · puzzles & riddles · ghost stories · secrets & surprises |
| **S6 Life & Relationships** (B1) | fiction · love stories · coming of age · letters & diaries |
| **S7 Science Fiction & Fantasy** (B2) | SF & comics · time travel · fantasy worlds · robots & AI |
| **S8 Classics Retold** (B2) | classics · national classics · world classics · drama scenes |
| **S9 History & War** (C1) | war & history · historical fiction · biographies · explorers & discoveries |
| **S10 Work, Money & Society** (C1) | finance · ambition & careers · social issues · cities & migration |
| **S11 Philosophy & Ideas** (C2) | philosophy · dialogues & debates · parables for adults · science & wonder |
| **S12 Faith & the Sacred** (C2) | religion · spiritual journeys · essays & reflections · masterworks (unabridged) |

## The lesson pattern

A topic has exactly one layout, so each lesson is a run of consecutive topics:

1. **One or more `article` topics first:** the explanation.
2. **Then one or more `table` topics:** the practice rows.

Example: `L1T01` *The Romanian alphabet* (article) → `L1T02` *Alphabet & letters* (104 rows).

Topic codes are `<track letter><chapter>T<nn>`, numbered in teaching order: `C` for Dictionary, `L` for Lectures and `S` for Stories. `scripts/lib/media-ids.mjs` routes a code to its sidebar by that letter. To insert a topic, renumber the topics after it: codes are display labels, not storage keys. Audio URLs come from each manifest's own `key`, and progress stores only the entity id. When a code changes:

- move `lastIndex` with the topic;
- rename the folders `content/lectures/<lang>/<TOPIC>/` and `media/video/<lang>/<TOPIC>/`;
- update each moved doc's `topic:` front matter.

## Row order inside a table

`run media index` keeps the order of `items` in the sidebar. Write rows in the order a learner should meet them:

- **statements:** simple to complex;
- **questions:** the question, then its answers (`question_x`, then the *Da, …* answer, then the *Nu, …* answer);
- **commands:** the everyday ones first.

## Planned lessons

Article topics are already listed with planned ids (e.g. `L2T01` → `lecture_sentence`). `run missing` lists every planned id, and that list is the writing backlog. For empty topics it also shows the archive source recorded in `topic-map.json` → `planned`, which `PLANNED_SOURCES` in `scripts/archive-topics.mjs` keys by the current topic code.

## Writing an article

1. Make sure the topic exists in the sidebar with `"layout": "article"` and a `level`.
2. `run lecture new ro <TOPIC> <lecture_id> --title "…" --minutes N`. This creates `content/lectures/ro/<TOPIC>/<id>/en.md`, a pending video manifest, and the sidebar item.
3. Write the English document (canonical). The front matter schema is in `content.config.ts`. List the rows the learner should practise in `related:`.
4. Body: plain Markdown.
   - Tables: GFM pipe tables (`| a | b |` + `| --- | --- |`).
   - Dialogs: fenced ```` ```text ```` blocks.
   - A highlighted note: `::callout{type="tip|warn|note"}` … `::`.
   - Playable audio chips: `::term{addresses="id1,id2"}` + `::`.
   - A YouTube video: `::youtube{id="VIDEO_ID" title="…"}` + `::` (full width, lazy-loaded, youtube-nocookie).
5. `run media index` → `run validate`, then **open `/learn/ro/lectures/<TOPIC>/<id>/en` and check the body really renders** (the validators don't render pages).
6. Translation: `run lecture translate <id> --lang ro`. The translation records the English hash (`sourceSha`) and is flagged stale when the original changes. `run lecture status` shows the review queue.

Worked examples: `content/lectures/ro/L1T01/lecture_alphabet/` (EN + RO) and `content/lectures/ro/L4T01/lecture_greetings/` (tables, dialogs, callout, term chips).

## Converting an archive page

1. Each `<h2>`/`<h3>` block of prose becomes an article section. Keep the teaching text; drop the Bootstrap markup.
2. Each `<table>` of audio rows becomes rows of a `table` topic. Their ids are `<kind>_<audio-file-slug>` (`question_`, `sentence_`, `imperative_`, `greeting_`, `letter_`). Keep the archive row order.
3. Each YouTube `<iframe src=".../embed/ID">` becomes `::youtube{id="ID"}`, placed where it was in the page. The front-matter `video:` field is only for a self-hosted R2 video. Leave it out unless that file exists, or the page shows a "Video coming soon" box.

## Re-home record (content plan v2, 2026-09-26)

The v2 restructure moved every existing row **by id**. The sidebars decide which topic a row belongs to, and each manifest keeps its folder and its R2 `key`. So nothing was moved in `media/` or re-uploaded to R2. Totals are unchanged: Dictionary 149 items, Lectures 407 + 6 (music/art), Stories 55.

- **Dictionary** (old → new): C1T11→C1T01, C1T12→C1T02, C2T03→C1T03, C8T01→C1T04, C3T02→C2T04, C3T04→C2T05, C3T08→C3T01, C3T09→C3T02, C3T11→C3T04, C2T12→C3T07, C6T02→C4T03, C5T03→C4T04, C4T04→C4T07, C5T07→C5T01, C7T01→C6T01, C7T03→C9T01, C7T08→C10T01.
- **Lectures** (old → new): L1T01–T07 unchanged. L2T01 unchanged. L2T02–T07→L2T02 (merged). L3T01→L2T03. L3T02–T08→L2T04. L3T09–T16→L2T05. L4T01→L2T06. L4T02–T16→L2T07. L5T01–T05→L3T01–T05. L5T06+T07→L3T06. L6T01–T03→L4T01–T03. L6T04 + L7T01–T07→L4T04. Draft Music/Painting→L12T02/L12T03.
- **Stories** (draft → new): S1T01→S1T03, S1T02→S2T01, S1T03→S2T02, S2T01→S6T01, S2T02→S6T02, S2T03→S7T01, S2T04→S8T01, S3T01→S9T01, S3T04→S10T01, S3T02→S11T01, S3T03→S12T01.
- **Content docs moved:** `lecture_imperative` L4T01→L2T06, `lecture_questions` L3T01→L2T03, `lecture_greetings` L6T01→L4T01.
- **Media folders:** the RO audio sits in `media/audio/ro-archive/<old code>/`, and `BUILTIN_MAP` in `scripts/archive-topics.mjs` stays frozen at those folder codes. Physically re-homing a folder means changing its manifests' `key`s, then `run media upload` and `run media prune`. It is optional, so do it deliberately.

## Retired (2026-09-24)

- `scripts/restructure-dictionary.mjs` and `pins.json`: the one-off move of the alphabet out of the Dictionary is complete.
- `archive-topics.mjs --apply-sidebar`: the script now only writes the topic map and its report.
