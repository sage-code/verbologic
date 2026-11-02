-- ════════════════════════════════════════════════════════════════════════════
--  Lower the active-language cap from 3 to 2 (the product rule: one learner,
--  two languages at a time).
--
--  Only replaces enforce_active_language_cap(); the trigger is unchanged. It is
--  checked on insert / status change, so a user already holding three keeps
--  them until they next add or restore a language.
--
--  Idempotent: CREATE OR REPLACE FUNCTION is safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

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
