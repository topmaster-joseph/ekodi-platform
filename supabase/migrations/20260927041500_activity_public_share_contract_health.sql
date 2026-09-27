begin;

create or replace function public.activity_public_share_contract()
returns jsonb
language sql
stable
set search_path=public,auth,extensions,pg_temp
as $$
  select jsonb_build_object(
    'ok',true,
    'contract','ekodi.activity-public-share.v1',
    'fields',jsonb_build_array('seq','name','status','party_size'),
    'contact_fields',false,
    'token_storage','sha256',
    'max_expiry_days',31
  );
$$;

revoke all on function public.activity_public_share_contract() from public, anon, authenticated;
grant execute on function public.activity_public_share_contract() to anon, authenticated, service_role;
comment on function public.activity_public_share_contract() is
  'Public non-sensitive health contract for the expiring read-only applicant-share projection.';

commit;
