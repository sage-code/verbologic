# Verbologic (`verbologic.com`)

An enterprise-grade, high-performance platform for foreign language learning. Built on a decoupled $O(N)$ architecture featuring static site generation (SSG) with interactive client-side Vue islands, and edge asset delivery.

---

## 🏗️ Core Architecture Overview

* **Frontend Framework:** Nuxt 3 / Vue 3 (SSG + Interactive Hydration)
* **Hosting & CDN:** Cloudflare Workers Static Assets (`verbologic.com`, `www.verbologic.com`)
* **Media & Assets:** Cloudflare R2 (`media.verbologic.com`) via S3 API
* **Search Engine:** Orama / Fuse.js (Client-side JSON index parsing)
* **Database & Auth:** Supabase PostgreSQL (RLS, User Preferences, Gamification State)
* **AI Tooling:** Cline + Claude Code (Plan/Act mode), with Supabase and Cloudflare skills/MCP

---

## 📁 Repository Directory Structure

```text
verbologic/
├── manual/                   # Comprehensive architecture & system design docs
│   ├── ARCHITECTURE.md       # High-level system topology, O(N) scaling model, media CDN
│   ├── DATA_SCHEMA.md        # Supabase Postgres schema, RLS policies, JSON index specs
│   └── UI_COMPONENTS.md      # Vue island specifications and design system rules
├── content/                  # MD/MDX files for lessons, comics, and expressions
├── public/
│   └── data/                 # Decoupled locale JSON indices (ro.json, es.json, en.json)
├── src/
│   ├── components/           # Vue interactive components (ExpressionSearch, QuizEngine)
│   ├── stores/               # Pinia stores (syncing local state to Supabase)
│   └── lib/                  # Search client and Supabase clients
├── wrangler.toml             # Workers Static Assets + custom domain routes
└── README.md