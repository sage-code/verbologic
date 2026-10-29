# Verbologic

Nuxt 3 / Vue 3 language-learning platform. SSG + client-side Vue islands, deployed on Cloudflare Workers Static Assets; media on R2; auth/db on Supabase.

## Commands

Primary interface is the project runner — `./run.sh help` lists everything (build, validate, media pipeline, deploy, git commit/push with push throttling). Prefer `./run.sh <cmd>` over calling the wrapped npm/node scripts directly; it adds fingerprint gating, throttling and sequencing that calling scripts raw skips.

- `npm run dev` — dev server (the one command used directly, not wrapped by `./run.sh`)
- `./run.sh build [--force]` — differential static build to `.output/public` (skips rebuild when unchanged)
- `npm run preview` — serve built site (port 4173, requires Python)
- `./run.sh validate` — validate data indices (`scripts/validate-data.mjs`)
- `./run.sh media index|stage|manifest|verify|upload|prune` — media pipeline (see `scripts/media-*.mjs`, `manual/MAINTENANCE.md`)
- `./run.sh missing` / `./run.sh scaffold <lang> <TOPIC> <seed.json>` — missing-content inventory and topic seeding
- `./run.sh lecture <new|status|translate|review>` — lecture content tooling (`content/lectures/`)
- `./run.sh create lecture <LT01T0n> [--target xx] [--overwrite] [--preview]` — simple-English lecture articles for a chapter-1 topic. T01/T02 come from `src/data/alphabets/<lang>.json` (`generate-alphabet-content.py` + `alphabet-to-markdown.mjs`); T03–T06 from the hand-written rows in `scripts/seeds/lectures-LT01-<lang>.json` (`create-lecture-articles.py`). The prompt carries the chapter/topic context and a closed word list: an article may quote only the seed's `example` (and optional `extra: [{word, ipa, gloss}]`) as `(word) /ipa/`, so Gemini cannot invent IPA. New lessons = new seed rows first
- `./run.sh create read <chapter|topic|item_id> [--dry-run] [--overwrite-audio]` — read-aloud MP3s of article docs (`generate-audio.py --read`); run after changing article text
- `./run.sh create story <topic-code> [n]` — write `n` (default 1) illustrated stories for a stories topic at the topic's CEFR level (`scripts/create-stories.py`: Gemini text and translations, one picture per reading page, title/read audio; nothing uploaded)
- `./run.sh deploy` / `./run.sh deploy-dry` — Wrangler deploy / dry-run validation
- `./run.sh status` / `./run.sh commit "<msg>"` / `./run.sh push [--force]` / `./run.sh release "<msg>"` — git + release flow (push throttled to 1/2h)
- `./run.sh tsc` — type-check (`vue-tsc`)
- `./run.sh clean` / `./run.sh clean-deep` — remove build junk (`clean-deep` also clears `.nuxt`)

One-off scripts not wrapped by `run` (invoke directly with `node`/`python` when needed):

- `node scripts/archive-topics.mjs` — attributes legacy archive content to Dictionary topics, emits `topic-map.json` (never writes sidebars). Still imported by `media-manifests.mjs`; needs the gitignored `archive/` tree, so it only runs on a machine that has it
- `python scripts/generate-logos.py` — regenerates header logo PNGs/favicons from `src/assets/img/earth-logo.jpg`
- `python scripts/scaffold-media.py [--dry-run]` — scaffolds the `media/` repository's binary folder skeleton
- `.venv/Scripts/python.exe scripts/generate-audio.py [--lang] [--topic] [--id] [--overwrite] [--dry-run]` — Microsoft Edge TTS audio generation for pending media manifests (`manual/MAINTENANCE.md` §3.3)
- `node scripts/seed-titles.mjs <lang> <chapterCode> <ipaMap.json> [--tts overrides.json]` — chapter/topic title-audio manifests (`src/composables/useTitles.ts`)

New dictionary vocabulary: `./run.sh scaffold <lang> <TOPIC> <seed.json>` → `generate-audio.py` → `./run.sh media manifest` → `./run.sh media upload --apply` is the standard pipeline — see `manual/MAINTENANCE.md` §3.3 for the full walkthrough, including the `ipa`/`ttsText` manifest fields.

## File Editing

- Prefer `C:\Users\eluci\sage-code\ed-tool\bin\bee-ed.exe` for file operations: use `apply` for unified diffs, `edit` for unique replacements, `append` for guarded chunks, and `search`, `tail`, and `balance` to inspect or verify. Use `--dry-run` before broad edits and verify each result.
- For files over about 200 lines, write 50–300-line chunks to scratch files and append with `append <file> @<chunk> --new`, then `append <file> @<chunk> --at N` using the prior reported line count. If an append result is uncertain, retry the identical command; use `tail` to recover the actual line count. Run `balance` for Markdown or HTML, then remove scratch files.
- Prefer `@file` for patch or replacement content instead of long inline arguments or shell heredocs. Preserve existing line endings and final newlines.

## Conventions

- Keep architecture $O(N)$: static JSON indices in `public/data/`, no server-side rendering of content.
- Interactive features = Vue islands (`src/components/`); state in Pinia stores (`src/stores/`).
- A chapter is the same for every language; topic names are generic English concepts (no "a fi", no "-esc"). Word/expression content is reversible; letters and grammar articles are `directional`, and each item's manifest sets `target`. Lecture articles are English-only, simple English, with target-language words in `( )` followed by IPA — see `manual/curriculum.md` "One curriculum, every language".
- Lectures content follows `manual/curriculum.md` (teaching order, `L<n>T<nn>` codes, article-then-tables lessons, how to write an article). Read it before adding or moving lecture content.
- Every dictionary manifest (`media/audio/<lang>/<TOPIC>/A0NN.json`) needs a hand-transcribed Romanian `ipa` (Romanian orthography is close enough to phonetic that transcribing by hand beats fighting a G2P library install — `epitran` fails to build natively on Windows here). When Edge TTS mispronounces the plain `term`, add a `ttsText` field: text fed to the TTS engine instead, while `term`/`names`/`ipa` stay the correct displayed spelling. Edge TTS accepts **no SSML beyond `<voice>`/`<prosody>`** — a `<phoneme>` pronunciation override is rejected server-side (`NoAudioReceived`), even for plain ASCII text — so `ttsText` respelling is the only lever.
- Every seed row's `names` object must cover **all 9 site languages** (`src/data/language-names.json`): `en`, `es`, `it`, `fr`, `de`, `ru`, `hu`, `pt`, plus the target language itself (e.g. `ro`, filled in automatically from `term`). `./run.sh scaffold` only copies `term`/`names`/`ipa` from the seed row verbatim — it does not invent missing locales — so write all 8 non-target glosses into the seed JSON up front, not just en/es/it/fr.
- Manifest filenames are sequential per folder (`A001.json`, `A002.json`, …) — this is what `scripts/media-scaffold-topic.mjs` writes and every existing manifest in the repo follows. The semantic id lives in the manifest's `id` field, never the filename; the audio file matches the *manifest's* filename, not the `id`.
- Deep design docs live in `manual/` (architecture, maintenance, page-design, todo). **Do not read them unless the task requires it** — they're large. `MAINTENANCE.md` §3.3 is the one to check for anything media/audio/translation-pipeline related; otherwise start from code.

## Deployment

Cloudflare Workers (`wrangler.toml`), custom domains verbologic.com / www. Media served from R2 via media.verbologic.com.
