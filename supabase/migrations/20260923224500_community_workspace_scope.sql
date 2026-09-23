-- Scope Community circles to an optional EKODI Workspace without changing global Community circles.
alter table public.community_circles
  add column if not exists workspace_tenant_id uuid references public.tenants(id) on delete cascade;

create index if not exists community_circles_workspace_tenant_idx
  on public.community_circles(workspace_tenant_id, status, created_at desc);

comment on column public.community_circles.workspace_tenant_id is
  'Optional owning EKODI Workspace. Null means global Community circle; non-null scopes the circle to a tenant/workspace.';
