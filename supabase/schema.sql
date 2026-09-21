-- ════════════════════════════════════════════════════════════════════════════
--  Verbologic — Supabase schema (run once in the Dashboard SQL editor).
--
--  Tables:  profiles · enrollments · learned_items · credit_ledger · quiz_results
--  Plus:    enrollments_overview view (Library panels), RLS everywhere,
--           handle_new_user trigger, updated_at touch triggers.
--
--  Security model: the publishable key maps callers to the Postgres `anon` /
--  `authenticated` roles; RLS scoping to auth.uid() is the security boundary.
--  Idempotent: safe to re-run (IF NOT EXISTS / DROP IF EXISTS guards).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. profiles — per-user preferences + XP ─────────────────────────────────
create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  instruction_lang text not null default 'en',
  target_lang      text not null default 'es',
  active_domains   text[] default '{general}',
  xp               integer default 0,
  updated_at       timestamptz default now()
);

-- ── 2. enrollments — one row per user+language (orders / subscriptions) ────
create table if not exists public.enrollments (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  locale        text not null,
  tier_id       text not null check (tier_id in ('prospect', 'starter', 'prepaid_credit')),
  status        text not null default 'active' check (status in ('active', 'trial')),
  credits_total integer not null default 0,
  started_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, locale)
);

-- ── 3. learned_items — source of truth for "Words learned" (idempotent) ────
create table if not exists public.learned_items (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  locale     text not null,
  entity_id  text not null,               -- public/data/entities id, e.g. word_salut
  created_at timestamptz not null default now(),
  unique (user_id, entity_id)
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
--    credits_consumed = −SUM(negative deltas) · credits_left = total − consumed
--    words_learned    = COUNT(learned_items) — both derived, never stored.
create or replace view public.enrollments_overview as
select
  e.user_id,
  e.locale,
  e.tier_id,
  e.status,
  e.credits_total,
  coalesce(s.consumed, 0)                                as credits_consumed,
  greatest(e.credits_total - coalesce(s.consumed, 0), 0) as credits_left,
  coalesce(l.learned, 0)                                 as words_learned,
  e.started_at,
  e.updated_at
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
$$ language plpgsql;

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
alter table public.profiles      enable row level security;
alter table public.enrollments   enable row level security;
alter table public.learned_items enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.quiz_results  enable row level security;

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