# Content in the database — assessment and plan

Date: 2026-10-29, revision 2 (one JSON per article, all nine reader languages in each file). Supersedes `plan/file-count-reduction.md` (folded in) and the open parts of `performance-and-content-refactor.md` §7, §14–§15.

## 1. Verdict

**Yes: the database serves the articles, and `content/` keeps one small JSON file per story or lecture item, holding all nine languages.** It is feasible, low-risk and about half built. It removes the largest group of deployed files, makes the deploy size independent of how many stories are written, drops `@nuxt/content`, and cuts the repo from 4,492 tracked content files to about 500.

## 2. Where the files are

Two separate budgets, so two separate answers.

**Deployed (Cloudflare Workers Free: 20,000 static files per version).** Last `deploy-dry`: 15,600 files (78%).

| Source | Routes | Note |
|---|---|---|
| Story articles | **4,779** = 531 docs × 9 learner languages | the biggest group; each new story adds 9 docs and 81 routes |
| Lecture articles | 440 docs (English only) × the topic's languages | one language for a language-specific topic |
| Track pages, JS chunks, `public/data` | ~27 + ~71 + 139 | fixed |

The earlier spike measured 1.05 files per page with `payloadExtraction: false`; that does not reconcile with 15,600 files for 6,834 routes. **Re-measure with `./run.sh build && ./run.sh deploy-dry` before and after each phase** rather than trusting either figure.

**Repository (7,145 tracked files).** `content/` 4,492 (971 once the English-only cut is committed) · media manifests 2,366 · `src` 117 · `scripts` 44.

**R2 does not count files.** Audio and story pictures cost nothing against either budget.

## 3. What Supabase already holds (verified 2026-10-29)

| Table | Rows | Note |
|---|---|---|
| `units` | 13,487 | read by the client (`useContentDb.ts`) |
| `articles` | 971 | 440 lecture (`en`) + 59 stories × 9 locales; **734 KB of text in total** |
| `topics` | 221 | |

Public-read RLS and the `pg_trgm` index exist. The flow is one-way (`content/*.md` → `seed export` → DB) and **no page reads the `articles` table yet.** The lecture rows are stale: the chapter-1 articles were regenerated after the last import.

## 4. Decisions taken

1. **One JSON file per article**, kept under `content/` where the files are now: `content/stories/<TOPIC>/<CODE>.json` and `content/lectures/<TOPIC>/<ID>.json`. Each file holds every language in a `locales` map. This replaces nine Markdown files per story with one (stories 531 → 59 files) and keeps lectures at 440 files even once all nine languages are written (it would be 3,960 as Markdown).
2. **Every article is reversible.** Any of the nine languages can be the reader's language, and each article carries its own text in all of them. This reverses the 2026-10-26 rule that lecture articles are English only.
3. **Lecture text uses international IPA terminology** from a fixed glossary (section 6), so it translates reliably.
4. **Relevance, not uniformity.** An article or topic can name the languages it applies to. A learner sees only the topics and items that apply to the language they study (section 7).
5. **The database is what the site reads.** `content/*.json` is the authoring source and the database import source; there is no separate `seed/articles/` layer.
6. **Structured JSON all the way, stored as `jsonb`.** The article is data, not text: no Markdown anywhere, in the files or in the database. The files are written with **2-space indentation, a final newline and LF line endings** by one shared writer, so a diff reads like the article.
7. **Migrate now, generate later.** This plan moves existing content only. New content, the new prompts and the translations come afterwards (phases 5–6).
8. **One route per article, language as a parameter** (section 8). No per-language URL multiplier, no Worker, minimal SEO.
9. **Translations are run later, a chapter at a time, from a job table** that a weekly run works through until everything is done (section 6).

## 5. The article file

```jsonc
// content/stories/ST01T02/S003.json
{
  "entity_id": "ST01T02:S003",
  "status": "draft",
  "paragraphsPerPage": 1,
  "context": { "Pip": "a small white goose" },
  "locales": {
    "en": { "title": "…", "summary": "…", "paragraphs": ["…", "…"] },
    "ro": { "title": "…", "summary": "…", "paragraphs": ["…", "…"], "sourceSha": "…" }
    // de es fr hu it pt ru
  }
}
```

```jsonc
// content/lectures/LT01T03/L627.json
{
  "entity_id": "LT01T03:L627",
  "targets": ["ro"],                     // omitted = every language
  "related": [],
  "order": 0,
  "locales": {
    "en": { "title": "…", "summary": "…",
            "sections": [{ "title": "The sound", "text": "… (mama) /ˈma.ma/ …" }, …],
            "sourceSha": null },
    "de": { "…": "…", "sourceSha": "<hash of the en text it was translated from>" }
  }
}
```

- Stories use `paragraphs`, lectures use `sections`. No Markdown is parsed at runtime or at import. Pagination keeps its rule: one page per section, or one page per paragraph.
- Each locale carries its own `sourceSha`, so a changed English text marks the other eight stale (the review tooling already uses this idea).
- A story with nine locales is about 3–4 KB; a lecture item with nine locales is about 11 KB. All files stay small.

**Formatting.** One writer in each language (`scripts/lib/articles.mjs`, `scripts/lib/articles.py`) is the only code that writes these files: keys in a fixed order, 2-space indentation, `ensure_ascii=False` so accents and IPA stay readable, one paragraph or section per line group, final newline, LF line endings (`.gitattributes`: `content/**/*.json text eol=lf`, because the repo currently warns about CRLF on Windows). `validate` fails on a file that is not in canonical form, the same way `seed export --check` works today.

**Database shape.** One row per article, not one per language, because the reading view shows two languages side by side (the language being learned and the reader's own) and one request should fetch both:

| Column | Type | Content |
|---|---|---|
| `entity_id` | `text` primary key | `ST01T02:S003` |
| `track`, `topic` | `text` | for filtering and the sitemap |
| `status` | `text` | draft, review, published |
| `targets` | `text[]` | languages the article applies to; `null` = all |
| `ord`, `related` | `int`, `text[]` | as today |
| `meta` | `jsonb` | `paragraphsPerPage`, `context` |
| `locales` | `jsonb` | the `locales` object from the file, unchanged |
| `updated_at` | `timestamptz` | |

The client asks for two languages with PostgREST path selection: `select=entity_id,meta,en:locales->en,ro:locales->ro`. A GIN index on `locales` is not needed because nothing searches inside article text; `pg_trgm` search stays on `units`.

**Size, honestly.** `jsonb` is not smaller than text: it stores a parsed binary form that is usually slightly larger. The saving comes from Postgres compressing values over about 2 KB (TOAST), and a nine-language lecture item is around 11 KB, so it applies. The whole corpus is under 5 MB uncompressed even with every language translated, against a 500 MB Free allowance, so compression is a bonus and not what justifies the change. What `jsonb` does buy: the structure survives the round trip (no Markdown to re-parse), one fetch can return exactly the two locales needed, and fields such as `targets` and `status` can be filtered in SQL.

The existing `articles` table (971 rows, one per language, text body) is replaced by a migration that creates the new shape; the old rows are dropped after the new import is verified.
In dev the article page falls back to reading the JSON files, so no database is needed offline.

## 6. Lecture text: IPA terminology from a glossary

The current prompts ban phonetic jargon (R18) and ask for plain mouth descriptions. That works for one language and fails for translation: Gemini invents a local term per language, which is how *rotunjită* ended up in the Romanian pages. The replacement:

- **A glossary, `src/data/ipa-glossary.json`:** about 100 standard terms from the IPA chart (voiced, voiceless, plosive, fricative, nasal, trill, bilabial, alveolar, palatal, velar, close, open-mid, front, back, rounded, unrounded, long, stressed, syllable, diphthong, and so on). **Built once, in three steps (decided 2026-10-29):** Claude writes the English terms from a prompt, Gemini translates them into the other eight languages, and Claude reviews and corrects the result. The file records each term's `status` per language (`draft` after translation, `checked` after review), so the validator can refuse a `draft` term in a published article and a native speaker can later be asked to confirm only the entries still marked as uncertain (most likely `ro`, `hu` and `ru`). The glossary is fixed after that: the model never picks a local term during article translation.
- **Writing prompt:** the article may use only glossary terms for phonetic concepts, defines each on first use in one plain sentence, and keeps every other sentence in simple English. This replaces the jargon ban with a controlled vocabulary.
- **Translation prompt:** receives the glossary column of the target language and must use those exact forms. Words inside `( )` and the IPA after them are copied unchanged.
- **Validator:** rejects a text that uses a phonetic term outside the glossary; rejects a translation where a `(word) /ipa/` pair differs from the source; keeps the closed word list, so the model still cannot invent an example word or its IPA.
- **Read-aloud audio:** one MP3 per article and locale (`read/<locale>.mp3`). The existing IPA respelling per language already handles each locale.

Translation volume: 440 lecture articles × 8 languages = 3,520 texts of about 1.2 KB each. A missing locale falls back to English and shows no stale warning.

**Translation jobs (decided 2026-10-29: later, per chapter, on a schedule).**

- `./run.sh translate plan` writes the job table `content/jobs/translations.json`: one job per (topic, language) that still has untranslated or stale articles. Chapter 1 alone is 6 topics × 8 languages = 48 jobs. A topic is the unit because a whole chapter is too large for one run.
- Each job has `status` (`pending`, `running`, `done`, `failed`), `attempts`, `last_run` and the article ids it covers.
- `./run.sh translate run [--max N]` takes the next N pending jobs (default sized to the Gemini quota), translates their articles with the glossary prompt, runs the validator, writes the JSON files and updates the job. A failed article fails its job only; the job is retried on the next run (three attempts, then it stays `failed` for a look).
- `./run.sh translate status` prints done/pending/failed per chapter.
- **Weekly trigger:** a scheduled run of `translate run`. The translation key (`GEMINI_API_KEY`) lives in the local `.env` and the runner writes files in this repo, so the scheduler must run on this machine (Windows Task Scheduler), not in the cloud. The run leaves its changes uncommitted for review, as the other generators do.
- The table is a committed file so its state follows the repo; the weekly run is idempotent, so a missed week costs nothing.

## 7. Relevance by target language

- **Items:** `targets` is a list of languages (omitted = all). It replaces the single `target` and `mode: directional` on article items. A learner of Hungarian sees vowel harmony; a learner of French sees nasal vowels; neither sees the other's item.
- **Topics:** a topic is shown for a language when it has at least one item for it. A topic may also declare `targets` in the sidebar so that `./run.sh missing` stops listing items that can never apply as planned content.
- **Docs to update when this ships:** `manual/curriculum.md` ("a chapter is the same for every language" becomes "the same topic list, and a topic shows only where it has content") and `CLAUDE.md`.

## 8. Routes and SEO

**Decided 2026-10-29: one route per article, the languages as parameters, minimal SEO.**

- One prerendered page, `/learn/read`, shows any article: `/learn/read?id=ST01T02:S003&lang=ro&doc=en` (`lang` = the language being learned, `doc` = the reader's own language; both default from the learner's settings). Query strings never need a file, so every such URL returns 200 from that one static page. **No Worker, no 404 workaround, no per-language URL multiplier.** The 4,779 story routes and the 440 lecture routes become one file.
- The old per-language paths (`/learn/<lang>/<track>/<topic>/<id>/<doc>`) stop existing. Internal links (`TopicArticle`, `ArticleRail` and the story cards) are updated; a `_redirects` rule for old external links is optional and its placeholder syntax needs checking before use.
- SEO is minimal: the page has a title and description set on the client, no sitemap, no `HTMLRewriter`. The earlier spike already found the site has no `sitemap.xml`, `robots.txt` or `hreflang`, so nothing indexed today is lost beyond the article text itself. If readable path URLs or crawlable text are wanted later, a small Worker shell can be added without changing the data model.
- The page shows a not-found state when the id has no row, with `noindex`.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Articles depend on Supabase being up (the Free tier pauses idle projects) | `db-heartbeat.mjs` exists; the browser caches fetched article rows; the existing offline store (old plan §18.2) |
| Machine translation corrupts `(word) /ipa/` or a glossary term | Validator compares every translated page against the source before it is written |
| Wrong glossary entry is repeated in 3,520 texts | The glossary is reviewed before the first translation run; changing a term marks the affected locales stale |
| 13 scripts read or write `content/` | One helper module (`scripts/lib/articles`, `.mjs` and `.py`); migrate script by script, each checked by a round trip |
| A glossary term is wrong in a language Claude cannot verify as a native speaker | Terms carry `draft`/`checked` per language; a draft term blocks publishing; uncertain entries are the short list for a native speaker later |
| Weekly job fails or is missed | Jobs are idempotent and retried; `translate status` shows what is left; nothing is published half-translated because a missing locale falls back to English |
| Old per-language article URLs stop working | Only internal links use them today; optional `_redirects` rule |
| Two writers (Node and Python) format JSON differently and every run rewrites every file | Both follow the same canonical form; a test writes one article from each and compares bytes |
| Hundreds of small files still in the repo | About 500 is acceptable; if language growth pushes it past ~2,000, group lectures by topic (about 221 files) |

## 10. Phases (each ends in a measurable gate)

Phases 0-4 migrate what exists. Phases 5-6 are the new work (glossary, prompts, translation) and start only after the migration is done.

| # | Work | Gate |
|---|---|---|
| 0 | **Done 2026-10-29.** Committed the English-only cut and the regenerated chapter-1 articles; `seed export` then `seed import` (the key is `SUPABASE_SECRET_KEY` in `.env`): 436 articles updated, 535 unchanged | DB has 971 articles, 13,487 units, 221 topics, matching the files |
| 1 | **Done 2026-10-29.** New table `article_docs` (the old `articles` stays until cutover so the deployed site keeps working); codemod `content/**/*.md` to `content/**/<ID>.json`; shared writers and canonical-form check; `media-index`, `validate-data`, `missing-content`, `seed-import`, `generate-audio.py --read`, `generate-story-images.py`, `review-story-characters.py`, `create-stories.py`, `create-lecture-articles.py`, `lecture.mjs` and `alphabet-to-articles.mjs` read and write the JSON. The Markdown is now a derived copy (`./run.sh articles sync-md`) until phase 4 | `md -> json` reproduces all 971 docs; 499 files canonical in Node and Python; `media index` output byte-identical; 499 articles in `article_docs`; file count 4,492 tracked content files -> 499 once the derived Markdown is untracked |
| 2 | **Done 2026-10-29.** `targets` on 437 lecture articles (from the manifests, `scripts/articles-set-targets.mjs`); `media-index` filters records by the topic's `targets`, the article's `targets`, then the old manifest `target`; `validate-data` checks both and that an article's targets agree with its manifest; both generators set `targets` on new articles; the column is in `article_docs` | Retargeting an article moves its records to the new language (tested: `ro` to `fr` and back); runtime payloads byte-identical; validator catches a disagreeing target |
| 3 | **Done 2026-10-29.** The single `/learn/read?id=TOPIC:ID&lang=..&doc=..` page reads `article_docs` in the browser (no JSON fallback in dev: it reads the same table, so run `./run.sh seed import` after editing an article); `src/lib/article.ts` + `ArticleText.vue` replace `ContentRenderer`; `TopicTable` links to it; the per-language doc routes and `contentDocRoutes()` are gone | Headless Chrome shows a lecture, a story and the not-found state from the DB; build prerenders 42 routes (was 8,780) and writes 261 files in `.output/public` |
| 4 | **Done 2026-10-29.** Removed `@nuxt/content`, `content.config.ts`, the 971 derived Markdown files, `content-md-sync`/`content-md-to-json` and their `run.sh` commands; docs updated. **Still to do after the deploy:** drop the old `articles` table (`drop table public.articles`), because the live site still reads it until then | Clean `./run.sh build` and `validate`; tracked files 4,126 -> 3,155 |
| 5 | **Done 2026-10-29.** `src/data/ipa-glossary.json` (63 terms; English by Claude, 8 languages by Gemini via `scripts/glossary-translate.py`, reviewed by Claude: 126 `checked`, 18 `draft` for a native speaker); `scripts/lib/glossary.py` (`writing_block`, `translation_prompt`, `check_writing`, `check_translation`); the lecture and alphabet writing prompts use it; `validate-data` checks the glossary. *Rounded/unrounded* are deliberately not in it | A text with a term outside the glossary is rejected (23 existing English pages found, 16 regenerated; 7 remain: L010 L013 L018 L044 L048 L435 L673) |
| 6 | `./run.sh translate plan|run|status`, the job table, the weekly Task Scheduler entry; first jobs: chapter 1 | `translate status` shows chapter 1 done in all languages over the weeks it takes; no `(word) /ipa/` difference from the source |
| 7 (defer) | Manifests: 2,366 `item.json` to one JSON per topic (about 221) | Only if the repo file count starts to hurt; 11 readers make it costly |

Rough effort: 0 half a day · 1 two days · 2 one day · 3 one day · 4 half a day · 5 one day · 6 one to two days, then the weekly runs.

## 11. Decisions (answered 2026-10-29)

1. **Glossary:** built by Claude (English terms), translated by Gemini, reviewed and corrected by Claude, with per-language `draft`/`checked` status (section 6).
2. **Translation:** later, one job per topic and language from a job table, run weekly until done (section 6). Only existing content is migrated now.
3. **Files:** one per item, nine locales inside (section 5).
4. **SEO:** minimal or none (section 8).
5. **Story and lecture URLs:** one route per article with the language as a parameter (section 8).

Left to confirm:

- **URL form.** I read "one route with a language parameter" as the static page `/learn/read?id=...&lang=...&doc=...`, which needs no Worker. If you want path URLs such as `/learn/stories/ST01T02/S003?lang=ro`, a small Worker shell is added back in phase 3.
**answer** the most cost effective solution. Is solution 1 probably.
- **Glossary risk accepted.** Claude cannot confirm native-speaker usage for every term; the `draft`/`checked` flags keep the doubtful ones visible. 
**answer** we accept the risk