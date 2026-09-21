# Verbologic — Maintenance Manual

What a maintainer must know to keep `verbologic.com` healthy: where the content
lives, where the navigation is defined, where the layout comes from, and how to
edit everything **by hand** when no agent is involved.

---

## 1. The big picture

```
┌───────────────────────────  Git repo (slim)  ───────────────────────────┐
│  src/data/navigation.json   ← MENU, languages, social (builder data)    │
│  src/data/language-names.json ← localized language names (builder data) │
│  public/data/entities/*.json      ← CONTENT (generated, then curated)   │
│  public/data/locales/*.json       ← UI strings (generic chrome)         │
│  src/layouts/default.vue    ← LAYOUT shell (header+nav+footer)          │
│  src/components/*.vue       ← Header/Footer/LanguageSwitcher/AppNav     │
│  src/assets/css/layout.css  ← responsive @media rules                   │
│  src/pages/**               ← routes (/, /ro, /en, /lessons, /about)    │
│  scripts/*.mjs              ← maintenance/build/media tooling           │
│  wrangler.toml              ← Workers Static Assets + custom domains    │
│  run                        ← one command to rule them all              │
└─────────────────────────────────────────────────────────────────────────┘
      │ anywhere run <command>
      ▼
  npm run dev / generate  →  .output/public  →  Cloudflare Workers / R2
```

Generated/derived things that you must **never** edit or commit: `.nuxt/`,
`.output/`, `dist/`, `node_modules/`, `media/` (binary staging), `archive/`
(legacy source only), `temp/` (scripts scratch).

---

## 2. Navigation menu — where it is & how to maintain it

**Authoritative file: `src/data/navigation.json`** — imported at build time,
so the menu is baked into the pre-rendered HTML (no runtime fetch).

| What you maintain | Where | Notes |
| --- | --- | --- |
| Menu items + routes + icons | `navigation.json → menu[]` | `id`, `icon` (Heroicon key), `route`, `order` |
| Labels in every language | `navigation.json → menuLabels` | one entry per language per item; EN is fallback |
| Interface languages list | `navigation.json → languages[]` | `code` (shown), `label` (native endonym — fallback only), `flag` (ISO country code), `locale` |
| Localized language names | `src/data/language-names.json` + `useLanguageNames` / `useNavigation.languageName` | one build-inlined matrix: UI locale → target locale → name (9 × 9); imported like `navigation.json` — no runtime fetch |
| Social footer links | `navigation.json → social[]` | `id`, `label`, `url`, `icon` (brand slug) |
| Menu rendering | `src/components/AppNav.vue` | pill buttons; round icon-only on ≤640px |
| Language dropdown | `src/components/LanguageSwitcher.vue` | flag image + code; hidden until opened |
| Flag graphics | `src/components/LanguageFlag.vue` | SVG flags from `flag-icons` (`flag` = ISO code) |
| Social logos | `src/components/SocialIcon.vue` | brand SVGs from `simple-icons` (`icon` = brand slug) |
| Social row | `src/components/AppFooter.vue` | centered, brand-color logos + labels |

### How to add a menu item (manual, ~4 steps)
1. Create the page route, e.g. `src/pages/contact/index.vue`.
2. Add it to `menu[]` in `navigation.json` (correct `order`).
3. Add `"contact": "Contact"` (and translations) under **every** `menuLabels.<lang>`.
4. Pick an icon from `@heroicons/vue/24/outline` and add it to the `ICONS` map
   in `AppNav.vue` (the JSON value must match that key).

### How to change a label
Edit `menuLabels.<lang>.<id>` in `navigation.json`. Rebuild. Done — no component
change needed.

### How to add a new interface language
1. `navigation.json → languages[]`: add `{ "code", "label", "flag", "locale" }` — **plus** register
   the flag SVG import in `src/components/LanguageFlag.vue` (flag-icons ships hundreds of ISO codes).
2. `navigation.json → menuLabels`: add a `<locale>` block covering every item id.
3. `src/data/language-names.json`: add a `<locale>` block naming all 9 target languages in the
   new UI language, **and** add the new language's name to every existing block (9 × 9 matrix —
   `run validate` enforces completeness). The matrix is build-inlined, so a rebuild (`run build`)
   is required after editing it.
4. Optional UI chrome: create `public/data/locales/<locale>.json`; until then the app falls back
   to English chrome automatically. Language display names do **not** depend on locale files —
   they come from the language-names matrix (`useNavigation.languageName`: matrix → `languages.<code>`
   dict key → native endonym → uppercase code).
5. `scripts/validate-data.mjs → KNOWN_FLAGS`: include the new ISO code so `run validate` catches it.

### How to change a footer brand logo
`navigation.json → social[].icon` must match a slug registered in `src/components/SocialIcon.vue`
(from `simple-icons`). Editing labels/URLs is pure JSON; changing the logo itself means wiring a new
`simple-icons` import.
---

## 3. Content — where the source of truth lives

### 3.1 Static entities (the O(N) core)
| File | What | Count |
| --- | --- | --- |
| `public/data/entities/ro_vocabulary.json` | themed vocabulary | 150 |
| `public/data/entities/ro_questions.json` | Q&A drills | 135 |
| `public/data/entities/ro_imperative.json` | imperative phrases | 75 |
| `public/data/entities/ro_sentences.json` | sentence corpus | 30 |
| `public/data/entities/ro_greetings.json` | greeting formulas | 15 |
| `public/data/entities/ro_alphabet.json` | letters + digraphs (contrastive) | 53 |
| `public/data/entities/en_alphabet.json` | EN alphabet + patterns (IPA) | 74 |

**Schema per entity** (language-neutral, zero UI strings):

```jsonc
{
  "id": "word_salut",            // unique; "<type>_<slug>"
  "type": "word",                // word | sentence | question | imperative | letter
  "lang": "ro",                  // ro | en (target language)
  "term": "salut",               // term in the target language
  "ipa": null,                   // IPA only on alphabet entities for now
  "translations": { "en": "hello", "es": "hola", "it": "ciao", "fr": "salut" },
  "context": null,               // usage note (greetings / patterns)
  "audio": "https://media.verbologic.com/audio/ro/word_salut.mp3" // null = TTS queue
}
```

**IMPORTANT — how these files are born.** They are **generated** from the legacy
HTML archive by `scripts/extract-legacy.mjs` (parses the `data-audio` tables).
Do **not** edit them as part of a release; instead:

```bash
node scripts/extract-legacy.mjs   # regenerates all 7 files + locales/chrome
run validate                       # checks ids/audio/labels integrity
run build                          # differential: only rebuilds if hashes changed
```

### 3.2 Locales (generic UI chrome)
`public/data/locales/en.json` and `ro.json` contain `ui` strings (play/search
labels) and, in `ro.json`, `contrastive.*` notes shown under alphabet rows.
Files for other languages (`de`, `ru`, …) are optional; absent files fall back
to English chrome.

**Localized language names are separate**: `src/data/language-names.json`
(build-inlined like `navigation.json` — no runtime fetch) holds a 9 × 9 matrix
(UI locale → target locale → name) so the pricing checklist, Library panels,
language dropdown and roadmap UI toggles render every language in the language
selected on the toolbar — even for the 7 locales without full chrome files yet.
Consumed via `useLanguageNames()` + `useNavigation().languageName()`
(fallback: matrix → `languages.<code>` dict key → native endonym → uppercase
code). `run validate` enforces matrix completeness.

### 3.3 Media / audio
Audio is **not** in Git. The local staging area is `media/audio/<lang>/<id>.mp3`
(git-ignored), synced to R2 at `https://media.verbologic.com/` **differentially**
by `scripts/media-sync.mjs`. A `media/audio-manifest.json` stores per-key
hashes so only changed/new files are uploaded.

```bash
run media stage      # copy legacy archive mp3s into media/audio staging layout
run media manifest   # recompute media/audio-manifest.json (differential baseline)
run media verify     # report missing files / TTS queue / orphans
run media upload     # requires R2 credentials; uploads only changed keys
```

`audio: null` in an entity = queued for TTS regeneration (alphabet + greetings,
68 items). Once generated, drop the file into staging and `run media upload`.

### 3.4 Lessons (future)
`content/<lang>/*.md` via `@nuxt/content` — arrives in Phase 3. Nothing to
maintain yet.

### 3.5 Pricing (tiers + CTA behavior)
`public/data/prices.json` is the single source of truth: `tiers[]` with `id`,
`name`, optional `tagline`/`description`, `price`, optional `unit: 'credits'`
and `perLanguage` overrides. The CTA in `src/pages/pricing/index.vue` is
tier-aware:
- **Free tier** (`price === 0`): label `pricing.cta_free` ("Open Library") —
  no payment. It enrolls each selected language as `prospect`/`trial` via the
  `libraryStore.enroll()` write seam (localStorage, deduped by
  `activeFor()`, hydrated first on mount) and routes to `/library`.
- **One-time tier**: label `pricing.cta_buy` ("Buy now") — checkout stub.
- **Credits tier** (`unit: 'credits'`): label `pricing.cta_topup` ("Buy
  credits") — checkout stub; amounts render via `pricing.credits`.
- Zero prices render as `pricing.free` ("Free"), never `$0`.
CTA labels live in `public/data/locales/*.json` under `pricing.cta_*`;
`pricing.pay` remains the fallback for paid tiers.

### 3.6 Account & auth (Phase 1)
- Route: `src/pages/account/index.vue` → `<AccountForm />` (prerendered shell,
  client-side auth). Query params: `?next=/pricing` resumes an interrupted
  flow; `?verified=1` is the e-mail-confirmation redirect target.
- `src/components/AccountForm.vue` — three modes in one island: **Create
  account** / **Sign in** tabs when signed out; **Profile edit** when signed
  in (display name, avatar upload/remove, e-mail change, phone with SMS
  verification, sign out). All copy under `account.*` in the locale files.
- Model: **passwordless, code-based (Route A)**. Register/sign-in =
  `signInWithOtp({ email })` → the user **pastes the 6-digit code** from the
  e-mail (`verifyOtp({ type: 'email' })`). The magic **link** is deliberately
  not offered: `@supabase/ssr`'s browser client hardcodes `flowType: 'pkce'`
  (createBrowserClient.js), and a PKCE link silently signs nobody in when the
  code verifier is absent — different browser/device, different host, or the
  Site-URL fallback (there is no server callback route in a pure-SSG app).
  E-mail change = `updateUser({ email })` + `verifyOtp({ type:
  'email_change' })`; phone = SMS OTP once a provider is enabled
  (`type: 'phone_change'`). Verification state is read from the **session**
  (`email_confirmed_at` / `phone_confirmed_at`) — `auth.users` is the source
  of truth; `profiles` stores only `display_name` + `avatar_url`.
- **Paste-the-code UX**: input normalises pasted text (`123 456` / `123-456` /
  `123456` → 6 digits, shown as two groups of three), a format gate blocks
  malformed submissions, a **Cancel** button closes the panel, resend
  cooldown is **60 s** (GoTrue allows 1 OTP request / 60 s per user), and
  failed verifications are counted by `src/lib/otpAttempts.ts` — **5
  attempts then lock** per e-mail. That limiter is **UX deterrence only**
  (GoTrue's token can't be attempt-limited by us server-side; Supabase still
  enforces its own limits/expiry). A custom 9-digit code service with a
  server-enforced counter is the Route B upgrade path.
- Avatar storage: `avatars` bucket (public read, 2 MB, png/jpeg/webp);
  owner-only writes via RLS folder guard `avatars/{auth.uid()}/…`. Uploads
  are downscaled client-side (≤512px JPEG); the URL is mirrored into auth
  metadata so the header updates.
- The header avatar (`UserAvatar.vue`) links to `/account` — the same form.
- **Dashboard prerequisites** (not code): the *Magic Link* / *Confirm signup*
  templates must include `{{ .Token }}` — that is what puts the 6-digit code
  in the e-mail (default templates ship only the link); "Confirm email" ON +
  redirect allowlist containing `/account` (only relevant if a link is
  clicked anyway); phone verification needs an SMS provider
  (Twilio/MessageBird — paid) enabled; production needs
  `NUXT_PUBLIC_SUPABASE_URL` / `NUXT_PUBLIC_SUPABASE_ANON_KEY` in Workers
  Builds, otherwise `/account` shows the "not configured" notice. The
  built-in mailer is dev-grade (a few mails/hour, team addresses) — configure
  custom SMTP before real signups.

---

## 4. Layout — where it is & how to maintain it manually

| Concern | File | Manual edit |
| --- | --- | --- |
| App shell order | `src/layouts/default.vue` | header → container(nav+page) → footer; `flex` column, min-h-screen |
| Header bar | `src/components/AppHeader.vue` | logo SVG, wordmark, `<LanguageSwitcher/>` |
| Toolbar | `src/components/AppNav.vue` | pill markup, active-state classes |
| Language dropdown | `src/components/LanguageSwitcher.vue` | dropdown trigger + option list |
| Footer | `src/components/AppFooter.vue` | social row + copyright |
| **Responsive rules** | `src/assets/css/layout.css` | `.app-container` (1400px cap), `.nav-pill` (rounded below 640px), portrait/landscape `@media` |
| Palette / theme | `tailwind.config.ts` | `theme.extend.colors.brand` + content globs |
| Base + utility styles | `src/assets/css/tailwind.css` | Tailwind directives only |

### Key responsive rules (in `layout.css`)
- `.app-container` — `max-width: 1400px; margin-inline: auto`; gutters 16px on
  mobile → 24px ≥641px → 32px ≥1440px.
- `.app-header-inner` — `flex-wrap: wrap; row-gap: 10px`. Row 1 = brand (left) +
  controls (right); below 768px the `<AppNav>` toolbar wraps onto a dedicated
  full-width second row instead of squeezing between them.
- `.nav-pill` — intrinsic-width pill by default; `@media (max-width: 767px)`
  turns the toolbar into a full-width segmented bar: equal-width buttons,
  icon + localized label that truncates (`text-overflow: ellipsis`). Below
  360px labels hide entirely (icon-only; `title`/`aria-current` remain).
- `@media (orientation: landscape) and (max-height: 540px)` — compacts header/nav
  vertical rhythm for short screens.

### How to change the look (typical tasks)
- **Center content tighter/looser:** edit `.app-container` `max-width` (default 1400px).
- **Colors:** `tailwind.config.ts` → `brand` palette; components use `brand-600/700`.
- **Reorder toolbar:** change `order` in `navigation.json` — no CSS involved.
- **Sticky header:** it's already `sticky top-0` in `AppHeader.vue`.

---

## 5. Build & deploy commands (the `run` tool)

| Command | What it does |
| --- | --- |
| `run help` | show every command |
| `run dev` | Nuxt dev server, http://localhost:3000 |
| `run build` | **differential build** — only regenerates when source/content hashes changed |
| `run build --force` | ignore the hash gate and rebuild |
| `run validate` | entity/nav/locale integrity checks |
| `run media …` | stage / manifest / verify / upload audio |
| `run clean` | remove build junk, keep `.nuxt` (fast next build) |
| `run clean-deep` | remove build junk + `.nuxt` cache |
| `run tsc` | vue-tsc typecheck |
| `run commit "<msg>"` | `git add -A` + commit (always allowed) |
| `run push [--force]` | push branch (triggers Cloudflare Workers Builds deploy) — **throttled: max 1 push / 2h**; a throttled push keeps commits local, exits 2 with a wait notice; `--force` bypasses once |
| `run release "<msg>"` | build → validate → media manifest → commit → push (push throttled: on throttle the release is committed locally and reports when to `run push`) |
| `run deploy` | `wrangler deploy` (Workers Static Assets, differential; needs `CLOUDFLARE_API_TOKEN`) |
| `run deploy-dry` | validate `wrangler.toml` without uploading |

### Why the build is differential
`scripts/fingerprint.mjs` hashes `src/**`, `public/data/**`, the build configs
(`nuxt.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `package.json`) and
`wrangler.toml` into `temp/build.fingerprint`. `run build` reuses the existing
`.output/public` whenever the hash is unchanged, so quick "build again" cycles
skip regeneration. Any source/content change short-circuits that and regenerates.
`--force` bypasses the gate.

### Push throttle (2h)
Pushes trigger a Cloudflare Workers Builds deploy, so `run` enforces **at most
one push per 2h**. State: `temp/last_push` (epoch seconds, written after every
successful push; `run clean` wiping `temp/` falls back to the `origin/main`
commit date, which tracks the last push closely). Behavior:
- `run push` with unpushed commits inside the window → **no push**; commits
  stay local; exit code 2 with a "push in ~N min" notice.
- `run push --force` → bypasses the window once (for hotfixes).
- `run release` → always commits; on throttle it reports "committed but push
  throttled" — the queued commits go out with the next successful push.
- `run status` prints the last-push age. `run deploy` (manual wrangler) is
  intentionally not throttled.

### Deployment paths (pick one)
1. **Automatic (recommended):** push to the GitHub `main` branch; Cloudflare
   Workers Builds auto-deploys. `run release` does exactly this.
2. **Direct upload (differential):** `run deploy` — Wrangler hashes and uploads
   only the changed files from `.output/public`.
3. **Media:** `run media upload` (R2) — manifest-gated, uploads only new/changed
   audio keys.

### Custom domains (declarative)
`wrangler.toml` attaches both hostnames via `[[routes]]` with
`custom_domain = true`. Cloudflare creates the DNS records and issues the
certificates on deploy — no dashboard step required.

```toml
[[routes]]
pattern = "verbologic.com"
custom_domain = true

[[routes]]
pattern = "www.verbologic.com"
custom_domain = true
```

Custom Domains match on **exact hostname**, so apex and `www` are separate
entries. Add a redirect rule so one canonical host wins; the hostname you
redirect *from* also needs a proxied DNS record (`A` → `192.0.2.0` or
`AAAA` → `100::`).

> **Note:** this project runs on **Workers Static Assets**, not Cloudflare Pages.
> Pages does not support `routes`/`route` in its Wrangler config, which is why
> the domains are declared here instead of in the dashboard.

### One-time prerequisites
- Install deps: `run install`.
- Git remote set (`git remote -v`), branch `main`.
- Cloudflare Workers project linked to the repo (build command `npm run generate`,
  output directory `.output/public`) **or** `CLOUDFLARE_API_TOKEN` for
  `run deploy`.
- R2 env vars for `media upload`: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.

---

## 6. Recipe drawer (common manual jobs)

- *"I fixed a word in the archive HTML"* → `node scripts/extract-legacy.mjs` → `run validate` → `run build`
- *"I want a 6th toolbar item"* → §2 steps in `navigation.json` + page + `AppNav.ICONS`
- *"The menu reads better in French"* → edit `menuLabels.fr` in `navigation.json`
- *"New pronunciation file arrived from TTS"* → copy to `media/audio/<lang>/` → `run media manifest` → `run media upload`
- *"Mobile layout looks off in landscape"* → `layout.css` `@media (orientation: landscape)` block
- *"Rebuild everything from scratch"* → `run clean-deep` → `run build --force`


---

## 7. Supabase — auth, enrollments & progress

**Client:** `src/plugins/supabase.client.ts` (browser-only) via the
`useSupabase()` composable. This is a pure-SSG site — no server runtime — so
only `createBrowserClient` is active; `@supabase/ssr`'s server helpers have no
runtime here. Every consumer **no-ops to localStorage** when credentials are
absent, so `nuxt generate` stays green without a `.env`.

**Config:** `.env` (gitignored) / `.env.example` (committed template):

```
NUXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NUXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_…
```

Nuxt reads `NUXT_PUBLIC_*` (never `NEXT_PUBLIC_*`). Values are **baked at
build time** → also set them in Cloudflare Workers Builds. The publishable key
(`sb_publishable_…`, replaces the legacy `anon` JWT) is browser-safe; RLS is
the security boundary. Never ship the `sb_secret_…` key.

**Schema:** `supabase/schema.sql` — run once in the Dashboard → SQL editor.
Idempotent; safe to re-run.

| Table | Purpose |
| --- | --- |
| `profiles` | preferences + XP; auto-created by the `on_auth_user_created` trigger |
| `enrollments` | one row per user+language (`tier_id`, `status`, `credits_total`), `UNIQUE(user_id, locale)` |
| `learned_items` | source of truth for **Words learned**; `UNIQUE(user_id, entity_id)` makes writes idempotent |
| `credit_ledger` | append-only credit movements (+ top-up / − spend); consumed & left **derive** from `SUM(delta)` — reserved for the AI Mentor |
| `quiz_results` | attempt history (Phase 3 QuizEngine) |

View **`enrollments_overview`** aggregates `words_learned` /
`credits_consumed` / `credits_left` — the one query the Library reads.

**Consumers:** `userStore` (auth session: `getSession` + `onAuthStateChange`),
`useProgress()` (`learned_items` writes + localStorage fallback; the
"mark as learned" toggle in `ExpressionSearch.vue`), `libraryStore` →
`setFromOverview()` (Library panels).

**Regenerate DB types:** `npx supabase gen types typescript --project-id <ref>
--schema public > src/types/database.ts`.
