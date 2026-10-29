-- ════════════════════════════════════════════════════════════════════════════
--  article_docs — one row per article, every language inside (jsonb)
--
--  planning/content-in-database.md section 5. The source is
--  content/<track>/<TOPIC>/<ID>.json (scripts/lib/articles.mjs), imported by
--  scripts/seed-import.mjs. One row holds all nine languages because the
--  reading view shows two of them side by side and one request should fetch both:
--
--    select=entity_id,meta,en:locales->en,ro:locales->ro
--
--  The old per-language `articles` table is left untouched: the deployed site
--  still reads it. It is dropped at cutover, once the new client is live.
--
--  Public reference data: `anon` may SELECT, only the service role writes.
--  Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.article_docs (
  entity_id  text primary key,
  track      text not null check (track in ('dictionary', 'lectures', 'stories')),
  topic      text not null,
  -- Languages the article applies to as a LEARNED language; null = all of them.
  targets    text[],
  ord        integer not null default 0,
  related    text[] not null default '{}',
  -- paragraphsPerPage, minutes, context, terms, video, image …
  meta       jsonb not null default '{}'::jsonb,
  -- Derived by the importer from the keys of `locales`, so a list query does
  -- not have to download any article text (PostgREST cannot list jsonb keys).
  languages  text[] not null default '{}',
  -- { "<locale>": { title, summary, status, sourceSha, sections | paragraphs } }
  locales    jsonb not null,
  -- sha1 of the canonical article file; the importer skips unchanged rows.
  source_sha text,
  updated_at timestamptz not null default now()
);

create index if not exists article_docs_topic_idx on public.article_docs (track, topic, ord);

alter table public.article_docs enable row level security;

drop policy if exists "Content article docs are public" on public.article_docs;
create policy "Content article docs are public"
  on public.article_docs for select using (true);

drop trigger if exists article_docs_touch on public.article_docs;
create trigger article_docs_touch
  before update on public.article_docs
  for each row execute function public.touch_updated_at();
