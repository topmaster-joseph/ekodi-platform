-- AUTH-BILLING-IDENTITY-001: read-only authenticated projection of the canonical
-- EKODI Person for membership. No client-selected person or provider/email matching.
-- Deploy and verify this SQL before shipping the D1 membership consumer.
create or replace function public.current_ekodi_billing_identity()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_account jsonb;
begin
  if v_auth_user_id is null then return null; end if;
  -- Do not accept a caller-supplied auth user id: the server derives it from JWT.
  v_account := public.ekodi_account_for_auth_user(v_auth_user_id);
  if v_account is null then return null; end if;
  if not exists (
    select 1 from public.people p
    where p.id = (v_account->>'person_id')::uuid and p.status = 'active'
  ) then return null; end if;
  if not exists (
    select 1 from public.login_identities li
    where li.auth_user_id = v_auth_user_id and li.status = 'active'
      and li.person_id = (v_account->>'person_id')::uuid
  ) then return null; end if;
  return jsonb_build_object(
    'person_id', v_account->>'person_id',
    'ekodi_id', v_account->>'ekodi_id',
    'auth_user_ids', v_account->'auth_user_ids',
    'verified_emails', v_account->'verified_emails'
  );
end;
$function$;

revoke all on function public.current_ekodi_billing_identity() from public, anon, authenticated;
grant execute on function public.current_ekodi_billing_identity() to authenticated;
comment on function public.current_ekodi_billing_identity() is
  'Read-only current-person membership identity and verified aliases; authorization is auth.uid(), not email or provider.';
