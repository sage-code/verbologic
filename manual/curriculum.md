# Lectures curriculum

The Lectures track teaches the language in a logical order: the sounds first, then how a sentence is built, then grammar, then dialogs, then expressions from real life. The sidebar (`src/data/sidebars/library/lectures/sidebar.json`) is the curriculum. It is hand-curated: no script rewrites it.

## Teaching order

| Chapter | Purpose | Topics (in order) | Archive source |
| --- | --- | --- | --- |
| **L1 Sounds & Writing** | read and pronounce any word | alphabet → vowel groups → consonant groups → diacritics & stress | `alphabet.html` |
| **L2 Statements** | the declarative sentence | what is a sentence → 6 statement tables by life area | `sentences.html` |
| **L3 Questions & Answers** | ask, then answer yes / no | asking and answering → 15 question tables | `questions.html` |
| **L4 Commands** | the imperative | the imperative → 15 command tables | `imperative.html` |
| **L5 Grammar Building Blocks** | how the pieces fit | pronouns → *a fi* / *a avea* → present tense → nouns & articles → adjectives → prepositions → numbers | stubs: `pronouns`, `verbs`, `nouns`, `adjectives`, `prepositions` |
| **L6 Dialogs** | put it together in conversation | greetings → introductions → everyday dialogs | `greetings.html`, stub `daily-dialog` |
| **L7 Life & Domains** | expressions by area of life | family → home → city & travel → shopping → health → work & study → culture | stubs: `family-friends`, `travel-city`, `work-study`, `culture-customs` |

The "stub" archive pages hold only an empty heading outline. The content for those topics has to be written, not converted.

The sidebar is shared by every track language (the English track uses the same chapters). A topic shows only the records that exist for the current language.

## The lesson pattern

A topic has exactly one layout, so each lesson is a run of consecutive topics:

1. **One or more `article` topics first:** the explanation.
2. **Then one or more `table` topics:** the practice rows.

Example: `L1T01` *The Romanian alphabet* (article) → `L1T02` *Alphabet & letters* (104 rows).

Topic codes are `L<chapter>T<nn>`, numbered in teaching order. To insert a topic, renumber the topics after it: codes are display labels, not storage keys. Audio URLs come from each manifest's own `key`, and progress stores only the entity id. The folders `content/lectures/<lang>/<TOPIC>/` and `media/video/<lang>/<TOPIC>/` must be renamed together with the code.

## Row order inside a table

`run media index` keeps the order of `items` in the sidebar. Write rows in the order a learner should meet them:

- **statements:** simple to complex;
- **questions:** the question, then its answers (`question_x`, then the *Da, …* answer, then the *Nu, …* answer);
- **commands:** the everyday ones first.

## Planned lessons

Article topics are already listed with planned ids (e.g. `L2T01` → `lecture_sentence`). A topic with no content yet stays out of the navigation. `run missing` lists every planned id, and that list is the writing backlog.

## Writing an article

1. Make sure the topic exists in the sidebar with `"layout": "article"`.
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

Worked examples: `content/lectures/ro/L1T01/lecture_alphabet/` (EN + RO) and `content/lectures/ro/L6T01/lecture_greetings/` (tables, dialogs, callout, term chips).

## Converting an archive page

1. Each `<h2>`/`<h3>` block of prose becomes an article section. Keep the teaching text; drop the Bootstrap markup.
2. Each `<table>` of audio rows becomes a `table` topic. Its ids are `<kind>_<audio-file-slug>` (`question_`, `sentence_`, `imperative_`, `greeting_`, `letter_`). Keep the archive row order.
3. Each YouTube `<iframe src=".../embed/ID">` becomes `::youtube{id="ID"}`, placed where it was in the page. The front-matter `video:` field is only for a self-hosted R2 video. Leave it out unless that file exists, or the page shows a "Video coming soon" box.

## Retired (2026-09-24)

- `scripts/restructure-dictionary.mjs` and `pins.json`: the one-off move of the alphabet out of the Dictionary is complete.
- `archive-topics.mjs --apply-sidebar`: the script now only writes the topic map and its report.
