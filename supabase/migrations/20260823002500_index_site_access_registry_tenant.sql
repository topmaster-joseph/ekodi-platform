-- Cover the tenant foreign key used by customer-site role lookups and deletes.
create index if not exists site_access_registry_tenant_idx
  on public.site_access_registry(tenant_id)
  where tenant_id is not null;
