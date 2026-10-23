# Alphabet & Letter-Group Architecture — Redesign Plan

Status: **proposal, awaiting approval**. No code changes until this is agreed.

Scope: how phonetic content (alphabets, letter groups, phonics clusters) is
modelled, authored, generated and served — plus the locale-list duplication
that makes every one of those steps fragile.

---

## 1. What is actually wrong

The current attempt treats a **per-language alphabet** as if it were
**reversible shared content**. Those are opposite things, and forcing them into
one shape produced three concrete failures.

### 1.1 Measured evidence

| Fact | Value |
|---|---|
| Phonetic topics in `LT01` | 11 (`T01`, `T02`, `T07`–`T15`) |
| Items across those topics | 363 |
| Audio files generated on disk | 2 208 |
| Audio records that survive the `langs` filter | 317 |
| **Generated then thrown away** | **1 891 (86 %)** |
| Hardcoded locale lists in the repo | 12 |
| `mp3` files currently in `media/lectures/LT01` | 2 280 (22.8 MB) |

The 86 % figure is the headline. `scripts/generate-audio.py` loops over all
nine locales for every manifest, but `scripts/media-index.mjs` then drops every
record whose language is not in `topic.langs`. For `LT01T09` (German alphabet,
`langs: ["de"]`) it synthesises nine voices and publishes one.

### 1.2 The three failures

**Failure A — audio is keyed by the wrong axis.**
A German alphabet letter has exactly **one** correct pronunciation: German.
The UI locale does not change it. Yet the manifest carries
`audio: { en, ro, de, ru, it, es, fr, hu, pt }` — nine files, eight of them
an English/Romanian/… voice reading the letter "A". That is not a translation,
it is noise, and it is 86 % of the work.

**Failure B — `names` is keyed by the wrong axis.**
`media/lectures/LT01/LT01T09/L342/item.json` has
`names: { en: "A", ro: "A", de: "A", … }`. The letter A is "A" in all nine
languages. The nine-entry map carries zero information. What genuinely varies
per UI locale is the **explanation** (`description`), which is already a
nine-entry map and is legitimately correct.

**Failure C — one topic per language does not scale.**
`LT01T01`…`LT01T15` encode "which language owns this alphabet" in the *topic
code*. Adding a tenth language means a sixteenth topic, a new sidebar entry, a
new `langs` array, a new `TRACKS` row, and a new branch in every script. The
topic code should identify **what is taught**, not **who it is taught to**.

### 1.3 The duplication that makes it worse

Twelve independent copies of the same nine-language list:

| File | Symbol |
|---|---|
| `content.config.ts` | `LOCALES`, `TRACK_LANGS` |
| `src/types/dictionaryArticle.ts` | `LOCALES` |
| `src/stores/roadmapStore.ts` | `LOCALES` |
| `src/data/tracks.ts` | `TRACKS` keys |
| `src/data/navigation.json` | `languages[]` |
| `src/data/language-names.json` | matrix keys |
| `scripts/generate-audio.py` | `LOCALES` |
| `scripts/generate-ipa.py` | `LOCALES` |
| `scripts/lecture.mjs` | `LOCALES` |
| `scripts/media-index.mjs` | `LOCALES_ALL` |
| `scripts/media-scaffold-topic.mjs` | `LOCALES` |
| `scripts/media-sync.mjs` | `LOCALES` |
| `scripts/validate-data.mjs` | `LOCALES` |

Adding a language today is a thirteen-file edit with no compiler help across
the Python/Node boundary. This is the "duplicate locales" you spotted — it is
not duplicate *keys* inside one file (I checked: there are none), it is the
same list re-declared thirteen times.

---

## 2. The distinction the model is missing

Two content kinds, two different shapes. The current design uses one shape for
both, which is why neither fits.

### Kind 1 — Reversible content (dictionary, lectures prose, stories)

The *same* concept exists in every language. "hello" / "salut" / "Hallo" are
one record with nine glosses. Audio is per language because the word is
pronounced differently in each.

```
names{9}          ← the concept in each language      (all 9 meaningful)
description{9}    ← the explanation in each language  (all 9 meaningful)
pronunciation{9}  ← IPA per language                  (all 9 meaningful)
audio{9}          ← one file per language             (all 9 meaningful)
```

**This model is correct and already works.** `media/dictionary/CH01/CH01T01/W001`
is a good example — every one of the nine slots carries real information.

### Kind 2 — Phonetic content (alphabet, letter groups, phonics)

The concept is **owned by one target language**. The German alphabet is not a
translation of the Romanian alphabet; it is a different object. What varies per
UI locale is only how you *explain* it.

```
glyph             ← "A"                               (one value, not nine)
ipa               ← "/aː/"                            (one value, target language)
audio{1}          ← one file, target language only    (one value)
description{9}    ← the explanation in each language  (all 9 meaningful)
example           ← "Apfel"                           (one value)
exampleGloss{9}   ← "apple" / "măr" / …               (all 9 meaningful)
```

The current model gives Kind 2 the Kind 1 shape, so eight of nine `names`
slots and eight of nine `audio` slots are structurally meaningless. The
`langs` filter is a band-aid over that: it hides the waste at read time
instead of preventing it at write time.

---

## 3. Proposed architecture

Four changes, in dependency order.

### 3.1 One locale registry (kills the 13-way duplication)

New file `src/data/locales.json` — the single source of truth:

```json
{
  "default": "en",
  "locales": [
    { "code": "en", "label": "English",  "flag": "🇬🇧", "bcp47": "en-US" },
    { "code": "ro", "label": "Română",   "flag": "🇷🇴", "bcp47": "ro-RO" },
    { "code": "de", "label": "Deutsch",  "flag": "🇩🇪", "bcp47": "de-DE" }
  ]
}
```

Three thin loaders, each ~5 lines, all reading that one file:

- `src/data/locales.ts` — typed export for Vue/TS (`LOCALES`, `Locale`, `DEFAULT_LOCALE`)
- `scripts/lib/locales.mjs` — Node loader
- `scripts/lib/locales.py` — Python loader

Then delete every hardcoded array in the table in §1.3 and import instead.
`content.config.ts` builds its `z.enum` from `LOCALES`; `navigation.json` keeps
only display metadata and drops its own language list; `tracks.ts` derives its
keys from `LOCALES`.

**Payoff:** adding a language becomes a one-file edit, and the Python and Node
pipelines can no longer disagree about what a locale is.

### 3.2 Phonetic content becomes data, not manifests

New folder `src/data/alphabets/<lang>.json`, one file per target language:

```json
{
  "lang": "de",
  "topic": "LT01T01",
  "title": { "en": "German alphabet & letters", "ro": "Alfabetul german", "…": "…" },
  "letters": [
    {
      "glyph": "A",
      "ipa": "/aː/",
      "letterName": "A",
      "example": "Apfel",
      "exampleGloss": { "en": "apple", "ro": "măr", "…": "…" },
      "note": { "en": "Long when stressed and open.", "ro": "Lung când este accentuat.", "…": "…" }
    }
  ]
}
```

This is the authoring surface. It is small (one file per language, ~30 letters),
readable, diffable, and it holds each fact exactly once.

**Why a data file and not 363 manifests:** the manifest is a *derived* artifact.
Authoring it by hand means the glyph, the IPA and the example are typed nine
times per letter. Authoring the data file means they are typed once.

### 3.3 One topic per *subject*, not per language

Replace `LT01T01`…`LT01T15` with a single topic per subject, carrying a
`sourceLang` instead of a `langs` allow-list:

```json
{
  "code": "LT01T01",
  "names": { "en": "Alphabet & letters", "ro": "Alfabet și litere", "…": "…" },
  "layout": "table",
  "phonetic": true,
  "sourceLang": "de",
  "items": ["L001", "L002", "…"]
}
```

`sourceLang` means: *this topic teaches the alphabet of the language you are
currently learning, and its content comes from `src/data/alphabets/<lang>.json`*.

The runtime resolves it per active target language:

- learning `de` → renders the German alphabet from `alphabets/de.json`
- learning `ro` → renders the Romanian alphabet from `alphabets/ro.json`
- learning `xx` with no `alphabets/xx.json` → topic renders disabled ("coming
  soon"), exactly like an unwritten topic does today

This is the property you asked for: **one topic, every language, content
swapped by target language.** No new topic code per language, no `langs`
array, no sixteenth sidebar entry when a tenth language arrives.

`langs` stays in the type for genuinely one-off topics (a page about Romanian
culture that no other language has), but it is no longer the mechanism for
alphabets.

### 3.4 Audio is generated for the target language only

`generate-audio.py` gains one rule: when a topic has `sourceLang`, generate
audio **only** for that language. The manifest then carries a single-entry
`audio` map, and `media-index.mjs` needs no filter because there is nothing to
filter.

Expected effect on the current tree: 2 208 files → ~317. The 1 891 wasted
syntheses disappear, and the run time drops from ~50 minutes to ~7.

---

## 4. Articles: one per letter, without 3 267 files

You asked for one article per letter. The blocker is arithmetic: 363 items ×
9 UI locales = **3 267 Markdown files**, and there is no translation tool that
produces them (`lecture.mjs translate` only copies the English body and stamps
`sourceSha` — it does not translate).

The resolution is that a letter article is **not prose**. It is a fixed
template over structured facts:

```
# {glyph} — {ipa}

{description}

**Name** {letterName}   **Example** {example} ({exampleGloss})

{note}
```

So the article is **rendered from `alphabets/<lang>.json`**, not authored per
locale. One template, nine locale variants of ~8 fixed strings (headings and
labels), and the per-letter facts come from the data file.

That yields one article per letter per target language — 363 articles — each
available in all nine UI locales, from **9 data files + 1 template set**
instead of 3 267 Markdown files.

Two implementation options, both compatible with the existing article route:

- **Option A (recommended) — render at build time.** A generator emits
  `content/lectures/<TOPIC>/<CODE>/<locale>.md` from the data file. The
  existing Nuxt Content pipeline, `sourceSha` review tooling and prerendering
  all keep working unchanged. The `.md` files become build artifacts.
- **Option B — render at runtime.** The article route detects a phonetic topic
  and renders the template directly from the data file, skipping Markdown
  entirely. Fewer files, but it forks the article pipeline and loses the
  review tooling.

Option A keeps one pipeline. Recommend A.

---

## 5. Migration

The 2 280 mp3s and 363 manifests already on disk are **not wasted work** — the
audio is correct, it is just filed under nine keys where one is needed.

| Step | Action | Risk |
|---|---|---|
| 1 | Add `src/data/locales.json` + three loaders; replace the 13 hardcoded lists | Low — mechanical, compiler-checked on the TS side |
| 2 | Write `src/data/alphabets/<lang>.json` for all 9 languages, seeded from the existing manifests (glyph, IPA, example are already there) | Low — data extraction, no new facts invented |
| 3 | Collapse `LT01T01`…`LT01T15` into one topic per subject with `sourceLang` | Medium — sidebar rewrite, but `validate-data` catches breakage |
| 4 | Teach `generate-audio.py` to honour `sourceLang`; re-key existing audio to the single target-language slot | Low — files are already on disk, only the descriptor key changes |
| 5 | Add the article template + generator (Option A) | Medium — new script, but additive |
| 6 | Delete `scripts/tmp-build-alphabets.mjs` | None — temporary scaffolding |

**Nothing needs to be regenerated.** Step 4 re-keys descriptors to point at
files that already exist. The 1 891 surplus mp3s can be deleted afterwards
(they are gitignored build output, not tracked content).

### What happens to the current uncommitted work

Everything in the working tree is uncommitted. Two choices:

- **Keep and migrate** (recommended) — the audio and the letter data are sound;
  only the *shape* changes. Steps 2 and 4 reuse them.
- **Discard and rebuild** — cleaner tree, but throws away ~50 minutes of
  synthesis and the hand-checked IPA.

Recommend keeping. The IPA in particular was hand-transcribed and is the
expensive part.

---

## 6. Decisions I need from you

1. **Topic granularity** — one `LT01T01` "Alphabet & letters" per subject with
   `sourceLang` (§3.3), or keep separate topics but drop `langs` in favour of
   `sourceLang`? The first is cleaner; the second is a smaller diff.
**answer** Ok sourceLang

2. **Article rendering** — Option A (generate `.md` at build time, keep one
   pipeline) or Option B (render from data at runtime, fork the pipeline)?
   Recommend A.
**answer** Agree with A

3. **Letter groups** — `LT01T02` (Romanian groups) and `LT01T08` (English
   phonics) are the same *kind* of content as alphabets. Fold them into the
   same `alphabets/<lang>.json` file as a second array (`groups[]`), or keep a
   parallel `groups/<lang>.json`? Recommend one file per language with both
   arrays — they share the same shape and are always read together.
**answer** parallel groups wil lang.json files will be smaller
4. **The 1 891 surplus mp3s** — delete now, or leave until step 4 is verified?
**answer** delete if can't be reused
---

## 7. What this does not change

- The reversible model for dictionary / lectures prose / stories — it is
  correct and stays as is.
- The `phonetic: true` table behaviour (IPA replaces the translation column) —
  correct, stays.
- The article route, prerendering and `sourceSha` review tooling.
- The R2 layout and `media-index.mjs` output shape.

The change is confined to: how locales are declared, how phonetic content is
authored, how a phonetic topic is scoped, and which languages get audio.
