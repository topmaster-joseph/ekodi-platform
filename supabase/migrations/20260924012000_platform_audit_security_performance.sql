-- Platform audit hardening: 2026-09-24
-- Applied to production first after direct inspection, then recorded here to prevent drift.

-- Activity internals must never be directly callable by browser roles.
revoke all on function public.activity_is_workspace_operator(uuid) from public, anon, authenticated;
revoke all on function public.activity_record_participation_audit(uuid,uuid,text,jsonb,jsonb,text) from public, anon, authenticated;
revoke all on function public.activity_resolve_person(text,text,text,text) from public, anon, authenticated;

-- Activity admin RPCs are authenticated-only; their bodies perform tenant/operator authorization.
revoke all on function public.activity_admin_snapshot(text,text) from public, anon;
grant execute on function public.activity_admin_snapshot(text,text) to authenticated;

revoke all on function public.activity_admin_add_participant(text,text,text,text,text,integer,text,text,text,jsonb,text,text,text,text,boolean) from public, anon;
grant execute on function public.activity_admin_add_participant(text,text,text,text,text,integer,text,text,text,jsonb,text,text,text,text,boolean) to authenticated;

revoke all on function public.activity_admin_update_participation(uuid,text,text,integer,jsonb,text,text,text,text) from public, anon;
grant execute on function public.activity_admin_update_participation(uuid,text,text,integer,jsonb,text,text,text,text) to authenticated;

-- Keep only one identical review reply index.
drop index if exists public.store_platform_reviews_unanswered_idx;

-- Avoid two permissive SELECT policies running for authenticated worship reads.
drop policy if exists "published worship is public" on public.church_worship_materials;
drop policy if exists "church tenant admin can read all worship" on public.church_worship_materials;
drop policy if exists "authenticated worship access" on public.church_worship_materials;

create policy "published worship is public"
on public.church_worship_materials
for select
to anon
using (is_published = true);

create policy "authenticated worship access"
on public.church_worship_materials
for select
to authenticated
using (
  is_published = true
  or exists (
    select 1
    from public.site_access_registry r
    where lower(r.email) = lower(coalesce(auth.jwt() ->> 'email',''))
      and r.site_key = 'church'
      and r.status = 'active'
      and r.role::text = 'tenant_admin'
  )
);

comment on function public.activity_submit_participation(text,text,text,text,text,integer,text,text,text,text,boolean,text,text,jsonb) is
  'Intentional public SECURITY DEFINER exception: public Activity registration validates publication, registration-open, consent, capacity, input bounds and source before writing isolated participation data.';
comment on function public.mission_submit_event_application(text,text,text,text,integer,text,text,text,boolean,boolean,text) is
  'Intentional public SECURITY DEFINER exception: first-party public event application wrapper; consent and event-open checks are enforced before Activity registration.';
comment on function public.store_public_storefront(text) is
  'Intentional public SECURITY DEFINER projection limited to public storefront fields.';
comment on function public.store_user_site_public_profile(text) is
  'Intentional public SECURITY DEFINER projection limited to non-sensitive user-site presentation fields.';
comment on function public.store_user_site_public_snapshot(text) is
  'Intentional public SECURITY DEFINER projection limited to verified public store/menu/channel data.';
