-- EKODI opts into Supabase's 2026-10-30 secure Data API defaults early.
-- Existing object ACLs are intentionally unchanged. These defaults apply only to
-- objects created later by the postgres role in the public schema.

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences
  from anon, authenticated, service_role;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC at the global default level.
-- A per-schema REVOKE cannot remove a privilege granted globally, so this one
-- intentionally has no IN SCHEMA clause. Public functions must grant EXECUTE back explicitly.
alter default privileges for role postgres
  revoke execute on functions
  from public;
