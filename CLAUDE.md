# Verbologic

Nuxt 3 / Vue 3 language-learning platform. SSG + client-side Vue islands, deployed on Cloudflare Workers Static Assets; media on R2; auth/db on Supabase.

## Commands

- `npm run dev` — dev server
- `npm run generate` — static build to `.output/public`
- `npm run preview` — serve built site (port 4173)
- `node scripts/validate-data.mjs` — validate data indices
- `node scripts/media-index.mjs` — rebuild media index

## Conventions

- Keep architecture $O(N)$: static JSON indices in `public/data/`, no server-side rendering of content.
- Interactive features = Vue islands (`src/components/`); state in Pinia stores (`src/stores/`).
- Deep design docs live in `manual/` (architecture, maintenance, page-design, todo). **Do not read them unless the task requires it** — they're large. Start from code.

## Deployment

Cloudflare Workers (`wrangler.toml`), custom domains verbologic.com / www. Media served from R2 via media.verbologic.com.
