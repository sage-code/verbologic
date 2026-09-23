# Gallery — the content repository (files + their manifests)

`gallery/` mirrors the R2 bucket (`media.verbologic.com`): it holds the media
**files** (local staging, never committed) and, next to each file, **its own
manifest** — the Git-tracked JSON describing that one file.

The **structure** (what the user navigates) does NOT live here — it lives in
`src/data/sidebars/**/sidebar.json` (build-inlined). The **location** of the
files on the CDN is configured in `src/data/gallery.config.json`.

## 1. The three layers

| Layer | Where | Job |
| --- | --- | --- |
| Sidebar | `src/data/sidebars/library/{dictionary,lectures,stories}/sidebar.json` | sections → topics → **item ids** + localized section names (no item text); the topic organization lives here |
| Topic map | `src/data/sidebars/library/dictionary/topic-map.json` | archive page#section → topic code (how the legacy archive content maps into topics) + planned sources for the blank topics |
| Repository | `gallery/<sectionPath>/<lang>/<TOPIC>/<file>` + sibling `<file>.json` | the media files + per-file manifests (item text: term/names/ipa/kind + facts: file/key/mime/bytes/sha1/status) |
| Location config | `src/data/gallery.config.json` | R2 `root` + one path per sidebar section; media URL = `root + manifest.key` |

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
- **Ids are append-only and never renamed** (`word_salut`, `letter_a`): they are
  the R2 filenames AND the `learned_items.entity_id` progress keys.
- **Shared keys**: two dedup ids may reference one file
  (`letter_cat`/`letter_cat-2`, `word_coleg`/`word_coleg-2`) — one manifest
  each, same `key`.
- **Pending items** (no media yet): `status: "pending"` with
  `file/key/bytes/sha1: null` — `gallery-index` emits `media.url: null` and the
  UI renders a disabled "audio coming soon" button. Fill the four fields when
  the file lands (or re-run `scripts/gallery-manifests.mjs`).

## 3. Build

`scripts/gallery-index.mjs` (`run gallery index`; also runs before every
build) joins the three layers into the runtime payloads:

```text
public/data/gallery/index.json                       counts[section][topic][lang] + progress
public/data/gallery/library/dictionary/<TOPIC>.json  records for one topic (lazy, one fetch)
```

Sidebars item ids resolve to records via their manifest, or — fallback — via
the legacy bridge (`public/data/entities/*.json`, which also powers the global
search). Every dictionary item has a manifest, so the dictionary is fully
manifest-backed (`source: 'gallery'`); the bridge only covers as-yet
manifest-less ids in other sections.

## 4. Commands

```bash
.venv/Scripts/python.exe scripts/scaffold-gallery.py --dry-run  # preview the folder skeleton
node scripts/archive-topics.mjs [--apply-sidebar]               # topic attribution + topic map (+ sidebar rewrite)
node scripts/gallery-manifests.mjs [--dry-run]                  # re-folder media + write the sibling manifests
node scripts/gallery-index.mjs --dry-run                        # preview the build plan
run gallery index                                               # build runtime payloads
run scaffold <lang> <TOPIC> <seed.json>                         # seed a blank topic with pending manifests
run media [stage|manifest|verify|upload|prune]                  # differential R2 sync (gallery-driven)
run validate                                                    # integrity checks
```
