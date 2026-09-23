-- Scope Community circles to an optional EKODI Workspace.
-- Some minimal/local baselines intentionally omit the Community provider schema;
-- in that case this additive migration is a safe no-op until the provider schema exists.
do $$
begin
  if to_regclass('public.community_circles') is not null then
    alter table public.community_circles
      add column if not exists workspace_tenant_id uuid references public.tenants(id) on delete cascade;

    create index if not exists community_circles_workspace_tenant_idx
      on public.community_circles(workspace_tenant_id, status, created_at desc);

    comment on column public.community_circles.workspace_tenant_id is
      'Optional owning EKODI Workspace. Null means global Community circle; non-null scopes the circle to a tenant/workspace.';
  end if;
end
$$;
