-- Public-safe readiness contract for the private EKODI Docs schema.
create or replace function public.document_workspace_health()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'ok', true,
    'contract', 'ekodi.documents.v1',
    'files', to_regclass('public.document_files') is not null,
    'versions', to_regclass('public.document_versions') is not null,
    'usage', to_regclass('public.document_ai_usage') is not null
  );
$$;
revoke all on function public.document_workspace_health() from public;
grant execute on function public.document_workspace_health() to anon, authenticated;
notify pgrst, 'reload schema';
