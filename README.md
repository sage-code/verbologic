# Verbologic (`verbologic.com`)

An enterprise-grade, high-performance platform for foreign language learning. Built on a decoupled $O(N)$ architecture featuring static site generation (SSG) with interactive client-side Vue islands, edge asset delivery, and an agentic dual-LLM development workflow.

---

## 🏗️ Core Architecture Overview

* **Frontend Framework:** Nuxt 3 / Vue 3 (SSG + Interactive Hydration)
* **Hosting & CDN:** Cloudflare Workers Static Assets (`verbologic.com`, `www.verbologic.com`)
* **Media & Assets:** Cloudflare R2 (`media.verbologic.com`) via S3 API
* **Search Engine:** Orama / Fuse.js (Client-side JSON index parsing)
* **Database & Auth:** Supabase PostgreSQL (RLS, User Preferences, Gamification State)
* **Agentic Engine:** DeepSeek (Architect/Planner) + GLM (Execution/Coder)

---

## 📁 Repository Directory Structure

```text
verbologic/
├── agents/                   # Dual-LLM agent orchestrations & system prompts
│   ├── deepseek/             # System specs, architectural planners, and task breakdown configs
│   │   ├── system_prompt.md  # DeepSeek architect persona & constraints
│   │   └── planner.json      # Structured layout for task decomposition
│   └── glm/                  # Code generation, translation, and component synthesis configs
│       ├── system_prompt.md  # GLM execution persona & coding standards
│       └── pipelines/        # Scripts for batch operations (JSON, Vue, SQL)
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