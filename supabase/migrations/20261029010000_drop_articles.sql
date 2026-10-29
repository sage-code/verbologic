-- The per-language text table is replaced by article_docs (one jsonb row per article).
drop table if exists public.articles;
