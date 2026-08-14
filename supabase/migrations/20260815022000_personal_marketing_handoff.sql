-- Personal Marketing AI is a real authenticated workspace too. Keep the base resolver
-- additive, then wrap it so the synthetic personal workspace receives the same verified
-- one-time handoff path as business and organization workspaces.

alter function public.current_site_workspaces(text)
  rename to current_site_workspaces_base;

create or replace function public.current_site_workspaces(p_site_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_rows jsonb;
  v_result jsonb;
begin
  v_rows := public.current_site_workspaces_base(p_site_key);

  select coalesce(
    jsonb_agg(
      case
        when item->>'source' = 'synthetic'
         and item->>'workspace_kind' = 'personal'
         and p_site_key = 'marketing'
        then item || jsonb_build_object(
          'requires_handoff', true,
          'status', 'active'
        )
        else item
      end
    ),
    '[]'::jsonb
  )
  into v_result
  from jsonb_array_elements(coalesce(v_rows, '[]'::jsonb)) item;

  return v_result;
end
$$;

revoke all on function public.current_site_workspaces_base(text) from public, anon, authenticated;
revoke all on function public.current_site_workspaces(text) from public, anon;
grant execute on function public.current_site_workspaces(text) to authenticated;

comment on function public.current_site_workspaces(text) is
  'Returns person-scoped service workspaces. Marketing personal workspace uses the same verified handoff path as tenant workspaces.';
