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
| Location config | `src/data/media.config.json` | R2 `root` + one path per sidebar section; media URL = `root + manifest.key` |

## 2. Manifest — one per media file (sibling JSON)

```json
{
  "id": "word_salut",
  "lang": "ro",                       // one of the 9 UI locales
  "kind": "word",                     // row-badge class (word/sentence/question/imperative/greeting/letter)
  "term": "salut",                    // item text — the manifest owns it
  "names": { "en": "hello", "ro": "salut" },
  "ipa": null,
  "file": "word_salut.mp3",
  "key": "audio/ro/C1T11/word_salut.mp3",  // path under the config root (per-topic folder)
  "mime": "audio/mpeg",
  "bytes": 11264,
  "sha1": "9d8a…",                    // real file hash (differential R2 sync)
  "status": "published",
  "tags": ["vocabulary#greetings-courtesy"]  // provenance: archive page#section
}
```

- **Layout**: audio is partitioned per language **and topic** —
  `audio/<locale>/<TOPIC>/<ID>.mp3`; the R2 key mirrors the local path.
  Image/video stay flat (`image/<file>`, `video/<file>`).
- **Lectures** are video items under `video/<lang>/<TOPIC>/<ID>.mp4` + a sibling
  manifest (`kind: 'lecture'`, `mime: video/mp4`) carrying a `content` pointer —
  `lectures/<lang>/<TOPIC>/<ID>` — to the Markdown docs in `content/lectures/**`
  (the prose + its translations; see `manual/MAINTENANCE.md` §3.4). Pending until
  the mp4 lands → the UI renders a "video coming soon" card.
- **Ids are append-only and never renamed** (`word_salut`, `letter_a`): they are
  the R2 filenames AND the `learned_items.entity_id` progress keys.
- **Shared keys**: two dedup ids may reference one file
  (`letter_cat`/`letter_cat-2`, `word_coleg`/`word_coleg-2`) — one manifest
  each, same `key`.
- **Pending items** (no media yet): `status: "pending"` with
  `file/key/bytes/sha1: null` — `media-index` emits `media.url: null` and the
  UI renders a disabled "audio coming soon" button. When the file lands, drop
  `<ID>.mp3` into the topic folder and `run media manifest` (reconciles +
  promotes it), then `run media upload --apply`.

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
node scripts/archive-topics.mjs [--apply-sidebar]               # topic attribution + topic map (+ sidebar rewrite)
node scripts/media-manifests.mjs [--dry-run]                  # re-folder media + write the sibling manifests
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
