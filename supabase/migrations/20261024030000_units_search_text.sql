-- ════════════════════════════════════════════════════════════════════════════
--  Searchable text for `units` — diacritic-folded, across every translation.
--
--  The bundled client search (src/lib/dictionarySearch.ts) does two things the
--  naive `ilike '%q%'` on `term` does not:
--
--    1. It FOLDS diacritics, so "mult" finds "mulțumesc" and "saptamana" finds
--       "săptămână". This matters for ro/hu/ru, where the target language is
--       full of diacritics a user will not type.
--    2. It searches EVERY translation, not just the term, so typing "hello"
--       finds the Romanian row for "salut".
--
--  A plain `ilike` on `term` fails both, which is why the first Phase 6 cut
--  returned 2 results where the bundled search returned 4.
--
--  Fix: one column holding the folded term plus every folded translation,
--  indexed with pg_trgm. It is maintained by a trigger rather than a generated
--  column because a generated expression cannot contain a subquery, and pulling
--  the values out of the `names` jsonb needs one.
--
--  `unaccent()` is not IMMUTABLE by default, so it is wrapped in an IMMUTABLE
--  function. That is safe here because the unaccent dictionary is fixed for the
--  life of the database.
--
--  Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists unaccent;

-- IMMUTABLE wrapper so the expression can be indexed.
create or replace function public.immutable_unaccent(text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$ select public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- Folded, searchable text: the term plus every translation, lowercased and
-- stripped of diacritics.
create or replace function public.units_search_text(p_term text, p_names jsonb)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(
    public.immutable_unaccent(
      coalesce(p_term, '') || ' ' || coalesce(
        (select string_agg(value, ' ') from jsonb_each_text(coalesce(p_names, '{}'::jsonb))),
        ''
      )
    )
  )
$$;

alter table public.units
  add column if not exists search_text text;

-- Backfill every existing row.
update public.units
   set search_text = public.units_search_text(term, names)
 where search_text is distinct from public.units_search_text(term, names);

-- Keep it in step on every write.
create or replace function public.units_search_text_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_text := public.units_search_text(new.term, new.names);
  return new;
end;
$$;

drop trigger if exists units_search_text_touch on public.units;
create trigger units_search_text_touch
  before insert or update of term, names on public.units
  for each row execute function public.units_search_text_touch();

-- Replace the term-only index with one on the folded text.
drop index if exists public.units_term_trgm_idx;

create index if not exists units_search_trgm_idx
  on public.units using gin (search_text gin_trgm_ops);
