# Verbologic

Nuxt 3 / Vue 3 language-learning platform. SSG + client-side Vue islands, deployed on Cloudflare Workers Static Assets; media on R2; auth/db on Supabase.

## Commands

Primary interface is the project runner — `./run help` lists everything (build, validate, media pipeline, deploy, git commit/push with push throttling). Prefer `run <cmd>` over calling the wrapped npm/node scripts directly; it adds fingerprint gating, throttling and sequencing that calling scripts raw skips.

- `npm run dev` — dev server (the one command used directly, not wrapped by `run`)
- `run build [--force]` — differential static build to `.output/public` (skips rebuild when unchanged)
- `npm run preview` — serve built site (port 4173, requires Python)
- `run validate` — validate data indices (`scripts/validate-data.mjs`)
- `run media index|stage|manifest|verify|upload|prune` — media pipeline (see `scripts/media-*.mjs`, `manual/MAINTENANCE.md`)
- `run missing` / `run scaffold <lang> <TOPIC> <seed.json>` — missing-content inventory and topic seeding
- `run lecture <new|status|translate|review>` — lecture content tooling (`content/lectures/`)
- `run deploy` / `run deploy-dry` — Wrangler deploy / dry-run validation
- `run status` / `run commit "<msg>"` / `run push [--force]` / `run release "<msg>"` — git + release flow (push throttled to 1/2h)
- `run tsc` — type-check (`vue-tsc`)
- `run clean` / `run clean-deep` — remove build junk (`clean-deep` also clears `.nuxt`)

One-off scripts not wrapped by `run` (invoke directly with `node`/`python` when needed):

- `node scripts/extract-legacy.mjs` — Phase 2 legacy extraction: parses archived roadmap HTML into `public/data/entities/*.json` + locale files
- `node scripts/archive-topics.mjs` — attributes legacy archive content to Dictionary topics, emits `topic-map.json` (never writes sidebars)
- `python scripts/generate-logos.py` — regenerates header logo PNGs/favicons from `src/assets/img/earth-logo.jpg`
- `python scripts/scaffold-media.py [--dry-run]` — scaffolds the `media/` repository's binary folder skeleton

## Conventions

- Keep architecture $O(N)$: static JSON indices in `public/data/`, no server-side rendering of content.
- Interactive features = Vue islands (`src/components/`); state in Pinia stores (`src/stores/`).
- Lectures content follows `manual/curriculum.md` (teaching order, `L<n>T<nn>` codes, article-then-tables lessons, how to write an article). Read it before adding or moving lecture content.
- Deep design docs live in `manual/` (architecture, maintenance, page-design, todo). **Do not read them unless the task requires it** — they're large. Start from code.

## Deployment

Cloudflare Workers (`wrangler.toml`), custom domains verbologic.com / www. Media served from R2 via media.verbologic.com.
