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

**Current menu: `method` → `/method`, `library` → `/library`, `practice` →
`/practice` (placeholder: AI Mentor · Exercises · Games, all coming soon).**
Pricing was removed from the menu; its page is retained at
`src/pages/pricing/index.vue` only for the `?next=/pricing` resume flow until
the subscription model moves into the user profile dialog. New languages are
added from the Library's **Add Language** dialog (see §3.7).

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
(UI locale → target locale → name) so the Library's Add Language dialog and
language panels,
language dropdown and roadmap UI toggles render every language in the language
selected on the toolbar — even for the 7 locales without full chrome files yet.
Consumed via `useLanguageNames()` + `useNavigation().languageName()`
(fallback: matrix → `languages.<code>` dict key → native endonym → uppercase
code). `run validate` enforces matrix completeness.

### 3.3 Media / audio
Audio is **not** in Git. The staging root is the **media repository** itself —
`media/audio/<lang>/<TOPIC>/<ID>.mp3` (git-ignored binaries) next to their
sibling `<ID>.json` manifests (the committed Git index) — so the local layout
mirrors the R2 object keys exactly (`audio/<lang>/<TOPIC>/<ID>.mp3`).

The **differential baseline lives in the item manifests**: a published
manifest's `sha1`/`bytes` are the exact bytes that should be on R2. There is
no aggregate ledger — the old `media/audio-manifest.json` was removed (one
hot file duplicating the manifests' own `sha1`; it did not scale to 10k+
files). The sync is **differential** via `scripts/media-sync.mjs`, which with
credentials also diffs against the bucket itself (remote truth):

```bash
run media stage                # archive mp3s → media per-topic layout (via archive-topics attribution)
run media manifest [--dry-run] # reconcile manifests with the files on disk — promote pending, refresh sha1/bytes
run media verify [--remote]    # missing / orphans / dirty (edited, not re-uploaded) / pending (+ R2 diff)
run media upload [--apply]     # differential R2 sync — default reports the delta; --apply transfers
run media prune [--apply]      # R2 objects no manifest references — default reports; --apply deletes
```

R2 access uses R2's **S3-compatible API**, hand-signed with AWS SigV4 (no SDK,
no wrangler spawns) — the general Cloudflare API token `run deploy` uses does
NOT work here (different API, `10000` auth error). Five env vars, from the
bucket's own API token's S3 credentials (dash.cloudflare.com → R2 → the
bucket → Manage API tokens): `CLOUDFLARE_ACCOUNT_ID`, `R2_BUCKET`,
`R2_S3_ENDPOINT`, `R2_S3_ACCESS_KEY_ID`, `R2_S3_SECRET_ACCESS_KEY`. `.env` is
loaded automatically. Without them the local checks still run, but the delta
is local-hash only. After every
successful PUT the script writes the new `sha1`/`bytes`/`status` back into the
item manifest — the committed baseline always means *"these exact bytes are
on R2"*, so there is no separate ledger step and no ordering trap.

`audio: null` in an entity = queued for TTS regeneration (alphabet + greetings,
68 items). In the media these are **pending manifests** (`status: "pending"`,
`key/file/bytes/sha1: null`) — the dictionary renders them as a disabled
"audio coming soon" button. Once the file is generated: drop `<ID>.mp3` into
the topic folder → `run media manifest` (promotes it to published) →
`run media upload --apply`.

**Structure-first policy.** The sidebars (the design layer) may reference ids
whose content does not exist yet — those are **planned items, expected by
design, and the site is published with them**. No script may fail on them:
`run validate` and `run media index` report them as an informational count, and
`run missing` writes the full backlog (empty topics, planned ids per topic, the
`topic-map.json.planned` archive source, pins/docs gaps) to
`temp/missing-content.md`. Fill content on the go: author a seed →
`run scaffold <lang> <TOPIC> <seed.json>` → drop the mp3s → `run media
manifest` → `run media upload --apply` → `run build`. See
**architecture.md → "Content Lifecycle — Structure-First Design"**.

### 3.4 Lectures & stories (Nuxt Content — live)

The authoring layer is **Nuxt Content v3** (`@nuxt/content`, collection schemas in
`content.config.ts`). One Markdown document per *explanation locale*:

```
content/lectures/<trackLang>/<TOPIC>/<ID>/en.md     ← the canonical original (edit freely)
content/lectures/<trackLang>/<TOPIC>/<ID>/<locale>.md ← translations (status + sourceSha)
```

- **Two axes**: `trackLang` = which roadmap the lecture belongs to (may diverge
  freely per language — different video, different prose); `locale` = the
  language the explanation is written in. Lectures are English-canonical;
  stories (Phase 4) are target-language-canonical (the story IS the material).
- **Review tooling** (`run lecture …`, `scripts/lecture.mjs`): `new` scaffolds
  doc + pending video manifest + sidebar item; `status` prints the review queue
  (draft / stale / reviewed per doc); `translate <id> --lang <l>` scaffolds a
  translation carrying `sourceSha` (sha1 of the canonical doc) — the moment the
  original changes, the translation flags **stale** (exit code 1, UI badge);
  `review` marks it reviewed. The script never generates body text.
- **Runtime**: `scripts/media-index.mjs` joins each doc's **front matter** into
  the topic payloads (localized titles → `names`, per-locale review state →
  `content` meta, `related` ids → embedded rows). The prose itself renders on
  the lecture's **prerendered route**
  `/learn/<trackLang>/lectures/<TOPIC>/<ID>/<locale>` — `nuxt.config.ts`
  enumerates those routes from the content tree, so content queries run at
  build time and **no client-side content database is shipped** (verified: no
  `_content` dump in `.output/public`). MDC components: `::callout`, `::term`.
- The embedded video is a normal media item (`media/video/<lang>/<TOPIC>/<ID>.mp4`
  + sibling manifest, `kind: 'lecture'`, `content` pointer) — pending until the
  mp4 lands, then `run media upload --apply`.
- `content/**` is a **fingerprint input** (editing a lecture rebuilds).

### 3.5 Pricing (tiers + CTA behavior) — removed from the menu, page retained
> **Status:** Pricing is no longer linked in the menu (`navigation.json`).
> The page and `prices.json` stay as the per-language pricing reference until
> the new subscription model (user profile dialog) replaces them. The free-tier
> enroll flow moved to the Library's Add Language dialog (§3.7), which calls
> the same `libraryStore.enroll()` write seam.

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
- **Temporary mode (e-mail verification postponed)**: hosted projects can't
  customize auth e-mail templates until **custom SMTP** is configured, so
  registration/sign-in currently use **e-mail + password** with **"Confirm
  email" OFF** (Dashboard → Auth → Providers → Email) — `signUp` then returns
  a session immediately. Gated by `EMAIL_CODE_ENABLED = false` in
  `src/config/auth.ts` (the whole paste-the-code flow stays in the code —
  flip the flag + add `{{ .Token }}` to the templates to restore it).
  ⚠️ In this mode there is **no e-mail verification and no password reset**
  (reset also needs e-mail delivery) — development-grade; e-mail/phone
  *change* flows are hidden behind the same flag. E-mail/phone + verified
  flags still come from the **session** (`auth.users` is the source of
  truth; `profiles` stores only `display_name` + `avatar_url`).
- **Paste-the-code UX** (restored by the flag): input normalises pasted text
  (`123 456` / `123-456` / `123456` → 6 digits, shown as two groups of
  three), a format gate blocks malformed submissions, a **Cancel** button
  closes the panel, resend cooldown is **60 s** (GoTrue allows 1 OTP request
  / 60 s per user), and failed verifications are counted by
  `src/lib/otpAttempts.ts` — **5 attempts then lock** per e-mail. That
  limiter is **UX deterrence only** (GoTrue's token can't be attempt-limited
  by us server-side; Supabase still enforces its own limits/expiry). A
  custom 9-digit code service with a server-enforced counter is the Route B
  upgrade path.
- Avatar storage: `avatars` bucket (public read, 2 MB, png/jpeg/webp);
  owner-only writes via RLS folder guard `avatars/{auth.uid()}/…`. Uploads
  are downscaled client-side (≤512px JPEG); the URL is mirrored into auth
  metadata so the header updates.
- The header avatar (`UserAvatar.vue`) links to `/account` — the same form,
  now rendered as a **dialog** (`AppDialog.vue`: teleported backdrop, title +
  round ✕ top-right, Escape/backdrop close, scroll lock, focus trap); the
  ✕ closes to `?next` or `/`. Signed out, the bottom bar shows **Register**
  and **Sign in** side by side (primary submits, secondary switches mode).
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

### 3.7 Library ("Your Library") + track pages

**Page: `src/pages/library/index.vue`** — title *Your Library*, subtitle
*"Manage your languages and view your progress."* One panel per owned language
(tier badge, credits, words learned + progress bar) ending in three track
buttons: **Dictionary · Lectures · Stories**.

| Concern | File | Notes |
| --- | --- | --- |
| Add Language dialog | `src/components/AddLanguageDialog.vue` | wraps `AppDialog` (round ✕ top-right, Escape/backdrop close, focus trap); `role="radiogroup"` single-select over `languages.filter(l => !store.visible.some(e => e.locale === l.locale))` — hidden languages reappear; confirm → `libraryStore.enroll()` (`prospect`/`trial`, deduped) or `libraryStore.restore()` for hidden ones |
| Hide (per panel) | round ✕ in the panel header (`XMarkIcon`) | **View-only preference** stored in `localStorage 'verbologic-library-hidden'` (`{ [locale]: hiddenAt }`) via `libraryStore.hide()` / `restore()` — the enrollment record (tier, credits, words, timestamps) and learned-item progress are never mutated or deleted, so re-adding a language brings back the previous progress; `store.visible` drives the panel list and `isEmpty` |
| Add Language placement | header vs empty state | Header button is **discreet** (`bg-body` — page-background fill: dark on dark theme, almost white on light — `border-edge text-muted text-sm`, hover → accent) and **only rendered when the library has content** (`v-if="!store.isEmpty"`). With no visible languages, the empty-state card's **accent primary** button is the sole entry point. |
| Track model | `src/data/tracks.ts` | `TRACK_IDS = ['dictionary','lectures','stories']`; per-language `tracks: Record<TrackId, route \| null>` — `null` renders the coming-soon button; helpers `trackFor` / `trackRoute` / `isTrackLive` |
| Track pages | `src/pages/learn/[locale]/[track]/index.vue` | validates params (unknown → 404); live Dictionary renders `<RoadmapShell>` (`:key="locale"` forces a remount on param change); everything else shows the localized coming-soon card |
| Prerender | `nuxt.config.ts → nitro.prerender.routes` | all 9 × 3 = 27 `/learn/:locale/:track` URLs derived from `navigation.json` (the host serves `404-page`, so every navigable route must exist as a file); adding a language to `navigation.json` adds its three track URLs automatically |
| Copy | `public/data/locales/*.json` | `library.*` (title/intro/add_language/select_*/add/all_added) + `track.*` (per-track titles + coming-soon); `ui.close` labels the dialog's ✕ |

Currently live: Dictionary for `ro` (532 entities) and `en` (74). Lectures and
Stories come online by filling `tracks` in `src/data/tracks.ts` and adding the
content — the pages and prerender routes already exist.

**Hide vs. delete:** the panel's ✕ only *hides* a language (device-local
preference key). When the enrollment write path lands with the new
subscription model (user profile dialog), consider promoting this preference
to a `hidden_at timestamptz` column on `public.enrollments` (+ the
`enrollments_overview` view + regenerated `src/types/database.ts`) so it
syncs across devices — the store API (`hide`/`restore`/`visible`/`isHidden`)
would not change.

---

### 3.8 Practice (placeholder — AI Mentor · Exercises · Games)

**Page: `src/pages/practice/index.vue`** — toolbar item `practice`
(`microphone` icon, route `/practice`, order 2). A static placeholder: title,
one-line intro and three non-interactive preview cards (AI Mentor speaking ·
Exercises · Games), each badged coming soon. No store, no data, no
interactions yet.

When the modes land, they fill this page (or grow into sub-routes):
- **AI Mentor** — conversational speaking practice; credit spend appends to
  `credit_ledger` (`reason = 'ai_mentor'`).
- **Exercises** — drills over learned entities; results fit `quiz_results`
  (+ the planned `src/components/QuizEngine.vue`).
- **Games** — word/grammar play; no backing storage yet.

Copy lives under the `practice.*` block in `public/data/locales/en.json` +
`ro.json` (other UI locales fall back to EN chrome). `validate-data` errors
on unknown `menu[].icon` slugs (`KNOWN_MENU_ICONS`) — add the slug there and
the component in `AppNav.ICONS` together. `/practice` is prerendered
automatically (the menu link is crawled from every page's header).

---

## 4. Layout — where it is & how to maintain it manually

| Concern | File | Manual edit |
| --- | --- | --- |
| App shell order | `src/app.vue` + `src/layouts/default.vue` | `.app-backdrop` → `.app-frame` (header → `.app-main` → footer; flex column, ≥ 100dvh) |
| Header bar | `src/components/AppHeader.vue` | logo SVG, wordmark, `<LanguageSwitcher/>`; frozen `sticky top-0` |
| Toolbar | `src/components/AppNav.vue` | pill markup, active-state classes |
| Language dropdown | `src/components/LanguageSwitcher.vue` | dropdown trigger + option list |
| Footer | `src/components/AppFooter.vue` | one compact row: social links + copyright; frozen `sticky bottom-0` |
| **Responsive rules** | `src/assets/css/layout.css` | `.app-frame` per device/orientation, `--gutter-x/-y`, `--frame-ratio`, `.nav-pill` (segmented below 768px) |
| Palette / theme | `tailwind.config.ts` | `theme.extend.colors.brand` + content globs |
| Base + utility styles | `src/assets/css/tailwind.css` | Tailwind directives only |

### Key responsive rules (in `layout.css`)
- **App frame standard (content pages)** — see architecture.md "Layout
  Standard — Responsive App Frame" for the full device/orientation matrix.
  In short: portrait (mobile, tablet, desktop/27") = full width, no outer
  margins; tablet/laptop landscape = full width; large desktop landscape
  (≥1600×1000) = a centered **portrait-ratio** frame (`--frame-ratio`, 3/4 of
  the screen height) with the side margins unused top to bottom and the
  header/footer inside the frame. Header and footer are frozen (sticky); the
  page scrolls between them. Practice pages are excluded (designed later).
- `.app-main` — the page area: flex column, its child grows (`flex: 1`), so
  content pages always fill the space between header and footer.
- `.app-container` — header/footer inner row; `padding-inline: var(--gutter-x)`.
- `.app-header-inner` — `flex-wrap: wrap; row-gap: 10px`. Row 1 = brand (left) +
  controls (right); below 768px the `<AppNav>` toolbar wraps onto a dedicated
  full-width second row instead of squeezing between them.
- `.nav-pill` — intrinsic-width pill by default; `@media (max-width: 767px)`
  turns the toolbar into a full-width segmented bar: equal-width buttons,
  icon + localized label that truncates (`text-overflow: ellipsis`). Below
  360px labels hide entirely (icon-only; `title`/`aria-current` remain).
- `@media (orientation: landscape) and (max-height: 540px)` — compacts header,
  footer and page vertical rhythm for short screens (mobile landscape).

### How to change the look (typical tasks)
- **Gutters wider/tighter:** edit `--gutter-x` / `--gutter-y` in the matching
  device block of `layout.css`.
- **Landscape frame wider/narrower:** edit `--frame-ratio` (default `3 / 4`);
  the breakpoint where the frame kicks in is the
  `landscape and (min-width: 1600px) and (min-height: 1000px)` block.
- **Colors:** `tailwind.config.ts` → `brand` palette; components use `brand-600/700`.
- **Reorder toolbar:** change `order` in `navigation.json` — no CSS involved.
- **Sticky header/footer:** `sticky top-0` in `AppHeader.vue`, `sticky bottom-0`
  in `AppFooter.vue`; `scroll-padding-top/bottom` in `layout.css` must match
  their heights.

---

## 5. Build & deploy commands (the `run` tool)

| Command | What it does |
| --- | --- |
| `run help` | show every command |
| `run dev` | Nuxt dev server, http://localhost:3000 |
| `run build` | **differential build** — only regenerates when source/content hashes changed |
| `run build --force` | ignore the hash gate and rebuild |
| `run validate` | entity/nav/locale integrity checks — missing content is **never** an error (see §3.3 / architecture.md) |
| `run missing` | missing-content inventory → `temp/missing-content.md`: empty topics, planned ids, planned sources, pins/docs gaps |
| `run media …` | stage / manifest / verify / upload audio |
| `run lecture <new\|status\|translate\|review>` | lecture content tooling (content/lectures — see §3.4) |
| `run clean` | remove build junk, keep `.nuxt` (fast next build) |
| `run clean-deep` | remove build junk + `.nuxt` cache |
| `run tsc` | vue-tsc typecheck |
| `run commit "<msg>"` | `git add -A` + commit (always allowed) |
| `run push [--force]` | push branch (triggers Cloudflare Workers Builds deploy) — **throttled: max 1 push / 2h**; a throttled push keeps commits local, exits 2 with a wait notice; `--force` bypasses once |
| `run release "<msg>"` | build → validate → media manifest → commit → push (push throttled: on throttle the release is committed locally and reports when to `run push`) |
| `run deploy` | `wrangler deploy` (Workers Static Assets, differential; needs `CLOUDFLARE_API_TOKEN`) |
| `run deploy-dry` | validate `wrangler.toml` without uploading |

### Why the build is differential
`scripts/fingerprint.mjs` hashes `src/**`, `content/**` (the lecture/story
authoring layer), `public/data/**`, the build configs (`nuxt.config.ts`,
`tailwind.config.ts`, `tsconfig.json`, `package.json`) and `wrangler.toml` into
`temp/build.fingerprint`. `run build` reuses the existing `.output/public`
whenever the hash is unchanged, so quick "build again" cycles skip
regeneration. Any source/content change short-circuits that and regenerates.
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
3. **Media:** `run media upload --apply` (R2) — the delta is each item whose
   file hash no longer matches its manifest **or whose key is missing from
   the bucket**; only those keys transfer (`run media upload` reports the
   delta without transferring; `run media verify --remote` audits the bucket).

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
- R2 S3 env vars for `media verify --remote` / `media upload --apply` /
  `media prune --apply`: `CLOUDFLARE_ACCOUNT_ID`, `R2_BUCKET`,
  `R2_S3_ENDPOINT`, `R2_S3_ACCESS_KEY_ID`, `R2_S3_SECRET_ACCESS_KEY` —
  a bucket-scoped R2 API token's S3 credentials, NOT the general
  `CLOUDFLARE_API_TOKEN` that `run deploy` uses.

---

## 6. Recipe drawer (common manual jobs)

- *"I fixed a word in the archive HTML"* → `node scripts/extract-legacy.mjs` → `run validate` → `run build`
- *"I want a 6th toolbar item"* → §2 steps in `navigation.json` + page + `AppNav.ICONS`
- *"The menu reads better in French"* → edit `menuLabels.fr` in `navigation.json`
- *"New pronunciation file arrived from TTS"* → copy to `media/audio/<lang>/<TOPIC>/<ID>.mp3` → `run media manifest` (promotes the pending manifest) → `run media upload --apply`
- *"Mobile layout looks off in landscape"* → `layout.css` `@media (orientation: landscape)` block
- *"Rebuild everything from scratch"* → `run clean-deep` → `run build --force`
- *"New media content arrived"* → drop the media file in `media/<section path>/<lang>/<TOPIC>/` + write its sibling `<ID>.json` manifest (term/names/ipa/key/mime/sha1) → add the item id to the section's sidebar → `run media index` → `run build` (the index also runs automatically before every build)
- *"A blank topic has its content now"* → `run scaffold <lang> <TOPIC> <seed.json>` creates the pending manifests + sidebar items → drop the mp3s → `run media manifest` → `run media upload --apply`


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


---

## 8. Roadmap template (/ro, /en — RoadmapShell)

`src/pages/ro/index.vue` and `src/pages/en/index.vue` are thin wrappers around
`src/components/roadmap/RoadmapShell.vue` — the shared roadmap frame: chapter
rail (sidebar) + topic list, and the open topic's pane picked by the TOPIC's
**layout** — `table` (word rows with per-row play and a sequential "play
filtered" queue), `article` (content doc cards → prerendered pages) or
`gallery` (image cards). **Any layout kind can appear in any track**
(Dictionary · Lectures · Stories) — the track never picks the pane.

| Concern | File |
| --- | --- |
| Frame | `src/components/roadmap/RoadmapShell.vue` — store init, `?chapter=&topic=` deep links, one `useProgress` instance provided to the tree (`PROGRESS_KEY`), the credit/chapter meters (`#track-meters` teleport), the Chapters TOC toggle; the open topic's pane = `TOPIC_LAYOUTS[store.topicLayout]` (`track` prop only selects the sidebar section, default `'dictionary'`) |
| Topic layouts | `roadmap/layouts/TopicTable.vue` (table topics: toolbar + paginated file table — name (File ID remains a hidden sr-only field) · translation · per-row play (blinks) · learned toggle; prefix/translation search, rows-per-page, prev/next, global "play page" (▶ → ■ while running), loop toggle; row click stops autoplay; the list scrolls to the playhead) · `roadmap/layouts/TopicArticle.vue` (article topics: the topic's content docs as cards → prerendered article pages; strictly prose — no practice rows) · `roadmap/layouts/TopicGallery.vue` (gallery topics: image cards — image · term · gloss · learned toggle) · `roadmap/ChaptersTable.vue` (the chapters TOC table, shared by every track) |
| Layout invariants | ONE topic = ONE layout, declared as `layout` on the sidebar topic (`src/types/sidebars.ts` `TopicLayout`); enforced by `scripts/validate-data.mjs` — but only for content that EXISTS (wrong-kind items fail; missing/planned content is inventoried by `run missing`, never fatal): `table` → non-image records only, never a doc · `article` → content docs only (a video manifest for its own embedded video is allowed) · `gallery` → image manifests only. Mixed topics are split (e.g. lectures C1T01 = the 104 letter rows, C1T01A = the alphabet article) |
| Chapter rail | `roadmap/RoadmapSidePane.vue` + `src/lib/roadmapRail.ts` — **one** height rule for every track: the rail is EXACTLY as tall as the page content — the RoadmapShell grid (`flex-1`, fills the page area) stretches the rail cell to the content column; the rail panel is absolutely positioned inside it (`lg:absolute lg:inset-0`) so the chapter list never drives the row height; a list longer than the content scrolls inside the rail with its own scrollbar (`lg:overflow-y-auto lg:overscroll-contain`); the page content keeps the browser scroll. Double-clicking the selected chapter folds/unfolds its topics (`RoadmapSidebar.vue`) |
| Selection / filter / search state | `src/stores/roadmapStore.ts` — **track-aware** (`SECTION_BY_TRACK`, `init(lang, track, …)`; sidebar/counts/payload caches reset per track+lang), `topicLayout` (the open topic's pane kind), Fuse topic search, word filter, empty scaffolding rendered **disabled** (`populatedTopics` / `populatedChapters` drive walking + the default chapter; `visibleChapters` / `visibleTopics` show everything — contentless chapters/topics are disabled with a "coming soon" title), learned counts via `progress-index.json` |
| Runtime data | `public/data/media/**` — built by `scripts/media-index.mjs` (`run media index`; runs automatically at the start of every `run build`; `media/**` is a fingerprint input). Content-only article ids (no manifest) get a synthesized record (`kind: 'article'`) so the topic never counts zero; a sidebar id with NO content at all is a planned item — no record, reported, never fatal |
| Structure (sidebars) | `src/data/sidebars/**/sidebar.json` + `src/composables/useSidebars.ts` — sections → topics → **item ids** + localized names + per-topic `layout`; build-inlined (navigation.json pattern), never fetched |
| Location config | `src/data/media.config.json` — R2 `root` + one path per sidebar section; media URL = `root + path + file` |
| Repository | `media/` — media files under `<type>/<lang>/<TOPIC>/`, each with its own sibling `<ID>.json` manifest (item text: term/names/ipa/kind + file facts: file/key/mime/bytes/sha1/status; `pending` = media not yet produced — renders "coming soon") |
| Types + loaders | `src/types/media.ts` (runtime records) · `src/types/sidebars.ts` · `src/composables/useMedia.ts` · sequential player `src/composables/useAudioQueue.ts` |
| Topic attribution | `scripts/archive-topics.mjs` + `topic-map.json` — parses the archive pages (page#section → topic) and attributes all entities to Dictionary topics (report + topic map only; it never writes sidebars — the Lectures sidebar is hand-curated, see `manual/curriculum.md`); `scripts/media-manifests.mjs` re-folders media + writes the manifests; `scripts/media-scaffold-topic.mjs` (`run scaffold`) seeds the blank topics; `scripts/lecture.mjs` (`run lecture`) scaffolds/reviews article content |
| Legacy bridge (fallback) | sidebar item ids without a manifest resolve from `public/data/entities/*.json` (also the global-search source) — every dictionary item has a manifest now, so the dictionary is fully manifest-backed |
| Components | `roadmap/RoadmapSidebar.vue` · `RoadmapTopicSearch.vue` · `RoadmapTopicList.vue` · `roadmap/ChaptersTable.vue` · `roadmap/layouts/DictionaryToolbar.vue` |
| Article pages | `src/pages/learn/[locale]/[track]/[topic]/[id]/[doc].vue` — track-agnostic, prerendered per explanation-locale doc (content/track/trackLang/TOPIC/ID/locale.md — angle brackets in a top-level .vue comment would break the SFC parser); the collection is `articles` (content.config.ts, one collection for every track); canonical doc: `en` for lectures, the track language for the other tracks (`EN_CANONICAL` in media-index.mjs) |
| Dictionary playback state | `roadmapStore` `dictionaryQuery` (committed on Enter / the toolbar's filter button — never while typing) / `page` / `pageSize` + `dictionaryRows` (filter off: diacritic-folded prefix on the term in the open topic; filter on: substring on the rendered gloss, dictionary-wide via `searchInTranslation` + lazy `ensureSearchIndex` over `<section>/search.json`, one fetch) / `searchActive` / `pageCount` / `pagedRows` + `setDictionaryQuery` / `setSearchMode` / `setPageSize` / `setPage` (page resets on topic open/close and filter changes; the mode persists like Repeat); pure match helpers in `src/lib/dictionarySearch.ts` (`fold` / `glossName` / `matchesDictionaryQuery` — the gloss the search matches is exactly the gloss the table renders); `useAudioQueue` gained `loop` / `mode` (`'idle' \| 'single' \| 'page'`) / `playOne()` / `setLoop()` / `onCycle` — single runs skip the memorization gap; loop laps fire `onCycle` (the layout jumps the list back to the top) |

### Add a language to the roadmap
1. Translations: the sidebar `names` blocks already cover all 144 topics × 9 locales
   (`src/data/sidebars/library/dictionary/sidebar.json`).
2. Create `src/pages/<lang>/index.vue` — copy `en/index.vue`, switch
   `RoadmapShell lang="…"` and the `roadmap.<lang>_title` / `_intro` copy keys.
3. Flip the language in `src/data/tracks.ts` (`tracks.dictionary: '/learn/<lang>/dictionary'`).
4. UI chrome: `public/data/locales/<lang>.json` is optional — missing files
   fall back to English (per-key via `useCopy`).
5. Progress: `learned_items` is locale-scoped (`UNIQUE(user_id, locale, entity_id)`,
   schema.sql §13) — no per-language id namespacing needed.
