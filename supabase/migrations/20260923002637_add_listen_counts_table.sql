-- listen_counts — full-listen counter per entity (auto-completion).
--
-- Applied to the remote project from the Dashboard SQL editor on 2026-09-23
-- (recorded in supabase_migrations.schema_migrations as version 20260923002637).
-- This file mirrors that statement verbatim so the local migration history
-- matches the remote one and `supabase db push` can compute a correct diff.
-- It is also section 14 of supabase/schema.sql.
--
-- The app marks learned_items when the count crosses a multiple of 5. The
-- client upserts the running count (single-device truth, mirroring the
-- localStorage fallback used for signed-out visitors).

create table if not exists public.listen_counts (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  locale     text not null,
  entity_id  text not null,
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
