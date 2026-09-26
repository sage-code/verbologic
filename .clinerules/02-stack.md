# Tech Stack & Code Style

**Framework:** Nuxt 3 (SSG), Vue 3 Composition API, strict TypeScript (`<script setup lang="ts">`), no `any`.

**Styling:** Tailwind CSS inline. Custom CSS already in `src/assets/css/layout.css` and `themes.css` — use Tailwind first; add custom CSS only if necessary.

**State & Backend:** Pinia stores (`src/stores/`), Supabase for auth/data, no custom backend.

**$O(N)$ architecture:** Static JSON in `public/data/entities/` and `public/data/locales/[lang].json`. Interactive Vue islands in `src/components/`. Zero binary files in git — all media via R2 CDN: `https://media.verbologic.com/[type]/[filename]`

**Code generation:** Full production-ready code, no `// TODO` or `// FIXME`, include error handling and type safety.
