-- Keep Author AI usage-ledger chapter lookups and FK maintenance efficient as usage grows.
create index if not exists idx_author_ai_usage_chapter_time
  on public.author_ai_usage(chapter_id, created_at desc)
  where chapter_id is not null;
