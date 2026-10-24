-- ════════════════════════════════════════════════════════════════════════════
--  Raise the active-language cap from 2 to 3.
--
--  The cap lives in one place — `active_language_cap` inside
--  enforce_active_language_cap() — so this migration only replaces that
--  function. The trigger itself is unchanged.
--
--  Idempotent: CREATE OR REPLACE FUNCTION is safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.enforce_active_language_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  active_language_cap constant integer := 3;
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
