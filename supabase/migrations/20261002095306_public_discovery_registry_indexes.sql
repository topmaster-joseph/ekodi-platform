create index if not exists public_discovery_registry_published_modified_idx
  on public.public_discovery_registry (publication_status, modified_at desc)
  where publication_status = 'published';

create index if not exists public_discovery_registry_source_idx
  on public.public_discovery_registry (source_type, source_key);
