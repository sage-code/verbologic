# Legacy Content Audit — `/archive`

> **Author:** DeepSeek (Lead System Architect) · **Purpose:** Human-readable companion to
> `agents/glm/tasks/task_legacy_extraction.json` (machine-readable extraction spec).
> **Verdict:** The archive contains **highly reusable bilingual content** (≈470 vocabulary
> items / utterances with audio, plus contrastive phonetics notes) locked inside Bootstrap
> HTML pages. It is fully recoverable into the decoupled $O(N)$ Verbologic architecture.

---

## 1. What the archive is

Two self-contained legacy static sites from previous roadmap attempts:

| Legacy site | Track | Size | Structure |
| --- | --- | --- | --- |
| `archive/romanian/` | English speakers → **Romanian** (L1=en, L2=ro) | 6.4 MB | 16 HTML pages, 390 MP3s, 17 TOC JSONs |
| `archive/english/` | Romanian speakers → **English** (L1=ro, L2=en) | 2.2 MB | 14 HTML pages, 73 MP3s, 12 TOC JSONs |

Key insight: the legacy `data/*.json` files are **navigation TOCs only** (titles + anchor
links). The actual vocabulary/grammar content lives in the HTML `<table>` rows, where each
row carries a `data-audio="/roadmap/[lang]/audio/<category>/<slug>.mp3"` attribute pointing
at a diacritic-stripped slug filename (e.g. `mulțumesc` → `multumesc.mp3`).

⚠️ Note on the English track: its pages are **written in Romanian** ("Literă / IPA /
Exemplu / Română" column headers) — it teaches English to Romanian speakers. All lesson
pedagogy text extracted from it belongs in `locales/ro.json`, and its media maps to
`audio/en/…`.

---

## 2. Content inventory (verified by row/audio count)

### 2.1 Romanian track — REUSABLE ✅

| Source page | Content | Table rows | Audio refs / files | Target entities |
| --- | --- | --- | --- | --- |
| `vocabulary.html` | 12 thematic sections (Greetings, Identity, Time, Home, Kitchen, Routines, Transport, Shopping, Health, School, Office, Travel, Weather, Emotions) | 165 (≈160 terms) | 149 refs / 150 files | `public/data/entities/ro_vocabulary.json` |
| `questions.html` | Q&A drills — Question → Answer 1 (Da…) → Answer 2 (Nu…), each with audio | 60 | 135 / 135 | `public/data/entities/ro_questions.json` |
| `imperative.html` | Imperative drills — No. / Romanian Sentence / audio / English Translation | 90 | 75 / 75 | `public/data/entities/ro_imperative.json` |
| `sentences.html` | Sentence corpus — Romanian Sentence / audio / English Translation | 36 | 30 / 30 | `public/data/entities/ro_sentences.json` |
| `alphabet.html` | Letter & digraph pronunciation with **English-approximation contrastive notes** | 58 | 0 | `ro_alphabet.json` + `locales/ro.json` contrastive keys |
| `greetings.html` | 3 formula tables: Casual / Polite / Closing (+ Context column) | 18 | **0** ⚠️ | `ro_greetings.json` |
| `index.html` | Roadmap: **L1 Fundamentals** (Alphabet → Greetings → Vocabulary), **L2 Grammar** (Nouns & Articles), **L3 Stories** (Guided Daily Dialog) | – | – | Lesson ordering for `content/ro/*.md` |

### 2.2 English track — PARTIALLY REUSABLE ✅

| Source page | Content | Table rows | Audio refs / files | Target entities |
| --- | --- | --- | --- | --- |
| `alphabet.html` | English alphabet for Romanian speakers: Literă / **IPA** / Exemplu / audio / Română + digraphs | 82 | 73 / 73 (perfect match) | `public/data/entities/en_alphabet.json` (only source with legacy **IPA**) |

### 2.3 Stub pages — GAPS ❌ (nav-only, no body content)

* Romanian: `adjectives`, `culture-customs`, `daily-dialog`, `family-friends`, `nouns`,
  `prepositions`, `pronouns`, `travel-city`, `verbs`, `work-study`
* English: `docs`, `issues`, `meetings`, `nouns`, `phrases`, `prepositions`, `questions`,
  `sentences`, `technical`, `tenses`, `vocab`

Their TOCs in `data/*.json` define the **intended scope** — useful as a lesson-plan
backlog, but there is nothing to extract. Do **not** generate entity files from stubs.

---

## 3. Media asset inventory (Cloudflare R2 mapping)

**463 MP3s total** — none of these go into Git; they are copied to the local `./media/audio`
staging dir and synced to R2 (`https://media.verbologic.com/`) via the CI/CD Wrangler job.

| Legacy location | Count | R2 target pattern |
| --- | --- | --- |
| `archive/romanian/audio/vocabulary/*.mp3` | 150 | `audio/ro/word_<slug>.mp3` |
| `archive/romanian/audio/questions/*.mp3` | 135 | `audio/ro/question_<slug>.mp3` |
| `archive/romanian/audio/imperative/*.mp3` | 75 | `audio/ro/imperative_<slug>.mp3` |
| `archive/romanian/audio/sentences/*.mp3` | 30 | `audio/ro/sentence_<slug>.mp3` |
| `archive/english/audio/alphabet/*.mp3` | 73 | `audio/en/letter_<slug>.mp3` |

Legacy filename convention: lowercase, ASCII slug of the Romanian text (diacritics
stripped, spaces → `-`). The slug is the canonical source for the `entity_id`.

**Quality flags (TTS regeneration queue):**

| File | Problem | Action |
| --- | --- | --- |
| `archive/romanian/audio/vocabulary/ce-mai-faci.mp3` | **0 bytes (corrupt) and orphaned** — referenced by no HTML page | Delete; regenerate via TTS only if the term "Ce mai faci?" is re-added to vocabulary entities |
| `archive/romanian/greetings.html` rows (18 formulas) | No audio exists at all | Queue for TTS: `audio/ro/greeting_<slug>.mp3` |
| `archive/romanian/alphabet.html` rows (58 letters/digraphs) | No audio exists at all | Queue for TTS: `audio/ro/letter_<slug>.mp3` |

All other files are 10–22 KB MP3s (single-utterance quality, acceptable for launch).

---

## 4. Extraction rules (executed by GLM — see task JSON)

1. **Row → entity:** For each `<tr>` in a content table, extract cell text per the column
   map in the task spec. Derive `entity_id` = `<type-prefix>_<data-audio basename>`; derive
   `ipa` from the IPA column where present (only `english/alphabet.html` has one).
2. **Multilingual pivot columns:** `vocabulary.html` has extra ES/IT/FR columns. Store them
   under `translations.es/it/fr` (bonus data), but **do not** surface them in the en→ro UI —
   Verbologic v1 is en↔ro only.
3. **Locale separation:**
   * `locales/en.json` + `locales/ro.json` get generic UI chrome (play buttons, section
     headings, table headers like "Romanian Sentence", "English Translation").
   * `locales/ro.json` **additionally** gets the contrastive notes from
     `romanian/alphabet.html` ("Like the *ts* in *cats*; a clear affricate, not a plain
     English *t*") and the English-track pedagogy text, keyed as
     `contrastive.<entity_id>.note` — these are L1-relative explanations, never generic UI.
4. **Audio handling:** copy (never move) MP3s to `./media/audio/<r2_target_path>`, commit
   nothing; the entity JSON references only the R2 URL
   `https://media.verbologic.com/audio/[lang_code]/[entity_id].mp3`.
5. **Lessons:** generate `content/ro/` and `content/en/` Markdown skeletons with frontmatter
   listing the entity IDs per roadmap level (from `index.html` roadmap), for later authoring.

## 5. Residual content gaps (backlog for next roadmap iteration)

* Grammar entities: noun gender/articles, verb conjugation, pronouns, prepositions,
  adjectives (Romanian) — pages were planned (TOCs exist) but never written.
* Daily-dialog story content (L3) — stub only.
* English track beyond the alphabet — all 12 sub-pages are stubs.
* Audio for greetings + alphabet (TTS batch).

