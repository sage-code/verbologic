# Library curriculum

The three library tracks (Dictionary, Lectures and Stories) each have 12 chapters of 4–8 topics (Lectures: 10 chapters, LT01 to LT10, see below), graded from the first school year to university. The sidebars are the curriculum:

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

**Rebuilt 2026-11-02 (second version).** LT01 (sounds and pronunciation) is unchanged. The old LT02 to LT12 (phrase and word lists) were purged. Full plan, article template and open work: `planning/lectures-grammar-culture-plan.md`.

**Language rule (2026-11-02).** Chapter LT01 has its articles in all 9 languages. Every later chapter's article is written only in its `target` language: the grammar of Romanian is described in Romanian, that of English in English, natively and never translated, with no versions in other languages. The rule covers the article body only. Chapter, topic and item names keep all 9 languages, and the sound (title audio of chapters, topics and items) is recorded in all 9. The reader of another interface language sees the same target-language article.

**Principle: grammar is described once, as topics of one chapter (LT02), and learned by reading.** LT03 to LT10 are articles about people, home, town, work, culture, places, history and science. Each article explains the grammar of the sentences it shows in short numbered **grammar notes**, with a link to the LT02 topic. No topic is a list of words or phrases.

**Chapter, topic, item.** A topic holds 4 to 10 items; an item is a small lesson on one idea, 1 to 3 reading pages, with a few very short examples. Items are generic: the same list and names for every language (a shared item has no `target` in its manifest), and each language writes its own article text for the item, natively and specific to that language. Item names exist in 9 languages with a title clip each. LT02 has 145 items, LT03 to LT10 have 4 to 5 items per topic.

Rules for every lecture topic: `layout: article`, `mode: directional`, a `level`; **every item is an article** (headers, bullet lists and tables). A chapter is the same for every language; a language without a feature (for example noun gender in English) explains how it does that job instead. Chapters LT07 to LT10 cover the home country and the other countries where the language is spoken, including how it spread (empire, colonies, migration); subjects only one country has are extra articles inside the generic topic.

| Chapter | Topics (in order) |
| --- | --- |
| **LT01 Sounds & Pronunciation** | Alphabet & letters → letter groups & sounds → syllables & word stress → sound changes & spelling patterns → elision, hyphenation & fast speech → intonation, rhythm & punctuation |
| **LT02 Introduction to Grammar** (reference, 21 topics) | Propositions & phrases → categories of words → nouns: kinds, gender & number → articles & determiners → adjectives & comparison → personal pronouns & address → other pronouns → numerals, dates & time → verbs: forms & classes → present tense, being & having → past tenses & aspect → future → moods: command, subjunctive & conditional → voice, reflexive & impersonal verbs → modal verbs & non-finite forms → adverbs → prepositions & cases → negation & questions → conjunctions & linking clauses → word order & agreement → word formation & register |
| **LT03 People & Family** (A1-A2) | Greeting & introducing yourself → family & relationships → describing people → friends, visits & invitations → names, titles & politeness |
| **LT04 Home & Daily Life** (A1-A2) | The house & its rooms → a day from morning to night → meals & mealtimes → weather, seasons & the calendar → chores, hobbies & free time |
| **LT05 Town & Travel** (A2-B1) | Streets & directions → shops, markets & prices → cafés & restaurants → transport & journeys → hotels, banks & services |
| **LT06 Work, School & Health** (A2-B1) | Jobs & workplaces → school & studies → body, health & the doctor → phones, internet & media → money, rights & the law |
| **LT07 Culture & Tradition** (A2-B1) | Family & daily customs → holidays & festivals → food & drink → music, dance & folk art → beliefs, religion & folklore → etiquette & manners |
| **LT08 Places & Landscape** (A2-B1) | Where the language is spoken → the home country at a glance → regions → capital cities → cities & towns → villages & rural life → mountains, rivers & coasts → landmarks & heritage sites |
| **LT09 History & People** (B1-C1) | Origins & early history → Middle Ages to modern times → empire, colonies & the language abroad → the modern state → rulers & leaders → writers, thinkers & artists → migration & communities abroad |
| **LT10 Science & Discoveries** (B1-C1) | Scientists & inventors → discoveries & firsts → technology & industry → medicine & health → universities, research & space |

### An article in LT03 to LT10

In this order, written in the target language itself (see "Language rule" above), quoting only words from its seed list (sentence, IPA, gloss):

1. **Opening** (2 to 4 sentences): what this is about and why it matters. No grammar yet.
2. **In context** (150 to 350 words): a short text or dialogue that shows the topic.
3. **Grammar notes** (2 to 4 numbered notes; A1 at most 2, A2 up to 3, B1 and above up to 4). Each note: a one-line rule, the sentence from the text it explains, a small table of forms when the language has them (generated from the seed), and a link "See Introduction to Grammar: <topic>".
4. **Notice** (optional): what differs from English or the learner's language; a common mistake.
5. **Culture note** (optional, 2 to 3 sentences).

A note explains a sentence of this article, never pastes a rule from LT02, and a table is never the whole article. Total length 450 to 900 words; paragraphs short and about the same length. One text per article, written natively in the target language; there are no versions in other languages and nothing is translated. The planned `grammar:` field on each article lists the LT02 topics it draws on; `./run.sh missing` will report how many articles use each LT02 topic.

Chapters LT02 to LT10 hold no articles yet; their topics stay disabled in the navigation until an article exists.

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

Most topics in **Lectures** use the `table` layout and hold **18–70 progressive items/examples**. Pronunciation topics written as articles (`"layout": "article"`) hold the same number of items, each an article document. Learners play the topic in a loop to absorb pronunciation and structure intuitively, and click any item's Read button to open its detailed explanation (`content/lectures/<TOPIC>/<id>/en.md`). Table items have no secondary sound strip or video: their audio belongs to the item and topic table loop. An **article** topic (`"layout": "article"`) has no table loop. Its article items carry a read-aloud MP3 of their document (`read/<locale>.mp3`, made by `generate-audio.py --read`) and may carry a video.

Topic codes are `<track letter><chapter>T<nn>`, numbered in teaching order: `C` for Dictionary, `L` for Lectures and `S` for Stories. `scripts/lib/media-ids.mjs` routes a code to its sidebar by that letter. To insert a topic, renumber the topics after it: codes are display labels, not storage keys. Audio URLs come from each manifest's own `key`, and progress stores only the entity id. When a code changes:

- move `lastIndex` with the topic;
- rename the folder `content/lectures/<TOPIC>/`;
- update each moved doc's `topic:` front matter.

## One curriculum, every language

A chapter is the same for every language: same topics, same order, same generic English name. Only the content differs. A topic name describes a concept ("Having & needing"), never one language's words ("a avea", "-esc & -ăsc"). `./run.sh validate` rejects a `names.en` with non-English characters or quoted Romanian words.

Content is one of two kinds, and the kind decides how a topic is built:

| Kind | Examples | Mode | Language |
| --- | --- | --- | --- |
| Reversible | words, expressions, stories | default (omit `mode`) | the same rows exist in every language; any language can be learned or be the gloss |
| Directional | letters, sounds, grammar articles | `"mode": "directional"` | each ITEM teaches one language |

- A `directional` topic is ONE topic for all languages. Each item's manifest (`media/lectures/.../item.json`) sets `"target": "<lang>"`; a language sees and counts only its own items. Do not give a topic its own `target` and do not make one topic per language: validate rejects both for lectures.
- A lecture topic with `"layout": "article"` must be `directional`.
- Item codes are unique per track (`L553`), so a new language adds items to the existing topic; it does not need new topics.
- `./run.sh missing` ends with a **Language coverage** table: items per language for every directional topic. A dash is the next piece of work.

**Quoting target-language words (LT01 pages).** A target-language word goes in `( )` and is not read aloud; the IPA in `/ /` right after it is read (transliterated by `scripts/lib/ipa-translit.mjs`), so every bracketed word needs IPA after it.

Adding a language to a chapter-1 topic: `create-lecture-articles.py --target <lang> --scaffold`, fill `scripts/seeds/lectures-LT01-<lang>.json` with hand-transcribed IPA, `--preview`, then `--apply`.

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
3. Write the English document (canonical). The file format is described in `content/README.md` (`content/<track>/<TOPIC>/<ID>.json`). List the rows the learner should practise in `related:`.
4. Body: plain Markdown.
   - Tables: GFM pipe tables (`| a | b |` + `| --- | --- |`).
   - Dialogs: fenced ```` ```text ```` blocks.
   - A highlighted note: `::callout{type="tip|warn|note"}` … `::`.
   - Playable audio chips: `::term{addresses="id1,id2"}` + `::`.
   - A YouTube video: `::youtube{id="VIDEO_ID" title="…"}` + `::` (full width, lazy-loaded, youtube-nocookie).
5. `run media index` → `run validate`, then **open `/learn/ro/lectures/<TOPIC>/<id>/en` and check the body really renders** (the validators don't render pages).
6. Translation: `run lecture translate <id> --lang ro`. The translation records the English hash (`sourceSha`) and is flagged stale when the original changes. `run lecture status` shows the review queue.

**One reading template, every track.** An article opens in the same two-panel
view as a story: the learning language on the left, the reader's own language
on the right, paginated by one rule — a document with `##` headings starts a new
page at each heading, a heading-less document paginates one paragraph per page.
There is no per-locale button row: the route's `:doc` segment already chose the
explanation language, and the right panel shows the reader's. Write prose that
reads well in that frame — a letter article is one paragraph, a grammar article
is a few `##` sections.

Worked examples: `content/lectures/LT03T01/L294/` (tables, dialogs, callout,
term chips) and the letter articles, which are data rather than Markdown —
`src/data/alphabets/ro.json` plus `src/components/content/PhoneticArticle.vue`.

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
