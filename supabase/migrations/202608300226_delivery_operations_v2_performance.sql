-- Delivery Operations V2 performance follow-up.
-- Keep read and write policies disjoint so SELECT does not evaluate duplicate permissive policies.

create index if not exists delivery_provider_store_tenant_idx
  on public.delivery_provider_connections(store_id, tenant_id)
  where store_id is not null;
create index if not exists delivery_policy_store_tenant_idx
  on public.delivery_policies(store_id, tenant_id)
  where store_id is not null;
create index if not exists delivery_decision_provider_idx
  on public.delivery_decisions(provider_connection_id)
  where provider_connection_id is not null;
create index if not exists delivery_decision_policy_idx
  on public.delivery_decisions(policy_id)
  where policy_id is not null;

drop policy if exists delivery_provider_write on public.delivery_provider_connections;
create policy delivery_provider_insert on public.delivery_provider_connections
  for insert to authenticated
  with check (public.has_tenant_admin_access(tenant_id) or (store_id is not null and public.has_store_private_access(store_id)));
create policy delivery_provider_update on public.delivery_provider_connections
  for update to authenticated
  using (public.has_tenant_admin_access(tenant_id) or (store_id is not null and public.has_store_private_access(store_id)))
  with check (public.has_tenant_admin_access(tenant_id) or (store_id is not null and public.has_store_private_access(store_id)));
create policy delivery_provider_delete on public.delivery_provider_connections
  for delete to authenticated
  using (public.has_tenant_admin_access(tenant_id) or (store_id is not null and public.has_store_private_access(store_id)));

drop policy if exists delivery_policy_write on public.delivery_policies;
create policy delivery_policy_insert on public.delivery_policies
  for insert to authenticated
  with check (public.has_tenant_admin_access(tenant_id) or (store_id is not null and public.has_store_private_access(store_id)));
create policy delivery_policy_update on public.delivery_policies
  for update to authenticated
  using (public.has_tenant_admin_access(tenant_id) or (store_id is not null and public.has_store_private_access(store_id)))
  with check (public.has_tenant_admin_access(tenant_id) or (store_id is not null and public.has_store_private_access(store_id)));
create policy delivery_policy_delete on public.delivery_policies
  for delete to authenticated
  using (public.has_tenant_admin_access(tenant_id) or (store_id is not null and public.has_store_private_access(store_id)));

drop policy if exists delivery_settlement_write on public.delivery_settlement_drafts;
create policy delivery_settlement_insert on public.delivery_settlement_drafts
  for insert to authenticated
  with check (
    settlement_executed = false and
    (public.has_tenant_admin_access(tenant_id) or (store_id is not null and public.has_store_private_access(store_id)))
  );
create policy delivery_settlement_update on public.delivery_settlement_drafts
  for update to authenticated
  using (public.has_tenant_admin_access(tenant_id) or (store_id is not null and public.has_store_private_access(store_id)))
  with check (
    settlement_executed = false and
    (public.has_tenant_admin_access(tenant_id) or (store_id is not null and public.has_store_private_access(store_id)))
  );
create policy delivery_settlement_delete on public.delivery_settlement_drafts
  for delete to authenticated
  using (public.has_tenant_admin_access(tenant_id) or (store_id is not null and public.has_store_private_access(store_id)));
