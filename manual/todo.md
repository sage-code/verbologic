# Verbologic — Build To-Do List

**Status:** [ ] todo · [~] in progress · [x] done
**Stack:** Nuxt 3 (SSG) · Pinia · Fuse.js · Supabase (later) · Cloudflare R2 (later)

## 🤔 Decisions needed
- [x] Styling — **Tailwind CSS** via `@nuxtjs/tailwindcss` (utility-first, inline classes in all components)
- [ ] Milestone scope — minimal / FE+data / full stack (Supabase+R2)
- [ ] Content module — `@nuxt/content` for MD lessons (default: yes)

## Phase 0 — Prep
- [x] Confirm Node ≥ 18 (have v24.18.0 ✅) and npm (have 11.16.0 ✅)
- [x] Package manager: npm (only one installed; optionally pnpm/yarn via corepack)

## Phase 1 — Nuxt 3 scaffold
- [x] Create `package.json`
- [x] Create `nuxt.config.ts` (SSR + SSG via `nuxt generate`, `srcDir: 'src/'`)
- [x] Create `tsconfig.json`, `src/app.vue`, `src/pages/index.vue`
- [x] Update `.gitignore` (`node_modules`, `.nuxt`, `.output`, `.data`, `media/`)
- [x] `npm install` deps (nuxt, @pinia/nuxt, pinia, fuse.js, typescript, vue-tsc)
- [x] Validate with a production `nuxt generate` build

## Phase 1.5 — Tailwind CSS styling
- [x] Install `@nuxtjs/tailwindcss` (tailwindcss 3.4.19)
- [x] `tailwind.config.ts` with `src/` content globs + `brand` palette
- [x] `src/assets/css/tailwind.css` entry wired via `nuxt.config.ts` `css`
- [x] Convert all Vue components to inline utility classes
- [x] Verify compiled output (brand-600 → rgb(47 91 196) ✅)

## Phase 2 — Decoupled data layer (the $O(N)$ core)
- [x] `public/data/entities/` — 7 files / 532 entities generated from legacy HTML (via `scripts/extract-legacy.mjs`)
- [x] `public/data/locales/en.json` + `ro.json` (UI chrome + 53 contrastive notes)
- [x] `src/stores/searchStore.ts` — Fuse.js index over entity JSON
- [x] `src/composables/useEntities.ts` (+ `useLocale.ts`, `src/types/entities.ts`)
- [x] `src/components/ExpressionSearch.vue`
- [x] `src/components/MediaViewer.vue` (R2 URL audio player, graceful on missing)
- [x] `src/components/ContrastiveNote.vue`
- [x] `src/pages/ro/index.vue` + `src/pages/en/index.vue` (real track pages, UI-lang toggle)
- [x] Fix: `dir.public` absolute-path pin (root `public/` now reaches build output)
- [x] Typecheck (`vue-tsc`) + production `npm run generate` both pass
- [x] Dependency hygiene: TypeScript pinned to 5.x (vue-tsc), `@types/node` added

## Workspace DX — VS Code live local preview
- [x] `.vscode/settings.json` — Live Server root pinned to `.output/public`, Tailwind/Vue formatting
- [x] `.vscode/tasks.json` — tasks: Nuxt dev (default build), Generate, Generate+Liver preview, Serve static
- [x] `.vscode/launch.json` — F5 node debug launcher for `npm run dev`
- [x] `.vscode/extensions.json` — recommended: Volar, NuxtR, Tailwind, Live Server
- [x] `package.json` `preview` → `python -m http.server 4173 --directory .output/public`
## Layout & Navigation (mobile-first shell)
- [x] `src/layouts/default.vue` — header / nav toolbar / page / footer shell
- [x] `src/assets/css/layout.css` — explicit `@media` rules: 1400px container cap + fluid shrink, portrait stacking, landscape compaction, pill→round nav on mobile
- [x] `src/data/navigation.json` — 9 interface languages (flags+short codes), 5 menu items (Home first) with routes+icons, full labels for all 9 languages, social footer
- [x] `src/components/AppHeader.vue` (SVG logo) · `LanguageSwitcher.vue` (dropdown) · `AppNav.vue` (pills→round) · `AppFooter.vue` (centered social)
- [x] `useLocale` extended to 9 locales w/ EN fallback; `useNavigation` build-inlines the nav data
- [x] `@heroicons/vue@2.2.0` installed; menu icons mapped by JSON key
- [x] Placeholder `/lessons` + `/about` routes
- [x] Verified: 12 routes prerendered, 5 menu labels + US flag + social links in static HTML, CSS rules inlined

## Maintenance toolkit (manual + `run` launcher)
- [x] `manual/MAINTENANCE.md` — nav content/layout locations, manual-edit recipes, deploy paths
- [x] `run` launcher: `help dev install build(–force) validate media clean clean-deep tsc status commit push release deploy-pages`
- [x] `scripts/fingerprint.mjs` — differential build gate (content hash → skip rebuild when unchanged)
- [x] `scripts/validate-data.mjs` — entity types/ids/audio URLs, 9-language label coverage; FAILED→exit 1
- [x] `scripts/media-sync.mjs` — stage 464 mp3s from archive, sha1 manifest (462 unique keys), verify, upload stub (R2 env vars)
- [x] Differential build verified: change → rebuild; unchanged → skip; `--force` bypass
- [x] Fixed during test pass: `greeting` entity type (was missing from enums), archive path `romanian`≠`ro`, clean staging layout, `nuxi prepare` before typecheck/build

## Layout fix — header restructure + light/dark themes
- [x] Header = logo (left) → **AppNav between logo and flags** → theme toggle + language dropdown (right)
- [x] `src/components/ThemeToggle.vue` — sun/moon selector, persists to localStorage (`verbologic-theme`), toggles `<html data-theme>`
- [x] `src/plugins/theme.client.ts` — applies persisted theme before paint
- [x] `src/assets/css/themes.css` — **CSS variables for the two modes**: `:root` (light) + `[data-theme=dark]` (dark); `color-scheme` + cross-fade transitions
- [x] `tailwind.config.ts` — semantic tokens (`bg-body`, `bg-surface`, `text-content`, `text-muted`, `border-edge`, `bg-accent`, `text-on-accent`, …) mapped to the CSS vars
- [x] All components + pages migrated from slate/brand classes to semantic tokens
- [x] Flags remain emoji unicode (🇺🇸 🇷🇴 🇩🇪 …) in the dropdown
- [x] Verified in built HTML: theme vars + dark block in CSS, DOM order logo→nav→toggle→flags, toggle aria-label, emoji flags

## Flags & social logos — real SVG graphics (Windows-safe)
- [x] Root cause: Windows has no flag-emoji font → emoji flags render as letter pairs; replaced with real SVG flags
- [x] `flag-icons` installed; `src/components/LanguageFlag.vue` imports the 9 SVGs (us/ro/de/ru/it/es/fr/hu/pt) → crisp `<img>` (rounded, lazy), registered under `src/types/svg.d.ts`
- [x] `navigation.json` `languages[].flag` now stores ISO country codes; `LanguageSwitcher` triggers + options render LanguageFlag
- [x] `simple-icons` installed; `src/components/SocialIcon.vue` renders inline `<svg><path>` brand logos (Bluesky #1185FE, Discord #5865F2, YouTube #FF0000, Reddit #FF4500)
- [x] `navigation.json` `social[].icon` now stores brand slugs; `AppFooter` uses SocialIcon
- [x] `validate-data` enforces known flag codes + known brand slugs (new KNOWN_FLAGS / KNOWN_BRANDS)
- [x] `manual/MAINTENANCE.md` updated (flag/social asset model + how to add language/brand)
- [x] Verified in built output: flag = inline SVG data-URI (flag-icons-us path), 4 brand logos present with brand colors, zero emoji leftovers; `run tsc` + `run build` + `run validate` all green

## UI polish — footer colors, flag dropdown, toggle diameter
- [x] Footer icons now uniform: `SocialIcon` fills `currentColor` (all brands share `text-muted`, accent on hover)
- [x] Language trigger: border removed entirely, flag rendered at max size (`md` h-7 w-9) with minimal padding (`px-1.5 py-0.5`)
- [x] ThemeToggle diameter now **exactly matches** menu buttons: `h-11 w-11` (44px = `.nav-pill` round size on mobile)
- [x] Verified in built HTML: no brand hex fills, `currentColor` present, `h-11 w-11` toggle, borderless trigger + large flag

## Typography system — Space Grotesk / Plus Jakarta Sans / Inter
- [x] Google Fonts via `nuxt.config.ts` head links (preconnect ×2 + css2 stylesheet, `display=swap`); unicode-range subsets verified live: latin/latin-ext (HU ő/ű) + cyrillic/cyrillic-ext (RU) WOFF2
- [x] Root tokens in `tailwind.css`: `--font-header` / `--font-ui` / `--font-body` + `@layer base` rules (body, h1–h6, button/select/input/textarea/.dropdown)
- [x] `tailwind.config.ts` fontFamily tokens: `sans/body/ui/header` → vars
- [x] Senior findings: Space Grotesk & Plus Jakarta Sans lack basic Cyrillic → Inter glyph-fallback added to both stacks; no legacy font imports/font-family to clean up (audited)
- [x] Verified compiled output: vars, base rules, letter-spacing −.01em all present; `run tsc` + `run build` green

## UI polish — mobile toolbar second row
- [x] AppHeader: row 1 = brand (left) + controls `ml-auto` (theme toggle, avatar, language); below `md` (768px) `<AppNav>` wraps onto a dedicated full-width second row — no more squeezing between wordmark and theme switch
- [x] `layout.css`: `.app-header-inner` now `flex-wrap: wrap; row-gap: 10px` (portrait-only wrap media query removed); `.nav-pill` <768px = full-width segmented bar (equal widths, icon + truncating label), <360px icon-only fallback
- [x] `AppNav`: pills carry `title` + `aria-current="page"` so the segmented bar stays self-describing
- [x] ≥768px desktop layout unchanged (single row, centered intrinsic pills)
- [x] Docs updated (`manual/MAINTENANCE.md` §4); verified via `nuxt generate` + `vue-tsc` + `temp/verify_header.mjs`

## Phase 3 — Content & interactivity
## Phase 3 — Content & interactivity
- [ ] `content/ro/*.md` lessons via `@nuxt/content`
- [ ] `src/components/QuizEngine.vue`
- [ ] `src/stores/userStore.ts` (localStorage-first)

## Phase 4 — Media pipeline (needs credentials)
- [ ] `wrangler.toml` + `.github/workflows/deploy-media.yml`
- [ ] `media/` staging dir (git-ignored) → R2 `media.verbologic.com`
- [ ] ⚠️ Requires: R2 account id + access keys + bucket domain

## Phase 5 — Supabase (credentials in `.env`)
- [x] `npm install @supabase/supabase-js @supabase/ssr` (browser client only — pure SSG, no server runtime)
- [x] `.env` / `.env.example` — `NUXT_PUBLIC_SUPABASE_URL` + `NUXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key; Nuxt ignores `NEXT_PUBLIC_*`)
- [x] `nuxt.config.ts` `runtimeConfig.public` — empty defaults keep builds green without credentials
- [x] `src/plugins/supabase.client.ts` + `useSupabase()` (null-safe, localStorage fallback)
- [x] `supabase/schema.sql` — profiles · enrollments · learned_items · credit_ledger · quiz_results + RLS + triggers + `enrollments_overview` view
- [x] `userStore` — real auth session (`getSession` + `onAuthStateChange`), `signInWithEmail` for the future login UI
- [x] `useProgress()` — `learned_items` writes + fallback; "mark as learned" toggle in `ExpressionSearch.vue`
- [x] `libraryStore.setFromOverview` — Library panels read the view when signed in
- [ ] Run `supabase/schema.sql` in the Dashboard → SQL editor
- [ ] Set `NUXT_PUBLIC_*` in Cloudflare Workers Builds (values bake at build time)
- [ ] Login UI (magic link) → `userStore.signInWithEmail`
- [ ] AI Mentor credit spend → append to `credit_ledger` (negative deltas need a server-side policy/edge function)

## Phase 1 — Account form (/account) + auth wiring
- [x] Migration `account_profiles_avatars` applied via MCP + mirrored into `supabase/schema.sql` (idempotent): `profiles.display_name`/`avatar_url`, `avatars` storage bucket (public read, 2 MB, images, owner-only folder writes), `handle_new_user` seeds display_name
- [x] `userStore`: passwordless auth API — `registerWithEmail` / `signInWithEmail` (e-mail OTP + magic link, `shouldCreateUser` distinguishes them), `verifyEmailOtp`, `updateDisplayName`, `updateEmail`/`verifyEmailChange`, `updatePhone`/`verifyPhoneOtp` (SMS), `uploadAvatar` (canvas downscale ≤512px, storage `avatars/{uid}/avatar.jpg` upsert, cache-busted public URL), `removeAvatar`, `fetchProfile`, `isAuthConfigured`
- [x] Fixed pre-existing bug: `hydrate()` registered a duplicate `onAuthStateChange` listener on every page mount (module-level guard now)
- [x] New `src/pages/account/index.vue` (`?next=` resume, `?verified=1` banner) + `src/components/AccountForm.vue` (register/sign-in tabs when signed out; profile edit when signed in; shared OTP panel; resend cooldown; `aria-live` status; graceful `auth_not_configured` / `sms_not_configured` states)
- [x] `UserAvatar.vue` → `NuxtLink to="/account"` (toolbar icon opens the same form)
- [x] ~37 `account.*` i18n keys in en.json + ro.json (other locales fall back to English)
- [x] Docs: `MAINTENANCE.md` §3.6; dashboard prerequisites listed (Confirm email + `{{ .Token }}` template, SMS provider, Workers env vars)
- [ ] You (dashboard): enable "Confirm email" + redirect allowlist `/account`; add `{{ .Token }}` to the e-mail template; enable an SMS provider for phone verification
- [ ] You (Workers Builds): set `NUXT_PUBLIC_SUPABASE_URL` / `NUXT_PUBLIC_SUPABASE_ANON_KEY` for production

## Fix — account dialog + temporary password auth (e-mail verification postponed)
- [x] Free tier can't customize auth e-mail templates (gated behind custom SMTP) → registration/sign-in switched to **e-mail + password** with "Confirm email" OFF (dashboard toggle) — `signUp` returns a session immediately
- [x] `userStore.signUpWithPassword` / `signInWithPassword` added; the whole paste-the-code flow kept but hidden behind `EMAIL_CODE_ENABLED = false` (`src/config/auth.ts`) — flip + `{{ .Token }}` to restore; e-mail-change section gated by the same flag
- [x] Caveat documented in form + docs: temporary mode has no e-mail verification and no password reset (dev-grade)
- [x] New `AppDialog.vue`: teleported modal, title left + round ✕ top-right next to it, Escape/backdrop close, body scroll lock, focus trap + `role="dialog"`/`aria-modal`/`aria-labelledby`
- [x] `/account` renders the form inside the dialog; ✕/backdrop/Escape close to `?next` or `/`
- [x] Top tabs removed: **bottom bar with Register / Sign in side by side** (primary submits the active mode, secondary switches), password show/hide toggle + min-8 rule
- [x] i18n: `close`, `password_label/placeholder/show/hide/min`, `verification_postponed`, `email_change_unavailable` (EN/RO)
- [x] Verified via `nuxt generate` + `vue-tsc` + `validate-data` + `temp/verify_password_dialog.mjs`

## Fix — code-based sign-in (Route A: paste the 6-digit code)
- [x] Root cause of "link signs nobody in" proven from `@supabase/ssr` source: browser client hardcodes `flowType: 'pkce'` (not overridable); a PKCE link without the code verifier (other browser/device/host, Site-URL fallback) is **silently ignored** by GoTrue (`_isPKCECallback` false → session detection skipped)
- [x] The UI now leads with the **paste-the-code** flow (works regardless of flow type): 6-digit input normalises pastes (`123 456` / `123-456` / `123456`), shows as two groups of three, format gate before submit, **Cancel** button closes the panel (was impossible to dismiss)
- [x] Attempt limiting: new `src/lib/otpAttempts.ts` — 5 failed verifies → locked per e-mail (15 min decay window), "attempts left: N of 5" shown, cleared when a new code arrives; **UX deterrence only** (server-side enforcement needs the Route B custom-code service); resend cooldown raised to 60 s to respect GoTrue's 1-OTP/60 s limit
- [x] Honest callback handling: URLs smelling of an auth callback (`?code`, `#access_token`, `?verified=1`, `?error`) show "Signing you in…" and wait ≤4 s for a session; failure/expiry shows a recovery notice pointing at the code path — the welcome banner no longer lies when no session exists
- [x] i18n: `code_sent_6`, `code_invalid_format`, `attempts_left` (`{n}`), `locked`, `cancel`, `codes_expire`, `signing_in`, `link_failed` added (EN/RO); `or_use_link` removed
- [x] Docs: `MAINTENANCE.md` §3.6 (Route A model + PKCE caveat + dashboard steps); dashboard todo: add `{{ .Token }}` to *Magic Link* / *Confirm signup* templates (that's why the mail had no code)

## Process — push throttle (1 push / 2h)
- [x] `run push`/`run release` throttled to one push per 2h (Workers Builds deploy rate): throttled pushes keep commits local, print the wait time and exit 2 (not a failure); `run push --force` bypasses once
- [x] State: `temp/last_push` epoch stamp written after each successful push; fallback to the `origin/main` commit date so `run clean` doesn't reset the window
- [x] No-op pushes ("nothing to push") short-circuit before the throttle and never restamp the window
- [x] `run status` prints last-push age; docs in `MAINTENANCE.md` §5
- [x] Tested live: empty commit + `run push` → throttled, `[ahead N]`, no remote impact; guard verified

## UI polish — dropdown code column + tier-aware pricing CTA
- [x] `LanguageSwitcher`: language code gets a fixed 32px monospace column (`w-8 shrink-0 font-code text-xs`) so labels align in one column and truncate (`min-w-0 flex-1 truncate`); trigger code fixed-width too (no horizontal jitter when switching codes)
- [x] New `--font-code` typography token (system mono stack — no 4th webfont) in `tailwind.css` + `fontFamily.code` in `tailwind.config.ts`
- [x] Pricing CTA is tier-aware: free (`price === 0`) → `pricing.cta_free` "Open Library" — enrolls `prospect`/`trial` per selected language (deduped via `activeFor`) and routes to `/library`; one-time → `pricing.cta_buy` "Buy now"; credits → `pricing.cta_topup` "Buy credits" (`pricing.pay` stays as fallback)
- [x] Free-plan safety: pricing page `store.hydrate()` before any `enroll()` — `persist()` rewrites the whole localStorage array, so enrolling un-hydrated would wipe saved enrollments
- [x] Zero prices render as `pricing.free` ("Free"/"Gratuit") instead of `$0`
- [x] Docs: `MAINTENANCE.md` §3.5 (pricing tiers + CTA behavior); verified via `nuxt generate` + `vue-tsc` + `validate-data` + `temp/verify_cta_and_codes.mjs`

## i18n — localized language names (language-names matrix)
- [x] New `src/data/language-names.json`: 9 × 9 matrix (UI locale → target locale → name), **build-inlined** like `navigation.json` — no runtime fetch, so it cannot 404 and the list updates synchronously on toolbar-language change (root cause of the stale live list was the undeployed runtime file 404ing silently)
- [x] New `useLanguageNames()` composable (usePrices pattern: client `$fetch`, `useState` cache) + `useNavigation().languageName()` with fallback chain matrix → `languages.<code>` dict key → native endonym → code
- [x] Wired into all five call sites: `pricing/index.vue` (was raw `l.label` — the bug), `LanguageSwitcher` (dropdown + trigger), `library/index.vue`, `en/index.vue`, `ro/index.vue` (dropped hardcoded 'English'|'Română')
- [x] Pricing page: `pricing.credits` key replaces hardcoded `"credits"`; `selected_total` fragment split into `pricing.selected` + `pricing.total` (word order now localizable)
- [x] `validate-data.mjs`: errors on missing/incomplete matrix (any UI locale or target name missing), warns on unknown codes
- [x] Docs updated (`MAINTENANCE.md` §1 + §2 + §3.2 + add-language recipe); verified via `nuxt generate` + `vue-tsc` + `validate-data` + `temp/verify_language_names.mjs`
- [x] Deploy: scoped commit + `run push` → Workers Builds (the live bundle previously predated the fix entirely)

## 📦 What I need from you
1. Styling decision (Bootstrap / Tailwind / custom)
2. (Later) Content module confirm (_yes_ default) 
3. (Later) Supabase URL + anon key
4. (Later) Cloudflare R2 credentials
