# Performance & content-model refactor plan

Status: **historical record, trimmed 2026-10-29.** Phases 0-8 are done or replaced; the live plan is `planning/content-in-database.md`. Revisions 1-3 (rendering tiers, generation pipeline, local-vs-API translation, the 10% slice) were removed; section numbers are kept because code comments cite them. Still authoritative: the invariants (section 4), the database architecture (sections 13-14, 16-19) and the manifest shape (sections 21, 23).

Constraints honoured: media files stay under `media/` (and keep their paths, so R2 URLs and uploads do not change); manifest/JSON structure may change; MD stays for prose, YAML/JSON allowed where better.


---

## 1. What is slow or duplicated today (measured)

_Removed 2026-10-29 (superseded or done). Recover with `git log -p -- planning/performance-and-content-refactor.md`. Current plan: `planning/content-in-database.md`._

## 2. Target model

### 2.1 One unit, many views (the reversible / non-reversible model)

The unit of content is a **unit** (word, phrase, letter, sentence). It is stored **once**, with a per-language map. Direction is a *topic property*, not a per-language record fan-out.

```yaml
# content/dictionary/CH01T01/topic.yaml      (84 files for the dictionary instead of thousands)
code: CH01T01
level: A1
mode: reversible            # reversible | directional   (replaces langs / sourceLang)
kind: word
units:
  - id: W001
    term: { en: hello, es: hola, it: ciao, fr: salut, de: Hallo, ru: Привет, hu: Szia, pt: Olá, ro: salut }
    ipa:  { en: "/həˈloʊ/", ro: "/saˈlut/" }
    tts:  { ro: "…" }                     # ttsText respelling, only where Edge TTS needs it
```

```yaml
# content/lectures/LT01T01/topic.yaml
code: LT01T01
mode: directional            # exists *about* one language; cannot be flipped
target: ro
phonetic: true               # second column = IPA
units:
  - id: L001
    term: { ro: A }
    ipa:  { ro: "/a/" }
    gloss: { en: "first letter…", de: "…" }   # explanations, NOT equivalent terms
```

| | `reversible` | `directional` |
|---|---|---|
| Meaning | `term` is a set of equivalents; any language can be learned, any can be the gloss | `term[target]` is the subject; other languages carry explanations (`gloss`) |
| Valid learner pairs | every (target, native) with both terms present | `(target, any native)` only |
| "Swap direction" UI | allowed | hidden |
| Missing language | row shows but is disabled (structure-first policy, unchanged) | n/a |
| Replaces | default | `sourceLang`, `langs`, `phonetic`-ownership, `EN_CANONICAL` special cases |

The client derives the table rows for a `(target, ui)` pair from the unit; nothing is pre-multiplied at build time. Non-reversible content therefore needs no special code in the index, the routes or the search — it is just a topic whose `mode` is `directional`.

### 2.2 Authoring formats

_Removed 2026-10-29 (superseded or done). Recover with `git log -p -- planning/performance-and-content-refactor.md`. Current plan: `planning/content-in-database.md`._

### 2.3 Media folder

_Removed 2026-10-29 (superseded or done). Recover with `git log -p -- planning/performance-and-content-refactor.md`. Current plan: `planning/content-in-database.md`._

### 2.4 Runtime payloads

_Removed 2026-10-29 (superseded or done). Recover with `git log -p -- planning/performance-and-content-refactor.md`. Current plan: `planning/content-in-database.md`._

### 2.5 Routing — superseded, see §7

_Removed 2026-10-29 (superseded or done). Recover with `git log -p -- planning/performance-and-content-refactor.md`. Current plan: `planning/content-in-database.md`._

### 2.6 One loader, many emitters

_Removed 2026-10-29 (superseded or done). Recover with `git log -p -- planning/performance-and-content-refactor.md`. Current plan: `planning/content-in-database.md`._

## 3. Phases

Each phase is independently shippable and ends with a **golden comparison**: the derived rows for every `(target, ui)` pair, the route list, and the entity-id set must match the pre-phase baseline, except for the fields intentionally dropped.

| Phase | Work | Expected outcome | Risk |
|---|---|---|---|
| **0 · Baseline & guardrails** | Start from a clean commit (the tree has ~100s of modified `item.json`). Add `scripts/perf-baseline.mjs` (payload sizes raw/gz, route count, `.output` file count, build time). Snapshot golden rows from today's payloads. Read one real `item.json` per kind and confirm the field list assumed here. | Numbers to beat; safety net for every later phase. | None |
| **1 · Payload quick wins** (no model change) | Minify output; remove `generated`; drop `sha1/bytes/source/section` from topic and search payloads (keep `mime`, `tags`); collapse `content.locales` to a compact form; add `_headers` caching. | `search.json` 4.16 MB → ~1.5 MB raw; topic files ~40–50% smaller; deterministic output. | Low |
| **2 · Rendering strategy** (replaces "route collapse") | Measure build time and file count; run the 1–2 day Workers SSR spike in §7; decide static tiers vs on-demand tail. **URLs do not change.** | Removes the 69k-route cliff without losing per-locale SEO pages. | Medium: introduces a Worker script if the spike passes |
| **3 · Phonetic articles as data** | Articles for letters/sounds become **structured sections stored as data** (one file per topic/locale), rendered by `PhoneticArticle.vue` — no `.md`. Delete `generate-letter-articles.mjs` and the `dev`/`generate` hook; drop `content/lectures/LT01T*` md; review tooling reads the data files. Content is produced offline with the prompt in `planning/prompts/phonetic-article.md` (see §12). | −3,267 files; faster dev start, `nuxt generate` and Nuxt Content DB build; richer articles than today's one-sentence notes. | Low–Medium: the reading view paginates by `##` heading — one section = one page, keep that contract |
| **4 · Unit model + loader** | Define the `topic.yaml` / `structure.yaml` / `media.lock.json` schema (zod, shared with `content.config.ts`). Write `content-graph.mjs`. Write an idempotent codemod (`--dry-run`) from `item.json` + md front matter → `topic.yaml` + lock. Slim md front matter. Keep old files until Phase 7. | Single source of truth; clean diffs; one reader. | Medium–High: the biggest change; guarded by the golden comparison |
| **5 · Unit-shaped payloads + client** | Emit the §2.4 shape; replace `useMedia` row handling with a `useUnits` selector `(unit, target, ui) → row`; update `roadmapStore`, `TopicTable`, `TopicGallery`, `Term.vue`, search. | `search.json` ~250 KB raw / 59 KB gz; one record per unit in memory. | Medium: touches the most client code |
| **6 · Direction semantics** | `mode: reversible | directional` in schema, validator, UI (hide/show swap, directional second column). Migrate `LT01` topics (`sourceLang` → `directional`+`target`). Delete `langs`, `sourceLang`, `EN_CANONICAL`, `broadcast`. | The five mechanisms (F9) become one. | Low–Medium |
| **7 · Cleanup** | Remove `entities/` bridge, `legacy_entity_id`/`progressAliases` (after confirming Supabase progress ids are all migrated), `stories/<trackLang>` legacy tree, one-off `reid-*`/`migrate`/`rehome` scripts, `item.json`. Per-track, per-UI-locale structure chunks (names ÷9). Update `manual/architecture.md`, `MAINTENANCE.md`, `curriculum.md`, `CLAUDE.md`. | Smaller code base and bundle. | Low |

Suggested order if time is short: **0 → 1 → 2 → 3**. That gets most of the build and size wins without touching the content model; 4–6 deliver the dedup and the reversible/non-reversible design.

## 4. Invariants (do not break)

- **`entity_id` = `<TOPIC>:<ID>` and all article/public URLs stay stable** (old ones redirect). User progress in Supabase is keyed by these, so no user-data migration is needed.
- **`media/` file paths do not move**, so R2 stays valid and `run media upload` stays differential.
- **Structure-first policy stays:** unresolved references are planned items, never build errors (`architecture.md`).
- All commands stay behind `./run.sh`; `run media manifest`, `scaffold` and `generate-audio.py` are updated to read/write `topic.yaml` + lock rather than `item.json`.

## 5. Risks and mitigations

_Removed 2026-10-29 (superseded or done). Recover with `git log -p -- planning/performance-and-content-refactor.md`. Current plan: `planning/content-in-database.md`._

## 6. Decisions (rev. 1 — see §10 for the current open list)

_Removed 2026-10-29 (superseded or done). Recover with `git log -p -- planning/performance-and-content-refactor.md`. Current plan: `planning/content-in-database.md`._

# Revision 2

## 7. Static vs dynamic rendering on Cloudflare

Decision kept: the site stays static. Measured: `payloadExtraction: false` halves the file count (2.05 to 1.05 files per page, +3.4 KB gzip per page), build cost is about 14 ms per page, and the build emits no `sitemap.xml`, `robots.txt` or `hreflang`. The full spike (Findings 1-8) is in git history. The file limit is now handled by moving article text into the database, see `planning/content-in-database.md`.

## 8. Generation pipeline (translation, templates, sound)

_Removed 2026-10-29 (superseded or done). Recover with `git log -p -- planning/performance-and-content-refactor.md`. Current plan: `planning/content-in-database.md`._

## 9. Content generation order

_Removed 2026-10-29 (superseded or done). Recover with `git log -p -- planning/performance-and-content-refactor.md`. Current plan: `planning/content-in-database.md`._

## 10. Go / no-go and sequencing

_Removed 2026-10-29 (superseded or done). Recover with `git log -p -- planning/performance-and-content-refactor.md`. Current plan: `planning/content-in-database.md`._

## 11. Local vs API translation, batching, and the CH01 pilot (2026-10-23)

_Removed 2026-10-29 (superseded or done). Recover with `git log -p -- planning/performance-and-content-refactor.md`. Current plan: `planning/content-in-database.md`._

# Revision 3 (2026-10-23)


## 12. Optimisation first, then slice validation

_Removed 2026-10-29 (superseded or done). Recover with `git log -p -- planning/performance-and-content-refactor.md`. Current plan: `planning/content-in-database.md`._

# Revision 4 (2026-10-23) — content in Supabase, not in the build

Decisions in this revision: **the dictionary lives in Supabase and is queried page by page**; **only some words get articles**; **lectures are the file-count driver, not the dictionary**; **9 seed JSON files in git, never deployed**; **default page size 5**; **deploy only the built site**.

This revision supersedes §7.1's "stay fully static" decision for the *content* path. The static site stays; what changes is where the rows come from.

## 13. What the measurements actually say

_Done or measured; body removed 2026-10-29. Recover with `git log -p -- planning/performance-and-content-refactor.md`. Current plan: `planning/content-in-database.md`._

## 14. Target architecture

### 14.1 Content lives in Supabase; the site queries it

```
authoring (git)                    Supabase                    browser
─────────────────                  ────────                    ───────
content/**/*.md  ──┐
src/data/alphabets ─┼─► seed/*.json ─► import ─► units table ─► page query (5 rows)
media/**/item.json ─┘   (9 files)                articles table
```

- **units** — one row per unit: `entity_id`, `topic`, `track`, `lang`, `term`, `ipa`, `names` (jsonb), `audio` (jsonb), `kind`, `level`.
- **articles** — one row per article *locale*: `entity_id`, `locale`, `title`, `summary`, `body` (minimap AST or markdown), `status`, `source_sha`.
- **topics / chapters** — the structure layer, so the sidebar can be queried rather than bundled.

The browser asks for **one page of 5 rows**, not a 2.19 MB index. That is the whole point: the payload stops scaling with content.

### 14.2 The 9 seed files

`seed/<lang>.json`, one per target language, committed to git, **never deployed**.

Measured shape (848 units):

| Layout | Size |
|---|---|
| 9 files × full unit (names map repeated in each) | 1,808 KB |
| 1 shared `names.json` + 9 thin per-language files | **568 KB** (−69%) |

The thin form wins: `names` is the same 9-language map in every file, so it is stored once. Each per-language file carries only `{ i, term, ipa, audio }`.

These files are the **import source**, not a runtime asset. They exist so the database can be rebuilt from git without re-parsing Markdown and manifests.

### 14.3 What stays static

- Track/chapter/topic pages (27).
- Article pages for the units that have one — 5 dictionary units, 27 lecture docs, 27 story docs = **891 pages**.
- Phonetic articles: **client-rendered from the bundled alphabet data** (see §15).

### 14.4 Projected result

_Done or measured; body removed 2026-10-29. Recover with `git log -p -- planning/performance-and-content-refactor.md`. Current plan: `planning/content-in-database.md`._

## 15. Phonetic articles: stop prerendering them

Decision kept: phonetic articles stay prerendered in all 9 locales. Prerendering only `en` + target was built and reverted: `wrangler.toml` serves `404-page` for unknown paths, so the 7 skipped locales returned 404 (2,541 internal links). Superseded by `planning/content-in-database.md`, which removes the article routes altogether.

## 16. Page size 5

Done: `roadmapStore.pageSize` default is now 5 (was 13). The toolbar's Fibonacci selector still offers 3·5·8·13·21·34·55·89, so a reader who wants more can pick it.

With rows coming from the database this matters more than it did: the first query returns 5 rows, so the first paint does not wait for a 13-row slice.

## 17. Build and deploy workflow

The user's workflow, made explicit:

```
author → ./run.sh commit "<msg>" → ./run.sh push → ./run.sh build → ./run.sh deploy
```

- **`seed/*.json` is committed but not deployed.** It is import input, not a runtime asset. `.output/public` never contains it.
- **Only `.output/public` is deployed** (`wrangler.toml` `[assets] directory`). Source, `content/`, `media/`, `seed/` and `planning/` stay in git and never reach Cloudflare.
- **`public/data/media/**` shrinks to near nothing** once the dictionary is queried from Supabase. What remains is `locales/`, `prices.json`, and the article payloads.

This is already how `wrangler.toml` works — the change is that `public/data` stops carrying 5.74 MB of table payloads.

## 18. Revised phase order

| Phase | Work | Why now |
|---|---|---|
| **3a** | Prerender phonetic articles for `en` + target only | **Rejected** — see §15.1 |
| **4** | Manifest shape: `locales` + `files` (§20–§24) | The import unit for the DB; do it before the exporter so the exporter reads one shape |
| **5** | `seed/*.json` exporter + Supabase `units`/`articles`/`topics` schema + importer | The foundation; unblocks everything else |
| **6** | Client queries the DB page by page; delete `search.json`/topic payloads | −5.76 MB payload |
| **7** | Direction semantics (`reversible` / `directional`) | Unchanged from rev. 3 |
| **8** | Cleanup: `entities/` bridge, legacy scripts | Unchanged |

### 18.5 Phase 8 — done (2026-10-24)

_Done or measured; body removed 2026-10-29. Recover with `git log -p -- planning/performance-and-content-refactor.md`. Current plan: `planning/content-in-database.md`._

### 18.4 Phase 7 — done (2026-10-24)

_Done or measured; body removed 2026-10-29. Recover with `git log -p -- planning/performance-and-content-refactor.md`. Current plan: `planning/content-in-database.md`._

### 18.1 Phase 5 — done (2026-10-24)

_Done or measured; body removed 2026-10-29. Recover with `git log -p -- planning/performance-and-content-refactor.md`. Current plan: `planning/content-in-database.md`._

### 18.3 Phase 6 — done (2026-10-24)

_Done or measured; body removed 2026-10-29. Recover with `git log -p -- planning/performance-and-content-refactor.md`. Current plan: `planning/content-in-database.md`._

### 18.2 Offline mode — done (2026-10-24)

_Done or measured; body removed 2026-10-29. Recover with `git log -p -- planning/performance-and-content-refactor.md`. Current plan: `planning/content-in-database.md`._

## 19. Open questions for this revision — answered

1. **Anonymous reads.** The dictionary must be readable without sign-in (it is public content). That means RLS policies granting `anon` SELECT on `units`/`articles`/`topics`, and the publishable key in the client. Confirm that is acceptable — it is the standard pattern for public reference data, but it does expose the full dictionary to anyone with the key.
**answer** I could store a secret on the cloudflare user is not anonymous 100% he is storing a temporary id in browser cache. We use his temporary ID for tracking. If he register, temporary id is his permanent. We just fill the gaps on registration.
2. **Offline / repeat-loop playback.** The audio queue plays a page of rows repeatedly. With rows from the DB, a page change is a network round-trip. Acceptable, or should the next page be prefetched?
**answer** we can prefetch next page while user listen current page to reduce lagging.
3. **Search.** Today the dictionary-wide search loads one 2.19 MB payload and filters in memory. With the DB it becomes a query — but fuzzy matching across 9 languages needs either Postgres `pg_trgm`/full-text or a client-side index built from a smaller payload. Which?
**answer** we use pg_trgm
4. **Seed file granularity.** 9 files by target language (measured above), or 1 file per track? Per-language matches the import and the RLS shape.
**answer** one file per language.

### 19.1 Consequences of the answers

**Anonymous reads → a device identity, not an anonymous role.** The reader gets a temporary id in browser storage on first visit; it is the tracking key. Registration *promotes* that id rather than creating a new one, so progress carries over and only the missing profile fields are filled in.

This changes the RLS shape from "public read, authenticated write" to:

| Table | `anon` | `authenticated` |
|---|---|---|
| `units`, `articles`, `topics` | SELECT | SELECT |
| `learned_items`, `quiz_results`, `credit_ledger` | SELECT + INSERT/UPDATE **scoped to the device id** | same, scoped to `auth.uid()` |

The device id must be a **claim the client cannot forge into another user's data**. Two options:

- **`device_id` column + RLS predicate** — the client sends its id; the policy checks it matches the row. Simple, but the id is a bearer token: anyone who learns another device's id can read that device's progress.
- **Anonymous sign-in** (`supabase.auth.signInAnonymously()`) — Supabase issues a real JWT with a real `auth.uid()`. Registration links the anonymous user to a permanent one (`updateUser({email})` or `linkIdentity()`), so the id is *already* permanent and no promotion logic is needed. RLS stays the standard `auth.uid() = user_id` shape.

**Recommendation: anonymous sign-in.** It is exactly the "temporary id becomes permanent on registration" model, and it avoids inventing a bearer-token scheme. Verified against the Supabase docs (2026-10-23):

| Fact | Consequence |
|---|---|
| Anonymous users assume the **`authenticated`** role, with an `is_anonymous` claim in the JWT | Policies must check `is_anonymous` to distinguish them from real accounts — `TO authenticated` alone does **not** mean "signed up" |
| Free tier MAU quota is **50,000** | Every visitor becomes an MAU. Fine at launch; a concern only at scale |
| Converting requires **manual linking enabled** in the dashboard | A project setting, not code |
| Docs warn: *"user metadata being cached across unique anonymous users as a result of Next.js static page rendering"* | **This site is SSG.** Auth must stay strictly client-side — never read the session during prerender, never let a user-scoped value reach the HTML |

That last row is the one to watch. The current architecture is already correct (auth lives in a Pinia store, populated in the browser), but Phase 6 must not introduce a server-side session read. The `is_anonymous` check also means the "restrictive policy" pattern from the docs is needed, since RLS policies are permissive-by-default and OR'd together.

**Decision (2026-10-23): anonymous sign-in, but LAZY — on first write, not first visit.** The MAU row above is the reason. Signing in on first visit makes every visitor an MAU and spends the 50,000 Free-tier quota on people who never engage. Signing in on the first *progress write* keeps MAU proportional to engaged visitors while still giving a real, unforgeable `auth.uid()`. Implemented in `userStore.ensureAnonymousSession()`, called from `useProgress`'s write paths only — `refresh()` deliberately never mints an account just to read.

**Turnstile, not hCaptcha.** The site already runs behind Cloudflare, so Turnstile adds no third-party dependency and is free/unlimited. It guards `signInAnonymously` (the endpoint that creates rows); `updateUser` needs no token because it creates nothing. The widget is `interaction-only` and the script loads on demand, so it costs nothing for visitors who never sign in. See `manual/MAINTENANCE.md` §7 for the two dashboard steps.

**No siteverify Worker (decided 2026-10-23, after testing).** The Turnstile Spin flow deploys a managed Worker that proxies siteverify. That is the wrong shape here: **Supabase validates the CAPTCHA token itself**, calling Cloudflare's siteverify internally. Worse, Turnstile tokens are **single-use** — a Worker that consumed the token would leave Supabase rejecting it with `timeout-or-duplicate`. So the client sends the token straight to `signInAnonymously({ options: { captchaToken } })` and no Worker is deployed. Verified end to end: a real anonymous user was created (`is_anonymous = true`) and a `learned_items` row written under its `auth.uid()`.

**Config is declarative and minimal.** `supabase/config.toml` declares only `enable_anonymous_sign_ins` and `[auth.captcha]`, applied with `supabase config push`. It must stay minimal: `supabase init` generates local-dev defaults, and pushing the full file would disable e-mail confirmations, change the OTP length from 8 to 6, and replace production redirect URLs with localhost ones. `supabase config diff` showed 22 differences with the generated file and only 2 with the minimal one.

**Prefetch the next page.** The audio queue already knows the page boundary, so the next page's query fires when the current page's playback starts. No new infrastructure — one `prefetch` call keyed on `page + 1`.

**`pg_trgm` for search.** Enables `CREATE EXTENSION pg_trgm` plus GIN indexes on the searchable columns. Note it is **trigram** matching, so it handles typos and partial words but not stemming — for 9 languages that is the right trade (no per-language dictionary to maintain). The index must be on the *normalized* text (`lower(unaccent(name))`) to match across diacritics, which matters for `ro`/`hu`/`ru`.

**One seed file per language.** Confirms §14.2's thin layout: 1 shared `names.json` + 9 per-language files, 568 KB.

# Revision 5 (2026-10-23) — manifest shape: locales as rows, files as paths

## 20. What is wrong with `item.json` today (measured)

_Removed 2026-10-29 (superseded or done). Recover with `git log -p -- planning/performance-and-content-refactor.md`. Current plan: `planning/content-in-database.md`._

## 21. The shape

```json
{
  "code": "W001",
  "track": "dictionary",
  "chapter": "CH01",
  "topic": "CH01T01",
  "kind": "word",
  "entity_id": "CH01T01:W001",
  "cefr": "A1",
  "tags": ["shared-article-variant", "vocabulary#override:vocabulary"],

  "locales": {
    "en": { "name": "hello", "description": "An informal greeting…", "ipa": "/həˈloʊ/" },
    "ro": { "name": "salut", "description": "O formulă informală…", "ipa": "/saˈlut/" }
  },

  "files": {
    "sound/en.mp3": { "bytes": 11232, "sha1": "918a4e31…" },
    "sound/ro.mp3": { "bytes": 10656, "sha1": "16e4b9d6…" }
  }
}
```

Two maps, split by what they describe:

- **`locales`** — one key per locale, each a complete row (`name`, `description`, `ipa`, `ttsText`, `example`, `context`). The locale key *is* the identity.
- **`files`** — keyed by **path**, not locale. Holds only the two facts that cannot be derived: `bytes` and `sha1`. A file's presence *is* its published status.

Measured on the real data: **3,815 KB → 1,626 KB (−57%)**.

### 21.1 Why a map keyed by locale, not an array

| Shape | Lookup | Duplicate locale possible | Import |
|---|---|---|---|
| `[{locale, name, …}]` | O(n) scan | yes | read the `locale` field |
| `{en: {name, …}}` | O(1) | no | `Object.entries` → rows |

The array's only advantage is ordering, and ordering is already owned by `src/data/navigation.json` (`LOCALES`). The map makes an invalid state unrepresentable.

### 21.2 Why `files` is keyed by path, not locale

Keying by locale (`files: {en: {…}}`) cannot express the `read/` folder without nesting, and an R2 object is identified by its path, not by its locale. Keying by path means:

- the key is the R2 key suffix — sync compares `files` against the bucket directly, no reconstruction;
- a new folder (`read/`, or anything later) needs no schema change;
- two files for one locale (short + read) are naturally distinct.

There are **2,847 distinct keys and 0 shared keys** today, so path-keying has no collision risk.

### 21.3 What disappears

| Field | Why |
|---|---|
| `file` | it *is* the `files` key |
| `key` | `dir + path`; already stale in 347 places |
| `mime` | from the extension |
| `status` | present in `files` = published; absent = pending |
| `pronunciation` | folded into `locales[loc].ipa` / `.ttsText` |
| `metadata` | folded into `locales[loc].example` / `.context` |
| `names` / `description` | folded into `locales[loc]` |

`ttsText` currently lives in **two** places — a top-level map (29 items) and `pronunciation[loc].ttsText` (8 items), with 0 collisions. Both fold into one `locales[loc].ttsText`.

Top-level `letter` (26 items) and `schema` (2 items) stay as they are.

## 22. Migration

_Removed 2026-10-29 (superseded or done). Recover with `git log -p -- planning/performance-and-content-refactor.md`. Current plan: `planning/content-in-database.md`._

## 23. What it unblocks

The `locales` map is the import unit for §14.1's `units` table: one row per `(entity_id, locale)`. Adding a language is adding a key to `locales` — no schema change, no second map to keep in sync. That is the "load it into the database when we translate, or when we add a new one" requirement.

`files` is the sync unit: it compares directly against the R2 bucket listing, so `media verify --remote` becomes a set difference rather than a reconstruction.

## 24. Risk

_Removed 2026-10-29 (superseded or done). Recover with `git log -p -- planning/performance-and-content-refactor.md`. Current plan: `planning/content-in-database.md`._
