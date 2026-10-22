# Media — the content repository (files + their manifests)

`media/` mirrors the R2 bucket (`media.verbologic.com`): it holds the media
**files** (local staging, never committed) and, next to each file, **its own
manifest** — the Git-tracked JSON describing that one file.

The **structure** (what the user navigates) does NOT live here — it lives in
`src/data/sidebars/**/sidebar.json` (build-inlined). The **location** of the
files on the CDN is configured in `src/data/media.config.json`.

## 1. The three layers

| Layer | Where | Job |
| --- | --- | --- |
| Sidebar | `src/data/sidebars/library/{dictionary,lectures,stories}/sidebar.json` | sections → topics → **item ids** + localized section names (no item text); the topic organization lives here |
| Topic map | `src/data/sidebars/library/dictionary/topic-map.json` | archive page#section → topic code (how the legacy archive content maps into topics) + planned sources for the blank topics |
| Repository | `media/<sectionPath>/<lang>/<TOPIC>/<file>` + sibling `<file>.json` | the media files + per-file manifests (item text: term/names/ipa/kind + facts: file/key/mime/bytes/sha1/status) |
| Shared dictionary/lecture articles | `content/<track>/<TOPIC>/<ID>/<locale>.md` | one statically rendered article per concept and explanation language |
| Location config | `src/data/media.config.json` | R2 `root` + one path per sidebar section; media URL = `root + manifest.key` |

Dictionary manifests remain the source of truth for target-language `term`,
localized `names`, IPA, and audio. Dictionary prose is authored once per entry
and explanation locale, independent of the language being learned:

```text
content/dictionary/C1T01/A034/en.md
content/dictionary/C1T01/A034/ro.md
content/dictionary/C1T01/A034/de.md
```

Use the same topic-scoped content code and topic for every translation. Front matter
matches the file path (`track: dictionary`, `topic`, `article`, `locale`) and
includes a localized `title`; English is the canonical source and translated
docs can use `sourceSha` to record which canonical revision they follow.
`run media index` joins locale/review metadata to every language-specific
manifest variant. The article route is prerendered for each registered
dictionary language, but prose is stored only once; the selected target
language determines which per-language audio record is used.
If an article-backed concept is missing a target-language manifest, preview
the gaps with `node scripts/media-expand-shared-variants.mjs` and create
pending per-language variants with `--apply`. Add or generate a separate
recording for each language through the normal audio workflow.

## 2. Manifest — one per media file (sibling JSON)

```json
{
  "id": "A034",
  "entity_id": "C1T01:A034",
  "legacy_entity_id": "word_salut",
  "lang": "ro",                       // one of the 9 UI locales
  "kind": "word",                     // row-badge class (word/sentence/question/imperative/greeting/letter)
  "term": "salut",                    // item text — the manifest owns it
  "names": {
    "en": "hello", "ro": "salut", "de": "Hallo", "ru": "Привет",
    "it": "ciao", "es": "hola", "fr": "salut", "hu": "Szia", "pt": "olá"
  },
  "ipa": null,
  "file": "A034.mp3",
  "key": "audio/ro/C1T01/A034.mp3",    // path under the config root (per-topic folder)
  "mime": "audio/mpeg",
  "bytes": 11264,
  "sha1": "9d8a…",                    // real file hash (differential R2 sync)
  "status": "published",
  "tags": ["vocabulary#greetings-courtesy"]  // provenance: archive page#section
}
```

- **Two recordings per item and language.** Every item manifest may carry two
  per-locale descriptor maps, each with its own file, key, bytes, sha1 and
  status:

  | Map | Folder | Content |
  | --- | --- | --- |
  | `audio` | `sound/<locale>.mp3` | the short recording — the word, term, or the story/chapter/topic **title** |
  | `read` | `read/<locale>.mp3` | the **full article read**, synthesized from `content/<track>/<TOPIC>/<ID>/<locale>.md` |

  `read` exists only for items that have a `/content` article, and each
  language gets its own recording. The article page shows a Read control above
  the prose (and above each story panel) that plays that language's `read`
  file; a pending recording renders the disabled "audio coming soon" state.
  Generate them with
  `.venv/Scripts/python.exe scripts/generate-audio.py --read --track stories --apply`
  (add `--lang`, `--chapter`, `--topic`, `--id`, or `--kind` to narrow the run).

- **Content codes** are short topic-scoped codes (`A023`, `V004`, …). The
  same code identifies a concept in every target language; each language has
  its own manifest and audio file/key. Runtime `entity_id` is
  `<TOPIC>:<CODE>` (for example, `C1T01:A031`); the old semantic progress key
  is retained as `legacy_entity_id` and resolved through the generated index.
- **Layout**: audio is partitioned per language **and topic** —
  `audio/<locale>/<TOPIC>/<file>`; the R2 key mirrors the local path. The
  media filename can differ from the shared content code.
  Image/video stay flat (`image/<file>`, `video/<file>`).
- **Lectures** use the same reversible audio manifest pattern as dictionary
  entries: `audio/<lang>/<TOPIC>/<physical-file>.mp3` + sibling JSON. Every
  language variant has the same topic-scoped `id`, stable `entity_id`, and
  complete `names` map, with its own `term`, `ipa`, audio file and R2 key.
  Shared prose is stored once per explanation locale at
  `content/lectures/<TOPIC>/<ID>/<locale>.md`; the `terms` map and
  `:target-term` select the target-language example. Missing audio remains
  pending. See `manual/MAINTENANCE.md` §3.4.
- **Content IDs are codes**, not semantic slugs; `entity_id` is the
  language-independent `<TOPIC>:<CODE>` progress key. Use
  `node scripts/media-reid-manifests.mjs` to preview the one-time migration;
  `--apply` updates manifests, sidebar references, and article paths while
  leaving media files and R2 keys untouched.
- **Shared keys**: two distinct content codes may reference one audio file
  (for example, the same recording can back a word and a letter example) —
  each code has its own manifest and stable `entity_id`, while the `key` may
  match.
- **Pending items** (no media yet): `status: "pending"` with
  `file/key/bytes/sha1: null` — `media-index` emits `media.url: null` and the
  UI renders a disabled "audio coming soon" button. When the file lands, drop
  the file named by the manifest's `file` field into the topic folder and
  `run media manifest` (reconciles + promotes it), then
  `run media upload --apply`.

## 3. Build

`scripts/media-index.mjs` (`run media index`; also runs before every
build) joins the three layers into the runtime payloads:

```text
public/data/media/index.json                       counts[section][topic][lang] + progress
public/data/media/library/dictionary/<TOPIC>.json  records for one topic (lazy, one fetch)
public/data/media/<section>/search.json            every section record in one payload — the
                                                   dictionary-wide translation search (lazy, one fetch)
```

Sidebars item ids resolve to records via their manifest, or — fallback — via
the legacy bridge (`public/data/entities/*.json`, which also powers the global
search). Every dictionary item has a manifest, so the dictionary is fully
manifest-backed (`source: 'media'`); the bridge only covers as-yet
manifest-less ids in other sections.

## 4. Commands

```bash
.venv/Scripts/python.exe scripts/scaffold-media.py --dry-run  # preview the folder skeleton
node scripts/archive-topics.mjs                                 # topic attribution + topic map (report only)
node scripts/media-manifests.mjs [--dry-run]                  # re-folder media + write the sibling manifests
node scripts/media-expand-shared-variants.mjs [--apply]       # preview/create missing shared-article variants
node scripts/lecture.mjs new <TOPIC> <ID>                      # scaffold a shared English lecture
node scripts/lecture.mjs translate <TOPIC> <ID> --lang <locale> # scaffold a translation draft
node scripts/lecture.mjs status                                # show review/stale-translation status
node scripts/media-index.mjs --dry-run                        # preview the build plan
run media index                                               # build runtime payloads
run scaffold <lang> <TOPIC> <seed.json>                         # seed a blank topic with pending manifests
run media stage                     # archive mp3s → media per-topic layout
run media manifest [--dry-run]      # reconcile manifests with the files on disk (the differential baseline)
run media verify                    # missing / orphan / dirty / pending report
run media upload [--apply]          # differential R2 sync (Cloudflare API; default reports the delta)
run media prune [--apply]           # R2 objects no manifest references (default reports; --apply deletes)
run validate                        # integrity checks
```

The reversible lecture examples are `content/lectures/L3T01/A021/` through
`A023/`; each has an explanation in all nine locales and one pending,
language-specific audio manifest per target language. See `manual/MAINTENANCE.md`
§3.4 for the authoring and review workflow.

For a new lecture, first create one seed manifest with its coded `id`, matching
`entity_id`, target-language `term`, and complete nine-language `names` map.
Then run `node scripts/lecture.mjs new <TOPIC> <ID>` and
`node scripts/media-expand-shared-variants.mjs --apply`; the latter creates
pending manifests for the remaining languages.
