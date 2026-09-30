-- EKODI Trust Layer audit pseudonymization secret.
-- Generates the secret inside Supabase Vault and exposes it only to service_role.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'trust_audit_salt') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'trust_audit_salt',
      'EKODI Trust Layer audit pseudonymization salt'
    );
  end if;
end
$$;

create or replace function public.trust_runtime_audit_salt()
returns text
language sql
security definer
set search_path = pg_catalog, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'trust_audit_salt'
  order by created_at desc
  limit 1
$$;

revoke all on function public.trust_runtime_audit_salt() from public, anon, authenticated;
grant execute on function public.trust_runtime_audit_salt() to service_role;