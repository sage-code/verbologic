# Verbologic — open to-do list

Completed work is in git history (`git log`); this file keeps only what is still open. Content/file-count plan: `planning/content-in-database.md`.

## 🤔 Decisions needed
- [ ] Milestone scope — minimal / FE+data / full stack (Supabase+R2)

## Phase 3 — Content & interactivity
- [ ] `src/components/QuizEngine.vue`
- [ ] `src/stores/userStore.ts` (localStorage-first)

## Phase 5 — Supabase (credentials in `.env`)
- [ ] Set `NUXT_PUBLIC_*` in Cloudflare Workers Builds (values bake at build time)
- [ ] Login UI (magic link) → `userStore.signInWithEmail`
- [ ] AI Mentor credit spend → append to `credit_ledger` (negative deltas need a server-side policy/edge function)
- [ ] **PayPal top-up** — blocked on credentials; step-by-step setup (Client ID + Secret, Supabase Edge Function secrets, next-phase prompt) in [planning/paypall_settings.md](../planning/paypall_settings.md)

## Phase 1 — Account form (/account) + auth wiring
- [ ] You (dashboard): enable "Confirm email" + redirect allowlist `/account`; add `{{ .Token }}` to the e-mail template; enable an SMS provider for phone verification
- [ ] You (Workers Builds): set `NUXT_PUBLIC_SUPABASE_URL` / `NUXT_PUBLIC_SUPABASE_ANON_KEY` for production

## Leftovers from the old plans
- [ ] `usePhonetic.ts` imports all nine `src/data/alphabets/*.json` statically (about 1.9 MB gzip in a chunk every page prefetches): load the file for the open target on demand
- [ ] CH12T01 and CH12T02 hold expression topics that conflict with the no-expressions rule for the dictionary: remove them or convert them to word topics
- [ ] After approval, `./run.sh media prune` clears the R2 objects of words removed in the dictionary expansion
- [ ] Article storage and URLs: `planning/content-in-database.md`
