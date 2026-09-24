-- Platform-wide security/performance hardening found during the 2026-09-24 production audit.
-- Keep intentional public SECURITY DEFINER entrypoints public, but remove direct execution
-- from internal helpers and authenticated-only administration RPCs.

begin;

-- Tenant administration RPCs require an authenticated operator. The functions
-- also enforce activity_is_workspace_operator(), but anon never needs EXECUTE.
revoke all on function public.activity_admin_add_participant(text,text,text,text,text,integer,text,text,text,jsonb,text,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.activity_admin_add_participant(text,text,text,text,text,integer,text,text,text,jsonb,text,text,text,text,boolean) to authenticated, service_role;

revoke all on function public.activity_admin_snapshot(text,text) from public, anon, authenticated;
grant execute on function public.activity_admin_snapshot(text,text) to authenticated, service_role;

revoke all on function public.activity_admin_update_participation(uuid,text,text,integer,jsonb,text,text,text,text) from public, anon, authenticated;
grant execute on function public.activity_admin_update_participation(uuid,text,text,integer,jsonb,text,text,text,text) to authenticated, service_role;

-- Internal helpers are only called from SECURITY DEFINER parents / server-side code.
-- They must not be callable directly through PostgREST by anon or authenticated users.
revoke all on function public.activity_is_workspace_operator(uuid) from public, anon, authenticated;
grant execute on function public.activity_is_workspace_operator(uuid) to service_role;

revoke all on function public.activity_record_participation_audit(uuid,uuid,text,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.activity_record_participation_audit(uuid,uuid,text,jsonb,jsonb,text) to service_role;

revoke all on function public.activity_resolve_person(text,text,text,text) from public, anon, authenticated;
grant execute on function public.activity_resolve_person(text,text,text,text) to service_role;

-- These Community tables intentionally have RLS with no direct-client policies.
-- Remove legacy table grants as defense in depth; Community API continues via service role.
do $
begin
  if to_regclass('public.community_activity') is not null then
    execute 'revoke all on table public.community_activity from anon, authenticated';
  end if;
  if to_regclass('public.community_circle_members') is not null then
    execute 'revoke all on table public.community_circle_members from anon, authenticated';
  end if;
  if to_regclass('public.community_circles') is not null then
    execute 'revoke all on table public.community_circles from anon, authenticated';
  end if;
  if to_regclass('public.community_profiles') is not null then
    execute 'revoke all on table public.community_profiles from anon, authenticated';
  end if;
end
$;

-- Remove an exact duplicate index reported by the production advisor.
-- store_platform_reviews_store_reply_idx is the canonical migration-owned copy.
drop index if exists public.store_platform_reviews_unanswered_idx;

-- Preserve published worship access for both signed-out and signed-in users while
-- avoiding two permissive SELECT policies for authenticated users.
drop policy if exists "published worship is public" on public.church_worship_materials;
create policy "published worship is public"
on public.church_worship_materials for select
to anon
using (is_published = true);

drop policy if exists "authenticated worship access" on public.church_worship_materials;
drop policy if exists "church tenant admin can read all worship" on public.church_worship_materials;
create policy "church tenant admin can read all worship"
on public.church_worship_materials for select
to authenticated
using (
  is_published = true
  or exists (
    select 1 from public.site_access_registry r
    where lower(r.email)=lower(coalesce(auth.jwt()->>'email',''))
      and r.site_key='church'
      and r.status='active'
      and r.role::text='tenant_admin'
  )
);

-- Explicitly document the intentional public SECURITY DEFINER exceptions.
comment on function public.activity_submit_participation(text,text,text,text,text,integer,text,text,text,text,boolean,text,text,jsonb) is
  'Intentional public registration RPC. Validates published activity and privacy consent before resolving a participant.';
comment on function public.mission_submit_event_application(text,text,text,text,integer,text,text,text,boolean,boolean,text) is
  'Intentional public mission application RPC. Honeypot and privacy-consent checks precede the Activity submission.';
comment on function public.current_ekodi_mcp_identity() is
  'Intentional SECURITY DEFINER exception: OAuth MCP access tokens execute as anon DB role but must pass EKODI client/audience claim checks.';
comment on function public.store_public_storefront(text) is
  'Intentional public SECURITY DEFINER storefront projection limited to public presentation data.';
comment on function public.store_user_site_public_profile(text) is
  'Intentional public SECURITY DEFINER user-site projection limited to public presentation data.';
comment on function public.store_user_site_public_snapshot(text) is
  'Intentional public SECURITY DEFINER user-site snapshot limited to public presentation data.';

commit;
