# Tech Stack & Code Style

## Framework & Language

- **Framework:** Nuxt 3 (SSG mode via `nuxi generate`), Vue 3 Composition API.
- **Language:** Strict TypeScript (`<script setup lang="ts">`), no `any` types.
- **Component Pattern:** Vue Single-File Components (SFCs) with `<script setup>`, `<template>`, and `<style scoped>`.

## Styling

- **Primary:** Tailwind CSS utility classes inline inside Vue templates.
- **Allowed:** The codebase contains existing custom global stylesheets:
  - `src/assets/css/layout.css` — layout utilities.
  - `src/assets/css/themes.css` — theme and dark-mode definitions.
  - These are already in use; do not remove them.
- **New styles:** Prefer Tailwind first. Add custom CSS to `themes.css` or `layout.css` only if Tailwind cannot express the requirement.
- **No Bootstrap:** Never install or use Bootstrap.

## State Management & Backend

- **State:** Pinia stores (`src/stores/`) for client-side reactive state.
- **Database & Auth:** Supabase JS SDK for PostgreSQL data calls and user authentication.
- **API:** REST endpoints via Supabase; no custom backend server (serverless via Cloudflare Workers).

## $O(N)$ Architecture & Data

- **Content Structure:**
  - Canonical entity records in `public/data/entities/` (JSON files).
  - Translation dictionaries in `public/data/locales/[lang].json`.
  - Indices and metadata in `public/data/` to enable static site generation.

- **Zero Binary Files in Git:**
  - Never commit `.mp3`, `.mp4`, or high-res `.webp` files to the repository.
  - Reference all media assets using Cloudflare R2 CDN URLs:
    ```
    https://media.verbologic.com/[type]/[filename]
    ```
  - Example: `https://media.verbologic.com/audio/lecture-intro.mp3`

- **Vue Islands:** Interactive Vue components in `src/components/` are self-contained and hydrate client-side.
  - Examples: `<ExpressionSearch />`, `<QuizEngine />`, `<InteractiveTable />`.

## Code Generation

- When editing or creating files, generate **full production-ready code** without omissions.
- Never leave `// TODO`, `// FIXME`, or placeholder comments.
- Include error handling, type safety, and edge-case coverage.
