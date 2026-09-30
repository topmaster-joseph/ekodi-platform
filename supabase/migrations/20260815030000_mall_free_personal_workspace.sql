-- EKODI Mall: every verified Google identity may start as a free personal seller.
-- Preserve the existing base resolver + wrapper architecture introduced for
-- Marketing AI, then append a Mall-only synthetic personal workspace when no
-- account-level Mall workspace already exists.

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
  v_user_id uuid := auth.uid();
  v_person_id uuid;
  v_personal_key text;
begin
  v_rows := public.current_site_workspaces_base(p_site_key);

  if p_site_key = 'mall' and v_user_id is not null then
    if not exists (
      select 1
        from jsonb_array_elements(coalesce(v_rows, '[]'::jsonb)) item
       where item->>'workspace_kind' = 'personal'
    ) then
      select person_id
        into v_person_id
        from public.login_identities
       where auth_user_id = v_user_id
         and status = 'active'
       limit 1;

      v_personal_key := 'personal:' || coalesce(v_person_id::text, v_user_id::text);
      v_rows := coalesce(v_rows, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'workspace_key', v_personal_key,
          'workspace_kind', 'personal',
          'workspace_name', '개인 판매자',
          'site', 'mall',
          'tenant_id', null,
          'tenant', null,
          'role', 'member',
          'status', 'active',
          'plan', 'free',
          'store_id', null,
          'store', null,
          'store_name', null,
          'requires_handoff', true,
          'source', 'synthetic'
        )
      );
    end if;
  end if;

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

revoke all on function public.current_site_workspaces(text) from public, anon;
grant execute on function public.current_site_workspaces(text) to authenticated;

comment on function public.current_site_workspaces(text) is
  'Returns person-scoped service workspaces. Marketing personal and Mall free personal seller workspaces use verified one-time handoff without requiring pre-registration.';
