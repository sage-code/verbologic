# Follow-up: payload size and the article authoring format

Two questions, answered separately because they have opposite answers:

1. **Reduce the dictionary data JSON?** — Yes, but not by restructuring it, and it is not the biggest win available.
2. **Keep articles in `content/` as YAML instead of Markdown?** — No.

All numbers below are measured from the current tree, not estimated.

---

## 1. What the numbers actually say

### The runtime payloads are offline-only

This is the fact that reframes the whole question. `useMedia` tries the database
first and only falls back to the bundled payload when the query fails:

```ts
// useMedia.fetchTopic
const rows = await db.fetchTopicPage(trackOf(section), topic, locale)
if (rows) return rows as MediaRecords          // ← happy path, payload never fetched
const bundled = await $fetch(`/data/media/${section}/${topic}.json`)
```

So on a working database, **none of the 10.4 MB is downloaded**. It is a
maintenance-mode asset.

| Payload | Raw | Gzip | Fetched when |
|---|---:|---:|---|
| `dictionary/search.json` | 2,629 KB | 216 KB | DB search fails |
| `lectures/search.json` | 1,643 KB | 147 KB | DB search fails |
| `index.json` | 213 KB | 13 KB | **every page** |
| 85 dictionary topic files | 6,457 KB | — | DB topic query fails |
| 21 lectures topic files | 3,890 KB | — | DB topic query fails |

`index.json` is the only payload on the happy path, and it is 13 KB gzipped.
That is not a problem worth solving.

### The real weight is the alphabet data, and it is on every page

| Item | Raw | Gzip |
|---|---:|---:|
| `src/data/alphabets/*.json` (9 files) | 6,764 KB | — |
| → bundled chunk `CJI6pPTw.js` | 5,804 KB | **1,983 KB** |
| `content/` (100 Markdown docs) | 76 KB | — |

That chunk is referenced by **4,185 of 4,185** prerendered HTML files as
`<link rel="prefetch">`. Every visitor downloads ~2 MB gzipped of alphabet data
in the background, on every page, for content only the letter-article route
renders.

It is 9× the gzipped dictionary search payload, and unlike that payload it is
not conditional on anything.

### `content/` is not a size problem

100 files, 76 KB total. Nuxt Content processes them in 229 ms. There is nothing
here to optimize.

---

## 2. Dictionary JSON: yes, reduce it — but the format is not the lever

The 10.4 MB is worth shrinking, but restructuring the JSON shape buys little.
The composition says where the weight is:

| Slice | Size | Verdict |
|---|---:|---|
| `names` map in `dictionary/search.json` | 1,031 KB (41% of that file) | Offline-only; see below |
| `index.json` → `ids` (10,803 entity ids) | 167 KB raw / ~10 KB gz | **Removable** — the DB can serve it |
| `index.json` → `progress` | 37 KB | Keep |
| `index.json` → `counts` | 9 KB | Keep |

### 2a. Drop `ids` from `index.json` (clean win, small)

`index.ids` exists only for `topicIds()` — bulk check-all/reset. `fetchCounts`
already queries `units` for the same topics, so the ids can come from the same
place. Saves 167 KB raw / ~10 KB gz on the one payload every page loads.

Small, but it is the only reduction that touches the happy path.

### 2b. Ship English only in the fallback (big win, but a behaviour change)

Filtering the library payloads to `lang === 'en'`:

```
all-locale payloads   9.44 MB
english-only          1.11 MB   (−88%)
```

**Caveat, and it is a real one.** The fallback currently filters to the
*requested* locale, so a Romanian user offline sees Romanian. Shipping English
only would show them English. That matches what the plan documents ("bundled
English payloads — the English fallback the site ships") but it is a behaviour
change, not a free win. Decide it deliberately.

### 2c. What I would not do

Do not restructure the payload shape (`{ i, t:{lang:term}, p:{lang:ipa} }` as in
§2.4 of the plan) as a size measure. It is a good shape for other reasons, but
the payloads are offline-only — the size saving lands on a path almost nobody
takes, while the change touches every reader.

---

## 3. YAML for articles: no

### The cost being optimized is 76 KB

There is no performance case. The question is purely about authoring ergonomics,
and there Markdown wins for prose.

### Markdown is the correct format for prose

Articles are prose with headings, emphasis, lists and links. YAML forces one of
two bad outcomes:

- **Markdown embedded in YAML strings** — no editor support, escaping pain, and
  you still parse Markdown at the end. Worst of both.
- **A block schema that reimplements Markdown** — headings, paragraphs, emphasis,
  lists, links, all hand-rolled and worse than the real thing.

### It would mean rebuilding the pipeline you already have

The reading view depends on Nuxt Content's minimark body nodes and one
pagination rule:

```ts
// [doc].vue — a document with h2/h3 starts a new page at each heading;
// one with no headings paginates one paragraph per page (stories).
function paginate(nodes: unknown[]): unknown[][] { … }
```

That is `queryCollection('articles')` plus a 30-line function. YAML means
writing and maintaining the equivalent yourself, for 76 KB.

### YAML has real footguns for this content

Nine languages of prose plus IPA containing `/`, `[`, `]`, `:`, `#`:

- the Norway problem — unquoted `no` becomes `false`
- `on`/`off`/`yes`/`no` as bare scalars
- `1.0` silently becoming a float
- block scalars (`|`, `>`) are indentation-sensitive, so prose diffs get noisier,
  not cleaner

Markdown prose diffs read naturally. YAML block-scalar diffs do not.

### The plan already decided this

§2.2 of `planning/performance-and-content-refactor.md`:

> **Prose articles** — Markdown, as now: `content/<track>/<TOPIC>/<ID>/<locale>.md`

Changing a documented decision needs a measured reason. There isn't one here.

### The real duplication is the front matter, not the format

Each doc carries ~14 lines of front matter, most of it derivable from the path:

```yaml
track: dictionary
topic: CH01T01
article: W001
locale: en
entity_id: 'CH01T01:W001'
terms:
  en: hello
```

`track`, `topic`, `article`, `locale` and `entity_id` all follow from the file
path. That is the thing worth removing — and it can be removed while staying in
Markdown. §2.2 already says so: "Front matter shrinks to `title, summary,
status, sourceSha, order, related, video, image`".

---

## 4. What I would actually do, in order

| # | Change | Saves | Risk |
|---|---|---:|---|
| 1 | Load alphabet data per language on demand instead of statically importing all 9 | **~1.9 MB gz on every page** | Low |
| 2 | Drop `ids` from `index.json`; serve from `units` | 10 KB gz on every page | Low |
| 3 | Ship English-only fallback payloads | 8.3 MB of deployed assets | Medium — offline degrades to English |
| 4 | Shrink article front matter to the derivable minimum | 76 KB → ~40 KB | Low |

**#1 is the only one that matters to a real visitor.** `usePhonetic` statically
imports all nine alphabet files, and the article page is the only consumer, so
the whole 5.8 MB lands in a chunk that every page prefetches. Making the import
dynamic per `target` — or moving the files to `public/data/alphabets/<lang>.json`
and fetching them on the article route — removes ~2 MB gzipped from every page
load.

That is roughly 9× the entire gzipped dictionary search payload, on the path
every user takes.

---

## 5. What would change my mind

**On YAML:** if articles were going to be *generated* rather than authored — if
Gemini wrote them and no human edited prose — then a structured format would be
right, because there is no prose-editing ergonomics to protect. That is not the
current situation: the docs are hand-reviewed (`status: draft`, "Draft — review
pending" in the UI).

**On payload restructuring:** if the database were removed and the payloads
became the primary read path again. Then their size would be the happy path, and
the §2.4 shape would be worth the migration. Today they are a fallback.

---

## 6. The thing that is actually blocking

Both questions are about optimizing a fallback while the primary path is
incomplete:

- `units.order` is `0` for every row in Supabase, so the page query's
  `ORDER BY "order"` is a total tie. The client-side sort added in `38e8cf2f`
  masks it; the database still needs `node scripts/seed-import.mjs`.
- `articles` has no rows for `LT01T01` (letters), because phonetic articles are
  not Markdown and the exporter only reads `content/`. The client resolves them
  from the sidebar instead (`01c3654e`), but the table is incomplete.

Neither can be fixed without `SUPABASE_SECRET_KEY`, which is not in `.env` or the
environment. That is the highest-value next step, ahead of any payload work.
