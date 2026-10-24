-- ════════════════════════════════════════════════════════════════════════════
--  Content tables — the dictionary/lectures/stories move out of the build.
--
--  Why: today the browser downloads a 2.19 MB search index plus one payload per
--  topic, and every unit adds a prerendered page. That is O(N) in files and
--  payload. With these tables the browser asks for ONE PAGE OF FIVE ROWS, so
--  the payload stops scaling with content
--  (planning/performance-and-content-refactor.md §14).
--
--  Shape mirrors seed/*.json exactly, so the importer is a straight copy:
--    seed/names.json        -> units.names        (shared 9-language map)
--    seed/units.<lang>.json -> units              (one row per entity+locale)
--    seed/articles.json     -> articles           (one row per entity+locale)
--    seed/topics.json       -> topics             (the structure layer)
--
--  Read model: content is PUBLIC reference data. `anon` may SELECT; only the
--  service role writes (the importer runs with the secret key). No user data
--  lives here, so there is nothing to scope to auth.uid().
--
--  Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. topics — the structure layer (chapters + topics) ────────────────────
-- The sidebar queries this instead of bundling every chapter/topic into the
-- build. `words` is the unit count so a topic card can show "12 words" without
-- counting rows.
create table if not exists public.topics (
  id      bigint generated always as identity primary key,
  track   text not null check (track in ('dictionary', 'lectures', 'stories')),
  chapter text not null,
  topic   text not null,
  title   text not null,
  "order" integer not null default 0,
  level   text,
  words   integer not null default 0 check (words >= 0),
  unique (track, topic)
);

create index if not exists topics_track_order_idx
  on public.topics (track, "order");

-- ── 2. units — one row per (entity, locale) ────────────────────────────────
-- `names` is the shared 9-language map, stored once per entity rather than
-- repeated in every language's row (§14.2 measured that as the biggest saving).
-- `term`/`ipa`/`audio` are the values for THIS row's locale.
create table if not exists public.units (
  id         bigint generated always as identity primary key,
  entity_id  text not null,
  locale     text not null,
  topic      text not null,
  track      text not null check (track in ('dictionary', 'lectures', 'stories')),
  kind       text,
  term       text not null,
  ipa        text,
  names      jsonb not null default '{}'::jsonb,
  audio_url  text,
  read_url   text,
  level      text,
  "order"    integer not null default 0,
  unique (entity_id, locale)
);

-- The page query: WHERE track=? AND topic=? AND locale=? ORDER BY "order"
-- LIMIT 5 OFFSET n. One composite index serves the filter and the sort.
create index if not exists units_page_idx
  on public.units (track, topic, locale, "order");

-- Search (§19 answer: pg_trgm). The index is on the normalized term so it
-- matches across diacritics, which matters for ro/hu/ru.
create extension if not exists pg_trgm;

create index if not exists units_term_trgm_idx
  on public.units using gin (lower(term) gin_trgm_ops);

-- ── 3. articles — one row per (entity, locale) ─────────────────────────────
-- `body` is the Markdown body with front matter stripped. `source_sha` lets the
-- importer skip unchanged rows on a re-import.
create table if not exists public.articles (
  id         bigint generated always as identity primary key,
  entity_id  text not null,
  locale     text not null,
  title      text not null default '',
  summary    text,
  body       text not null default '',
  status     text not null default 'draft' check (status in ('draft', 'review', 'published')),
  "order"    integer,
  related    text[],
  source_sha text,
  updated_at timestamptz not null default now(),
  unique (entity_id, locale)
);

create index if not exists articles_entity_idx
  on public.articles (entity_id, locale);

-- ── 4. Row Level Security — public read, service-role write ────────────────
-- Content is public reference data: anyone may read it, nobody may write it
-- with the publishable key. The importer uses the secret key, which bypasses
-- RLS, so no write policy is needed.
alter table public.topics   enable row level security;
alter table public.units    enable row level security;
alter table public.articles enable row level security;

drop policy if exists "Content topics are public" on public.topics;
create policy "Content topics are public"
  on public.topics for select using (true);

drop policy if exists "Content units are public" on public.units;
create policy "Content units are public"
  on public.units for select using (true);

drop policy if exists "Content articles are public" on public.articles;
create policy "Content articles are public"
  on public.articles for select using (true);

-- ── 5. updated_at touch for articles ───────────────────────────────────────
drop trigger if exists articles_touch on public.articles;
create trigger articles_touch
  before update on public.articles
  for each row execute function public.touch_updated_at();
