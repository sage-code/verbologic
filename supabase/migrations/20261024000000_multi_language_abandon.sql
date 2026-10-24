-- ════════════════════════════════════════════════════════════════════════════
--  Verbologic — multi-language enrollments + abandon flow + server-side credits
--
--  Why: the schema implied a user has ONE target language (`profiles.target_lang`)
--  and kept credit state in the browser. The product rule is different:
--
--    · A user may hold up to TWO active target languages at a time.
--    · To add a third they must abandon one.
--    · Abandoning NEVER loses progress — the enrollment row and every
--      learned_item / listen_count stay exactly where they are.
--    · On abandon the user is asked whether to recuperate the language's
--      credits. If yes, they return to the user-level pool and the abandoned
--      language's allocation drops to zero.
--
--  Model chosen: STATUS FLAG, not row deletion.
--    `enrollments.status = 'abandoned'` + `abandoned_at`. The row survives, so
--    restoring a language is a status flip and all progress is still attached.
--    `abandoned_languages` is the append-only *event* record (when, how many
--    credits came back, what the progress snapshot was) — it is an audit trail,
--    never the source of truth for progress.
--
--  Credits move server-side:
--    `profiles.credit_pool`            the unallocated pool (bought credits)
--    `enrollments.credits_allocated`   the slice carved out for one language
--    `credit_ledger`                   unchanged — per-language consumption only
--
--  Idempotent: safe to re-run. Every object is guarded.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Drop the dead single-language column ────────────────────────────────
-- `profiles.target_lang` was never read by any client code — the real
-- per-language state has always been `enrollments`. Dropping it removes the
-- last place the schema claims a user has one language.
alter table public.profiles drop column if exists target_lang;

-- ── 2. Server-side credit pool ─────────────────────────────────────────────
-- The user-level balance: credits bought but not yet earmarked for a language.
alter table public.profiles
  add column if not exists credit_pool integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname  = 'profiles_credit_pool_non_negative'
  ) then
    alter table public.profiles
      add constraint profiles_credit_pool_non_negative check (credit_pool >= 0);
  end if;
end $$;

-- ── 3. Per-language allocation + abandon state on enrollments ──────────────
-- `credits_allocated` is the slice of the pool this language owns. It replaces
-- `credits_total` as the number the UI spends against; `credits_total` is kept
-- (deprecated) so nothing that still reads it breaks.
alter table public.enrollments
  add column if not exists credits_allocated integer not null default 0,
  add column if not exists abandoned_at      timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.enrollments'::regclass
      and conname  = 'enrollments_credits_allocated_non_negative'
  ) then
    alter table public.enrollments
      add constraint enrollments_credits_allocated_non_negative
      check (credits_allocated >= 0);
  end if;
end $$;

-- Backfill: before this migration the tier allotment was the only credit
-- number, so it becomes the initial allocation. No-op on an empty table.
update public.enrollments
   set credits_allocated = credits_total
 where credits_allocated = 0
   and credits_total > 0;

-- Widen the status check to admit 'abandoned'. The original constraint was
-- created inline, so Postgres named it `enrollments_status_check`.
alter table public.enrollments drop constraint if exists enrollments_status_check;
alter table public.enrollments
  add constraint enrollments_status_check
  check (status in ('active', 'trial', 'abandoned'));

-- ── 4. abandoned_languages — the abandon event log ─────────────────────────
-- Append-only. One row per abandon action. `credits_returned` is what went back
-- to the pool (0 when the user chose to forfeit), and the snapshot columns
-- record what the language looked like at that moment so the UI can say
-- "you had 412 words in Romanian" without joining live tables.
create table if not exists public.abandoned_languages (
  id                    bigint generated always as identity primary key,
  user_id               uuid not null references auth.users (id) on delete cascade,
  locale                text not null,
  enrollment_id         bigint references public.enrollments (id) on delete set null,
  credits_returned      integer not null default 0 check (credits_returned >= 0),
  credits_allocated_at  integer not null default 0 check (credits_allocated_at >= 0),
  words_learned_at      integer not null default 0 check (words_learned_at >= 0),
  abandoned_at          timestamptz not null default now()
);

-- FK index: `user_id` is the only column the app filters this table by.
create index if not exists abandoned_languages_user_idx
  on public.abandoned_languages (user_id, abandoned_at desc);

alter table public.abandoned_languages enable row level security;

drop policy if exists "Users can view own abandoned languages" on public.abandoned_languages;
create policy "Users can view own abandoned languages"
  on public.abandoned_languages for select using (auth.uid() = user_id);

-- Rows are written only by abandon_language() (security definer), so no insert
-- policy is granted to clients — a user cannot forge a credit return.

-- ── 5. enrollments_overview — expose allocation + abandon state ────────────
-- `credits_left` now derives from `credits_allocated` (the pool slice), not the
-- legacy tier allotment. `credits_total` stays in the projection for callers
-- that have not migrated yet.
--
-- DROP + CREATE, not CREATE OR REPLACE: the new `credits_allocated` column sits
-- in the middle of the projection, and CREATE OR REPLACE VIEW can only append
-- columns — inserting one fails with "cannot change name of view column".
-- Dropping is safe: a view holds no data, and it is recreated immediately.
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

-- Enforce the caller's identity when reading the view (base-table RLS applies).
alter view public.enrollments_overview set (security_invoker = true);

-- ── 6. Two-active-language cap ─────────────────────────────────────────────
-- The product rule: at most two languages in 'active'/'trial' at once. A third
-- requires abandoning one first. 'abandoned' rows do not count, which is what
-- makes "abandon then add" work.
--
-- The cap lives in one place — change active_language_cap below to move it.
-- An advisory lock keyed on the user serialises concurrent inserts so two
-- simultaneous enrollments cannot both pass the count.
create or replace function public.enforce_active_language_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  active_language_cap constant integer := 2;
  active_count integer;
begin
  -- Abandoned rows are exempt: they are history, not active languages.
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

-- ── 7. abandon_language() — the atomic abandon + credit return ─────────────
-- Doing this from the browser would take three round-trips (flip status, zero
-- the allocation, top up the pool) and would let a client forge the credit
-- amount. One security-definer function makes it atomic and authoritative.
--
--   p_locale      the language to abandon
--   p_recuperate  true  → the allocation returns to profiles.credit_pool
--                 false → the credits are forfeited (allocation still zeroed)
--
-- Returns the number of credits returned to the pool.
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

  -- Lock the row so a concurrent abandon cannot double-return the credits.
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

  -- Progress is untouched: only the status, the timestamp and the allocation
  -- change. learned_items / listen_counts keep every row.
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

-- ── 8. restore_language() — bring an abandoned language back ───────────────
-- A status flip. Progress was never removed, so the language reappears with
-- its words and listen counts intact. Credits are NOT re-allocated — the user
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

-- ── 9. allocate_credits() — move credits between the pool and a language ───
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

  -- The pool absorbs the difference: allocating takes out, de-allocating puts back.
  update public.profiles
     set credit_pool = credit_pool + (v_enrollment.credits_allocated - v_target)
   where id = v_user_id;

  return v_target;
end;
$$;

revoke execute on function public.allocate_credits(text, integer) from anon, public;
grant  execute on function public.allocate_credits(text, integer) to authenticated;

-- ── 10. add_credits() — buy credits into the pool ──────────────────────────
-- Replaces the localStorage-only Add-credits dialog. Until PayPal lands this is
-- the seam the checkout will call; it is deliberately a plain top-up with no
-- payment verification, so it must stay behind the payment flow once that
-- exists (see manual/MAINTENANCE.md §7).
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
