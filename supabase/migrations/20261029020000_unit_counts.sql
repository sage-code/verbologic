-- Rows per (track, locale, topic). The sidebar needs only these counts, and asking
-- for every unit row hit the API's 1000-row cap: the last topics of a long track
-- (CH15T03 and later) counted as empty and were greyed out.
create or replace view public.unit_counts
with (security_invoker = true) as
select track, locale, topic, count(*)::int as n
from public.units
group by track, locale, topic;

grant select on public.unit_counts to anon, authenticated;
