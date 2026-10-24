-- ════════════════════════════════════════════════════════════════════════════
--  Verbologic — Supabase schema (run once in the Dashboard SQL editor).
--
--  Tables:  profiles · enrollments · abandoned_languages · learned_items ·
--           credit_ledger · quiz_results · listen_counts
--  Plus:    enrollments_overview view (Library panels), RLS everywhere,
--           handle_new_user trigger, updated_at touch triggers, the
--           two-active-language cap, and the credit/abandon RPCs.
--
--  Security model: the publishable key maps callers to the Postgres `anon` /
--  `authenticated` roles; RLS scoping to auth.uid() is the security boundary.
--  Idempotent: safe to re-run (IF NOT EXISTS / DROP IF EXISTS guards).
--
--  This file is the whole schema in one place. Incremental changes also live in
--  supabase/migrations/ (applied with `supabase db push`); keep both in sync.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. profiles — per-user preferences + XP + the credit pool ──────────────
-- There is deliberately NO single `target_lang` column: a user holds up to two
-- active languages at a time, and that state lives in `enrollments`.
create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  instruction_lang text not null default 'en',
  active_domains   text[] default '{general}',
  xp               integer default 0,
  credit_pool      integer not null default 0 check (credit_pool >= 0),
  updated_at       timestamptz default now()
);

-- ── 2. enrollments — one row per user+language (orders / subscriptions) ────
-- `status = 'abandoned'` is the abandon flow: the row and all progress stay,
-- only the status flips. `credits_allocated` is the slice of the user-level
-- pool this language owns; `credits_total` is the legacy tier allotment, kept
-- for compatibility.
create table if not exists public.enrollments (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references auth.users (id) on delete cascade,
  locale            text not null,
  tier_id           text not null check (tier_id in ('prospect', 'starter', 'prepaid_credit')),
  status            text not null default 'active' check (status in ('active', 'trial', 'abandoned')),
  credits_total     integer not null default 0,
  credits_allocated integer not null default 0 check (credits_allocated >= 0),
  abandoned_at      timestamptz,
  started_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, locale)
);

-- ── 2b. abandoned_languages — append-only abandon event log ────────────────
-- One row per abandon action, with a progress snapshot so the UI can say
-- "you had 412 words in Romanian" without joining live tables. Written only by
-- abandon_language(); clients get select-own and nothing else.
create table if not exists public.abandoned_languages (
  id                   bigint generated always as identity primary key,
  user_id              uuid not null references auth.users (id) on delete cascade,
  locale               text not null,
  enrollment_id        bigint references public.enrollments (id) on delete set null,
  credits_returned     integer not null default 0 check (credits_returned >= 0),
  credits_allocated_at integer not null default 0 check (credits_allocated_at >= 0),
  words_learned_at     integer not null default 0 check (words_learned_at >= 0),
  abandoned_at         timestamptz not null default now()
);

create index if not exists abandoned_languages_user_idx
  on public.abandoned_languages (user_id, abandoned_at desc);

-- ── 3. learned_items — source of truth for "Words learned" (idempotent) ────
-- Locale-scoped: gallery concept ids (e.g. W0001) can exist in several target
-- languages, so the same word must be learnable per language independently.
create table if not exists public.learned_items (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  locale     text not null,
  entity_id  text not null,               -- entity/gallery record id, e.g. word_salut
  created_at timestamptz not null default now(),
  unique (user_id, locale, entity_id)
);

-- ── 4. credit_ledger — append-only credit movements (AI Mentor spend, later).
--    Never mutate consumed/left counters by hand; derive from SUM(delta).
create table if not exists public.credit_ledger (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  locale     text not null,
  delta      integer not null check (delta <> 0),  -- + top-up, − consumption
  reason     text not null default 'ai_mentor',
  ref_id     text,                                  -- dedupe/action reference
  created_at timestamptz not null default now()
);

-- One ledger entry per action: skip identical repeat movements.
create unique index if not exists credit_ledger_dedupe
  on public.credit_ledger (user_id, locale, reason, ref_id)
  where ref_id is not null;

-- ── 5. quiz_results — attempt history (Phase 3 QuizEngine) ──────────────────
create table if not exists public.quiz_results (
  id              bigint generated always as identity primary key,
  user_id         uuid references auth.users (id) on delete cascade,
  quiz_id         text not null,
  score           integer not null,
  total_questions integer not null,
  passed          boolean not null,
  created_at      timestamptz not null default now()
);

-- ── 6. enrollments_overview — one query for the Library panels ─────────────
--    credits_consumed = −SUM(negative deltas) · credits_left = allocated − consumed
--    words_learned    = COUNT(learned_items) — both derived, never stored.
--    DROP + CREATE (not CREATE OR REPLACE): a view holds no data, and replacing
--    cannot insert a column in the middle of the projection.
drop view if exists public.enrollments_overview;

create view public.enrollments_overview as
select
  e.user_id,
  e.locale,
  e.tier_id,
  e.status,
  e.credits_total,
  e.credits_allocated,
  coalesce(s.consumed, 0)                                    as credits_consumed,
  greatest(e.credits_allocated - coalesce(s.consumed, 0), 0) as credits_left,
  coalesce(l.learned, 0)                                     as words_learned,
  e.started_at,
  e.updated_at,
  e.abandoned_at
from public.enrollments e
left join (
  select user_id, locale, -sum(delta) as consumed
  from public.credit_ledger
  where delta < 0
  group by user_id, locale
) s on s.user_id = e.user_id and s.locale = e.locale
left join (
  select user_id, locale, count(*) as learned
  from public.learned_items
  group by user_id, locale
) l on l.user_id = e.user_id and l.locale = e.locale;

-- ── 7. updated_at touch triggers ────────────────────────────────────────────
-- search_path pinned (database-linter 0011).
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists enrollments_touch on public.enrollments;
create trigger enrollments_touch
  before update on public.enrollments
  for each row execute function public.touch_updated_at();

-- ── 8. Auto-create a profile on signup ──────────────────────────────────────
-- security definer is required (fires on auth.users); search_path pinned (0011)
-- and direct RPC execution revoked (0028/0029) — the trigger needs no grants.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.handle_new_user() from public;

-- ── 9. Row Level Security ───────────────────────────────────────────────────
alter table public.profiles            enable row level security;
alter table public.enrollments         enable row level security;
alter table public.abandoned_languages enable row level security;
alter table public.learned_items       enable row level security;
alter table public.credit_ledger       enable row level security;
alter table public.quiz_results        enable row level security;

-- profiles: read/update own
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- enrollments: own rows only
drop policy if exists "Users can view own enrollments" on public.enrollments;
create policy "Users can view own enrollments" on public.enrollments
  for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own enrollments" on public.enrollments;
create policy "Users can insert own enrollments" on public.enrollments
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own enrollments" on public.enrollments;
create policy "Users can update own enrollments" on public.enrollments
  for update using (auth.uid() = user_id);

-- abandoned_languages: read own only. Rows are written by abandon_language()
-- (security definer), so no insert policy is granted — a client cannot forge a
-- credit return.
drop policy if exists "Users can view own abandoned languages" on public.abandoned_languages;
create policy "Users can view own abandoned languages"
  on public.abandoned_languages for select using (auth.uid() = user_id);

-- learned_items: own rows; inserted via mark-as-learned, never edited
drop policy if exists "Users can view own learned items" on public.learned_items;
create policy "Users can view own learned items" on public.learned_items
  for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own learned items" on public.learned_items;
create policy "Users can insert own learned items" on public.learned_items
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users can delete own learned items" on public.learned_items;
create policy "Users can delete own learned items" on public.learned_items
  for delete using (auth.uid() = user_id);

-- credit_ledger: read own; users may append top-ups (+) but not self-spend (−)
drop policy if exists "Users can view own credit ledger" on public.credit_ledger;
create policy "Users can view own credit ledger" on public.credit_ledger
  for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own credit topups" on public.credit_ledger;
create policy "Users can insert own credit topups" on public.credit_ledger
  for insert with check (auth.uid() = user_id and delta > 0);

-- quiz_results: read + insert own
drop policy if exists "Users can view own quiz results" on public.quiz_results;
create policy "Users can view own quiz results" on public.quiz_results
  for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own quiz results" on public.quiz_results;
create policy "Users can insert own quiz results" on public.quiz_results
  for insert with check (auth.uid() = user_id);

-- Enforce the caller's identity when reading the view (base-table RLS applies).
alter view public.enrollments_overview set (security_invoker = true);

-- ── 10. Account fields (Phase 1 — /account form) ────────────────────────────
-- display_name + avatar_url live here; e-mail/phone + their verification
-- state stay authoritative in auth.users (read from the session, no mirrors
-- that can drift).
alter table public.profiles
  add column if not exists display_name text,
  add column if not exists avatar_url   text;

-- ── 11. Avatars storage (Phase 1) ───────────────────────────────────────────
-- Bucket: public read (the header <img> needs no signed URLs), owner-only
-- writes confined to avatars/{auth.uid()}/…, 2 MB, image types only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Avatars are publicly readable" on storage.objects;
create policy "Avatars are publicly readable"
  on storage.objects for select using (bucket_id = 'avatars');

drop policy if exists "Users can upload own avatar" on storage.objects;
create policy "Users can upload own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can update own avatar" on storage.objects;
create policy "Users can update own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete own avatar" on storage.objects;
create policy "Users can delete own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── 12. handle_new_user seeds the display name (OAuth / signup metadata) ────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.handle_new_user() from public;

-- ── 13. Locale-scoped learning progress (roadmap / gallery ids) ─────────────
-- Gallery concept ids (e.g. W0001 in audio/ro and audio/en) must be learnable
-- per target language independently, so uniqueness moves from
-- (user_id, entity_id) to (user_id, locale, entity_id). The locale column was
-- already populated on every row, so no back-fill is needed. Idempotent.
alter table public.learned_items
  drop constraint if exists learned_items_user_id_entity_id_key;
alter table public.learned_items
  drop constraint if exists learned_items_user_locale_entity_key;
alter table public.learned_items
  add constraint learned_items_user_locale_entity_key unique (user_id, locale, entity_id);

-- ── 14. listen_counts — full-listen counter per entity (auto-completion) ────
--    The app marks learned_items when the count crosses a multiple of 5.
--    The client upserts the running count (single-device truth, mirroring the
--    localStorage fallback used for signed-out visitors). Idempotent.
create table if not exists public.listen_counts (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  locale     text not null,
  entity_id  text not null,               -- entity/gallery record id, e.g. word_salut
  count      integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  unique (user_id, locale, entity_id)
);

alter table public.listen_counts enable row level security;
drop policy if exists "Users can view own listen counts" on public.listen_counts;
create policy "Users can view own listen counts"
  on public.listen_counts for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own listen counts" on public.listen_counts;
create policy "Users can insert own listen counts"
  on public.listen_counts for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update own listen counts" on public.listen_counts;
create policy "Users can update own listen counts"
  on public.listen_counts for update to authenticated using (auth.uid() = user_id);

drop trigger if exists listen_counts_touch on public.listen_counts;
create trigger listen_counts_touch
  before update on public.listen_counts
  for each row execute function public.touch_updated_at();

-- ── 15. Two-active-language cap ─────────────────────────────────────────────
-- A user may hold at most two languages in 'active'/'trial' at once; a third
-- requires abandoning one first. 'abandoned' rows are exempt, which is what
-- makes "abandon then add" work. The cap lives in one place — change
-- active_language_cap below to move it. An advisory lock keyed on the user
-- serialises concurrent inserts so two simultaneous enrollments cannot both
-- pass the count.
create or replace function public.enforce_active_language_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  active_language_cap constant integer := 3;
  active_count integer;
begin
  if new.status = 'abandoned' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.user_id::text));

  select count(*)
    into active_count
    from public.enrollments e
   where e.user_id = new.user_id
     and e.status <> 'abandoned'
     and e.id is distinct from new.id;

  if active_count >= active_language_cap then
    raise exception
      'active language cap reached (% of %) — abandon a language before adding another',
      active_count, active_language_cap
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists enrollments_active_cap on public.enrollments;
create trigger enrollments_active_cap
  before insert or update of status on public.enrollments
  for each row execute function public.enforce_active_language_cap();

-- ── 16. abandon_language() — atomic abandon + credit return ─────────────────
-- Doing this from the browser would take three round-trips (flip status, zero
-- the allocation, top up the pool) and would let a client forge the credit
-- amount. One security-definer function makes it atomic and authoritative.
--
--   p_locale      the language to abandon
--   p_recuperate  true  → the allocation returns to profiles.credit_pool
--                 false → the credits are forfeited (allocation still zeroed)
--
-- Progress is never touched: learned_items / listen_counts keep every row.
create or replace function public.abandon_language(
  p_locale     text,
  p_recuperate boolean default true
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id     uuid := auth.uid();
  v_enrollment  public.enrollments%rowtype;
  v_returned    integer := 0;
  v_words       integer := 0;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  select * into v_enrollment
    from public.enrollments
   where user_id = v_user_id
     and locale  = p_locale
   for update;

  if not found then
    raise exception 'no enrollment for locale %', p_locale using errcode = 'no_data_found';
  end if;

  if v_enrollment.status = 'abandoned' then
    raise exception 'locale % is already abandoned', p_locale using errcode = 'check_violation';
  end if;

  if p_recuperate then
    v_returned := v_enrollment.credits_allocated;
  end if;

  select count(*) into v_words
    from public.learned_items
   where user_id = v_user_id
     and locale  = p_locale;

  update public.enrollments
     set status            = 'abandoned',
         abandoned_at      = now(),
         credits_allocated = 0
   where id = v_enrollment.id;

  if v_returned > 0 then
    update public.profiles
       set credit_pool = credit_pool + v_returned
     where id = v_user_id;
  end if;

  insert into public.abandoned_languages (
    user_id, locale, enrollment_id,
    credits_returned, credits_allocated_at, words_learned_at
  ) values (
    v_user_id, p_locale, v_enrollment.id,
    v_returned, v_enrollment.credits_allocated, v_words
  );

  return v_returned;
end;
$$;

revoke execute on function public.abandon_language(text, boolean) from anon, public;
grant  execute on function public.abandon_language(text, boolean) to authenticated;

-- ── 17. restore_language() — bring an abandoned language back ───────────────
-- A status flip. Progress was never removed, so the language reappears with its
-- words and listen counts intact. Credits are NOT re-allocated — the user
-- re-earmarks them from the pool with the per-language settings dialog.
create or replace function public.restore_language(p_locale text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  update public.enrollments
     set status       = 'active',
         abandoned_at = null
   where user_id = v_user_id
     and locale  = p_locale
     and status  = 'abandoned';

  if not found then
    raise exception 'no abandoned enrollment for locale %', p_locale
      using errcode = 'no_data_found';
  end if;
end;
$$;

revoke execute on function public.restore_language(text) from anon, public;
grant  execute on function public.restore_language(text) to authenticated;

-- ── 18. allocate_credits() — move credits between the pool and a language ───
-- The gear dialog's Apply. Server-side so the pool cannot be inflated from the
-- browser: the ceiling is the language's current allocation plus whatever is
-- still unallocated in the pool.
create or replace function public.allocate_credits(
  p_locale  text,
  p_credits integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id    uuid := auth.uid();
  v_enrollment public.enrollments%rowtype;
  v_pool       integer;
  v_ceiling    integer;
  v_target     integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if p_credits < 0 then
    raise exception 'credits cannot be negative' using errcode = 'check_violation';
  end if;

  select * into v_enrollment
    from public.enrollments
   where user_id = v_user_id
     and locale  = p_locale
   for update;

  if not found then
    raise exception 'no enrollment for locale %', p_locale using errcode = 'no_data_found';
  end if;
  if v_enrollment.status = 'abandoned' then
    raise exception 'cannot allocate credits to an abandoned language'
      using errcode = 'check_violation';
  end if;

  select credit_pool into v_pool
    from public.profiles
   where id = v_user_id
   for update;

  v_ceiling := v_enrollment.credits_allocated + coalesce(v_pool, 0);
  v_target  := least(p_credits, v_ceiling);

  update public.enrollments
     set credits_allocated = v_target
   where id = v_enrollment.id;

  update public.profiles
     set credit_pool = credit_pool + (v_enrollment.credits_allocated - v_target)
   where id = v_user_id;

  return v_target;
end;
$$;

revoke execute on function public.allocate_credits(text, integer) from anon, public;
grant  execute on function public.allocate_credits(text, integer) to authenticated;

-- ── 19. add_credits() — buy credits into the pool ───────────────────────────
-- Replaces the localStorage-only Add-credits dialog. Until PayPal lands this is
-- the seam the checkout will call; it is a plain top-up with no payment
-- verification, so it must stay behind the payment flow once that exists.
create or replace function public.add_credits(p_credits integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_pool    integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if p_credits <= 0 then
    raise exception 'credits must be positive' using errcode = 'check_violation';
  end if;

  update public.profiles
     set credit_pool = credit_pool + p_credits
   where id = v_user_id
  returning credit_pool into v_pool;

  if v_pool is null then
    raise exception 'no profile for caller' using errcode = 'no_data_found';
  end if;

  return v_pool;
end;
$$;

revoke execute on function public.add_credits(integer) from anon, public;
grant  execute on function public.add_credits(integer) to authenticated;