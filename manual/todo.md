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

## Library redesign — "Your Library" + Add Language dialog + 3 tracks
- [x] Menu: `pricing` removed from `navigation.json` `menu[]` + all 9 `menuLabels`; `AppNav` drops `BanknotesIcon`; `/pricing` page retained for the `?next=/pricing` resume flow (subscription model moves to the user profile dialog later)
- [x] Home hero CTA retargeted `/pricing` → `/library`
- [x] `src/data/tracks.ts`: `TRACK_IDS = ['dictionary','lectures','stories']`, per-language `tracks: Record<TrackId, route|null>` + `trackRoute()` / `isTrackLive()`; dictionary live for `ro` (`/learn/ro/dictionary`) and `en` (`/learn/en/dictionary`)
- [x] New `src/pages/learn/[locale]/[track].vue`: param validation (unknown → 404), Dictionary renders `<RoadmapShell :lang :key="locale">`, otherwise localized coming-soon card; explicit `import { computed } from 'vue'` (auto-import binding resolves to `any` on dynamic-route pages → TS7053)
- [x] `nuxt.config.ts`: 27 `/learn/:locale/:track` routes derived from `navigation.json` in `nitro.prerender.routes` (host serves `404-page`, so navigable routes must exist as files)
- [x] New `src/components/AddLanguageDialog.vue`: AppDialog shell (round ✕ top-right, Escape/backdrop close, focus trap); `role="radiogroup"` single-select over languages not already owned (`!store.activeFor(l.locale)`); confirm → `store.enroll()` prospect/trial (deduped), closes
- [x] `src/pages/library/index.vue`: title "Your Library", short intro "Add one or more languages and start learning.", `+ Add Language` pill (header + empty state), per-language panel keeps stats/progress, single CTA replaced by 3 track buttons (live → `/learn/...`, else disabled coming-soon)
- [x] Locales (en/ro): `library.title` "Your Library"/"Biblioteca ta", new `add_language` `select_title` `select_hint` `add` `all_added`, `track.*` block, `ui.close`; removed dead `library.empty` / `empty_cta` / `continue` / `coming_soon`
- [x] `RoadmapShell.vue`: tuple type annotation on the query-sync watch (pre-existing TS7031 under strict)
- [x] Docs: `MAINTENANCE.md` §2 (menu = method + library), §3.5 pricing status banner, new §3.7 (Library + tracks)
- [x] Verified: `vue-tsc` green · `validate-data` OK (menu items: 2) · `nuxt generate` prerenders /library + 27 track pages · `temp/verify_library_tracks.mjs` all PASS

## Library — hide language (round ✕) with progress kept
- [x] Tier badge replaced by a round ✕ button (`XMarkIcon`, `h-9 w-9 rounded-full`) top-right of each panel; localized `aria-label` ("Hide Romanian") + tooltip "progress is kept"
- [x] `libraryStore`: hide is a VIEW preference in a separate localStorage key (`verbologic-library-hidden` = `{ [locale]: hiddenAt }`) — enrollment record (tier/credits/words/timestamps) and `useProgress`/`learned_items` are never mutated or deleted; new `hidden`/`isHidden`/`visible`/`hiddenCount`/`hide()`/`restore()`; `isEmpty` now means "nothing visible"; `hydrate()` loads the hidden key (corrupt-payload guard); existing payloads need no migration
- [x] Panel list iterates `store.visible`; empty state shows a `hidden_hint` line only when `hiddenCount > 0`
- [x] Add Language dialog: `available` = languages not currently visible (hidden ones reappear, flagged "Progress kept"); confirm() → `store.restore(locale)` when a (hidden) enrollment exists — no duplicate `enroll()` — so the language returns with its previous progress
- [x] Locales (en/ro): `library.hide`, `hide_hint`, `hidden_hint`, `progress_kept`
- [x] No Supabase change (device-local preference by decision); documented the future `hidden_at` column promotion in `MAINTENANCE.md` §3.7
- [x] Verified: `vue-tsc` green · `validate-data` OK · `nuxt generate` · `temp/verify_library_hide.mjs` (27 checks) + `temp/verify_library_tracks.mjs` (38 checks) all PASS

## Library — discreet header Add Language button
- [x] Header button restyled: `bg-accent text-on-accent` primary → discreet page-background fill (`bg-body` — dark on dark theme, almost white on light), `border-edge text-muted text-sm font-medium`, `h-4` icon, hover → accent; shadow dropped
- [x] Header button rendered only when the library has content (`v-if="!store.isEmpty"`) — the empty-state card's big accent button is the sole entry point then (no duplicate CTA)
- [x] Empty-state accent button unchanged
- [x] Verified: `vue-tsc` green · `validate-data` OK · `nuxt generate` (74 routes) · `temp/verify_library_tracks.mjs` 41/41 + `temp/verify_library_hide.mjs` 27/27 PASS

## Toolbar — Practice item + placeholder page
- [x] `navigation.json`: menu gains `{ id: practice, icon: microphone, route: /practice, order: 2 }` + `practice` label in all 9 `menuLabels` (en Practice · ro Exersare · de Übung · ru Практика · it Pratica · es Práctica · fr Pratique · hu Gyakorlás · pt Prática)
- [x] `AppNav.vue`: `microphone: MicrophoneIcon` added to `ICONS`
- [x] New `src/pages/practice/index.vue`: placeholder (title + one-line intro + three non-interactive coming-soon preview cards: AI Mentor `ChatBubbleLeftRightIcon` · Exercises `PencilSquareIcon` · Games `PuzzlePieceIcon`); no store/data imports; `copy()` fallbacks are full EN strings (never raw keys)
- [x] Locales (en/ro): new `practice.*` block (title/intro/mentor_*/exercises_*/games_*/coming_soon); other 7 UI locales fall back to EN chrome
- [x] `validate-data.mjs` hardening: `KNOWN_MENU_ICONS` check errors on unknown `menu[].icon` slugs
- [x] Docs: `MAINTENANCE.md` §2 current-menu line + new §3.8 (Practice placeholder + future hooks: credit_ledger 'ai_mentor', quiz_results/QuizEngine)
- [x] Verified: `vue-tsc` green · `validate-data` OK (menu items: 3) · `nuxt generate` (76 routes incl. /practice) · `temp/verify_practice.mjs` 21/21 + tracks 41/41 + hide 27/27 PASS

## Library — header subtitle (translation-friendly)
- [x] Top line under "Your Library" now `library.subtitle` = "Manage your languages and view your progress." (RO: "Gestionează limbile și urmărește progresul.") — the old top line duplicated the empty-state text
- [x] Empty-state action prompt re-keyed `library.intro` → `library.empty_intro` (kept text: "Add one or more languages and start learning.") so the two roles cannot drift back together
- [x] Verify scripts retargeted: tracks (header subtitle / empty intro / old key gone) + hide (prerender asserts both literals)
- [x] Verified: `vue-tsc` green · `validate-data` OK · `nuxt generate` · all three suites PASS

## Gallery refactor — track-based content (dictionary · lectures · stories)
- [x] Mapping fixed 1:1 with the app tracks: dictionary=audio (mp3) · lectures=video (mp4) · stories=images (webp); R2 keys stay media-typed (the 464 live MP3 URLs are untouched)
- [x] One JSON per track at the gallery root (`dictionary.json` / `lectures.json` / `stories.json`, records grouped by topic code) — starts `{}`, legacy bridge keeps feeding the 532 dictionary records
- [x] `gallery/names.json`: the 104 one-key locale fragments folded into a single `{ code: {9-locale names} }` file
- [x] Deleted: 288 placeholder sample collections (all were `status:"sample"` `W0000` rows — zero real content lost), `gallery/locales/`, `curriculum.json types[]`
- [x] Unified record schema: `{ id, track, kind, lang, term, names, ipa, media: {url,mime,bytes,sha1}, topic, tags }` (two inconsistent shapes unified; sample status gone)
- [x] `gallery-index.mjs`: reads the 3 track files + names.json, emits per-topic payloads only for topics with content (`dictionary/lectures/stories/<CODE>.json`), counts per track, stale cleanup removes the old audio/image/video payload dirs
- [x] Runtime: `GalleryType` → `GalleryTrack`; `GalleryRecord` gains `track`/`media`, `type` → `kind`; `useGallery.fetchTopic(track)`; `roadmapStore` fetches `'dictionary'`; roadmap components read `counts.dictionary`; word-table badge shows `kind`
- [x] `validate-data.mjs`: gallery section rewritten (names completeness, topic codes, lang allowlist, track↔media URL prefix match)
- [x] `scaffold-gallery.py` simplified (3 track files + names.json + binary placeholders); `gallery/readme.md` rewritten to a 1-page doc
- [x] Docs: MAINTENANCE §6 recipe + §8 roadmap table; `run` help text
- [x] Verified: index dry-run → build (532 dictionary records, 0 unmapped) · `validate-data` OK · `vue-tsc` green · `nuxt generate` 76 routes · `temp/verify_gallery_tracks.mjs` all PASS · practice/tracks/hide suites PASS

## Content model refactor — sidebars in src, gallery as bare repository
- [x] Layer 1 (structure): `src/data/sidebars/library/{dictionary,lectures,stories}/sidebar.json` + `practice/{mentors,exercises,games}/sidebar.json` — sections → topics → item IDs only, localized names/descriptions in the sidebar; build-inlined via new `useSidebars()` (navigation.json pattern)
- [x] Layer 2 (repository): gallery keeps only media files, each with its own sibling `<ID>.json` manifest (item text term/names/ipa + file facts key/mime/bytes/sha1) — deleted `curriculum.json`, `names.json`, `legacy-topic-map.json` and the 3 track collection files (structure absorbed into the sidebars)
- [x] Layer 3 (location): `src/data/gallery.config.json` — R2 root + section→path mapping; media URL = root + path + file (the one hand-maintained file to re-point the CDN)
- [x] `gallery-index.mjs` rewritten: joins sidebars + config + manifests; transitional legacy bridge (item ids without a manifest resolve from `public/data/entities/`); emits `index.json` (counts[section][topic][lang] + progress) + lazy per-topic payloads under `library/dictionary/`
- [x] Runtime: `useGallery.fetchIndex()` + `fetchTopic(section, topic)` (curriculum fetch retired); `roadmapStore` renders the inlined dictionary sidebar, per-language counts via `topicCount()`; word-table badge `r.kind`, player `r.media.url`
- [x] Practice page cards now data-driven from the practice sidebars (hardcoded MODES removed; `practice.*` card keys removed from locales — text lives in the sidebars)
- [x] `validate-data.mjs` gallery block: sidebar/config/manifest/legacy-bridge integrity (every item resolves, manifest key within a configured section path, names.en everywhere)
- [x] Docs: `gallery/readme.md` rewritten (3 layers, manifest schema, commands); MAINTENANCE §6/§8; `run` help
- [x] Verified: index build 532 records/0 unmapped · `validate-data` OK (6 sidebars, 532 items) · `vue-tsc` green · `nuxt generate` 76 routes · `temp/verify_gallery_model.mjs` 32/32 · practice 21/21 · tracks 43/43 · hide 28/28

## Dictionary layout — per-track layouts + paginated file table with play/loop
- [x] Per-track layout registry: `RoadmapShell` is now a thin shell (store init, `?chapter=&topic=` sync, `PROGRESS_KEY` provide) rendering `LAYOUTS[track]` — new optional `track?: TrackId` prop (default `'dictionary'`); `/learn/:locale/:track` passes `:track="trackId"`, /ro · /en unaffected
- [x] New `roadmap/layouts/TopicsLayout.vue`: the original sidebar + topic list / word-table composition, kept as the Lectures/Stories fallback until their own layouts land
- [x] New `roadmap/layouts/DictionaryLayout.vue`: sidebar filters the open topic's words/expressions; right pane = topic banner (code + name) + `DictionaryToolbar` + scrollable table — columns File ID (`font-code`) · name in the learning language (+ IPA/kind) · translation (UI locale → en) · per-row play button (blinks `animate-pulse` while its file plays; disabled "audio coming soon" when `media.url` null) · icon-only learned toggle (Library progress source kept)
- [x] Row click (outside buttons) stops the autoplay; the row play button (`@click.stop`) plays ONE file via the new `useAudioQueue.playOne()` — no memorization gap after a single run
- [x] `roadmap/layouts/DictionaryToolbar.vue`: letter search (prefix filter, 1–2 letters typical, diacritic-folded), rows-per-page select (10/25/50/100, default 25), ◀ Previous / Page x / y / Next ▶, global "Play page" button — ▶ rounded → ■ square while the page queue runs — and the loop toggle (⟳, blinks while a looping run is live)
- [x] Autoplay scroll engine: the active row is highlighted and followed; when the playhead nears the container bottom the list scrolls up exactly 5 rows per jump (`scrollBy` on the measured row height); loop wrap fires the queue's `onCycle` → the list jumps back to the top; a natural end just stops
- [x] `roadmapStore`: `letterQuery` / `page` / `pageSize` + `dictionaryRows` / `pageCount` / `pagedRows` + `setLetterQuery` / `setPageSize` / `setPage` (clamped); page + filter reset on topic open/close; layout stops the run on topic/page/filter changes; `wordQuery` / Fuse topic search untouched (other tracks keep working)
- [x] `useAudioQueue`: `loop` ref + `mode` ref (`'idle' | 'single' | 'page'`) + `setLoop()` + `onCycle` option; loop persists across runs unless stated; existing `play/toggle/stop` signatures unchanged (word-table player bar unaffected)
- [x] Locales (en/ro): new `dictionary.*` block (`letter_filter` `per_page` `page` `prev` `next` `play_page` `loop` `col_id` `col_name` `col_translation` `col_audio` `play_single`); reuses `roadmap.stop` `ui.results` `ui.audio_coming_soon` `ui.learned` `ui.mark_learned` `roadmap.back_to_topics` `roadmap.no_words`
- [x] Docs: `MAINTENANCE.md` §8 (shell + track layouts + dictionary playback state rows)
- [x] Verified: `vue-tsc` green · locale JSON parse · `nuxt generate` 76 routes · `temp/verify_dictionary_layout.mjs` all PASS

## Dictionary standard — per-topic gallery repository (ro + en)
- [x] Media moved: `media/audio/<lang>/<ID>.mp3` (462 flat) → `gallery/audio/<lang>/<TOPIC>/<ID>.mp3` (per-topic folders; R2 keys mirror the path); `media/` keeps only `audio-manifest.json` as the prune source
- [x] `scripts/archive-topics.mjs` (+ committed `topic-map.json`): parses the archive pages (one `<h3>` per table, linear attribution), curated page#section → topic MAP + term overrides (greetings/courtesy split, da/nu → C8T01) + ro alphabet id-pattern rules (digraphs → C1T03, diphthongs/triphthongs → C1T02); `--apply-sidebar` rewrites the sidebar item lists (archive order, ids unchanged) — 20 → 30 populated topics, 532/532 attributed, 0 orphans
- [x] `scripts/gallery-manifests.mjs`: one sibling manifest per item — `{ id, lang, kind, term, names(+names[lang]), ipa, file, key: audio/<lang>/<TOPIC>/<file>, mime, bytes (real), sha1 (real), status: published, tags: [page#section], context?, example? }`; 464 published + 68 pending (greetings + ro letters); shared-key pairs (`letter_cat`, `word_coleg`) = 2 manifests, 1 file; ids never renamed (R2 filenames + `learned_items.entity_id`)
- [x] Blanks prepared: pending manifests render as the disabled "audio coming soon" row (`gallery-index` emits `media.url: null` for a null key); `scripts/gallery-scaffold-topic.mjs` + `run scaffold <lang> <TOPIC> <seed.json>` seeds blank topics (pending manifests + sidebar items); `topic-map.json` records the planned archive source per blank topic
- [x] `scripts/media-sync.mjs` rewritten gallery-driven: `stage | manifest (gallery/audio-manifest.json baseline) | verify | upload | prune` (prune lists the 462 retired flat keys)
- [x] Enablers: `validate-data.mjs` — pending manifests skip the key check; the sidebars walk filters to `sidebar.json` (so `topic-map.json` is not mistaken for a sidebar); fixed a latent `rel is not defined` crash in the gallery block
- [x] Runtime: all 532 dictionary records `source: 'gallery'` with per-topic URLs; `GalleryRecord` + the dictionary row surface the optional `context`/`example` fields
- [x] R2 gate: the 462 new keys (`audio/<lang>/<TOPIC>/…`) must be uploaded (`run media upload` / R2 sync) BEFORE the next deploy; the old flat keys stay as orphans until `run media prune`
- [x] Docs: `gallery/readme.md` (per-topic layout, manifest schema, pending status, shared keys), `MAINTENANCE.md` §3.3 + §8
- [x] Verified: `validate-data` OK (532 manifests) · `run media verify` clean (464 published / 68 pending / 462 staged / 0 orphans) · `gallery-index` OK (532 records / 96 topics) · `vue-tsc` green · `nuxt generate` · `temp/verify_dictionary_standard.mjs` 27/27 PASS
