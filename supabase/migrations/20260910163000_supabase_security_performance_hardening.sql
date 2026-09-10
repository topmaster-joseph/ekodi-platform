-- EKODI Supabase security/performance hardening 2026-09-10
-- Preserve intentional OAuth MCP anon execution; remove accidental public trigger execution.

do $$
begin
  if to_regprocedure('public.ensure_marketing_free_access_for_auth_user()') is not null then
    execute 'revoke execute on function public.ensure_marketing_free_access_for_auth_user() from public, anon, authenticated';
    execute 'grant execute on function public.ensure_marketing_free_access_for_auth_user() to service_role';
  end if;
  if to_regprocedure('public.provision_store_user_site()') is not null then
    execute 'revoke execute on function public.provision_store_user_site() from public, anon, authenticated';
    execute 'grant execute on function public.provision_store_user_site() to service_role';
  end if;
  if to_regprocedure('public.sync_store_public_profile_metadata()') is not null then
    execute 'revoke execute on function public.sync_store_public_profile_metadata() from public, anon, authenticated';
    execute 'grant execute on function public.sync_store_public_profile_metadata() to service_role';
  end if;
end $$;

alter function public.document_workspace_health() security invoker;
revoke all on function public.document_workspace_health() from public;
grant execute on function public.document_workspace_health() to anon, authenticated, service_role;

-- Auth RLS init-plan optimization.
alter policy site_access_registry_self_select on public.site_access_registry
  using (lower(email)=lower(coalesce((select auth.jwt())->>'email','')) or public.is_platform_admin());
alter policy site_access_requests_self_select on public.site_access_requests
  using (user_id=(select auth.uid()) or public.is_platform_admin());
alter policy site_access_requests_self_insert on public.site_access_requests
  with check (user_id=(select auth.uid()) and lower(email)=lower(coalesce((select auth.jwt())->>'email','')));
alter policy site_access_requests_self_update on public.site_access_requests
  using (user_id=(select auth.uid()) or public.is_platform_admin())
  with check (user_id=(select auth.uid()) or public.is_platform_admin());
alter policy mall_sales_events_authenticated_select on public.mall_sales_events
  using ((select auth.uid()) is not null);

alter policy document_files_select_own on public.document_files
  using ((select auth.uid())=owner_user_id);
alter policy document_files_insert_own on public.document_files
  with check ((select auth.uid())=owner_user_id and workspace_key='personal:'||(select auth.uid())::text);
alter policy document_files_update_own on public.document_files
  using ((select auth.uid())=owner_user_id)
  with check ((select auth.uid())=owner_user_id and workspace_key='personal:'||(select auth.uid())::text);
alter policy document_files_delete_own on public.document_files
  using ((select auth.uid())=owner_user_id);
alter policy document_versions_select_own on public.document_versions
  using ((select auth.uid())=owner_user_id);
alter policy document_versions_insert_own on public.document_versions
  with check ((select auth.uid())=owner_user_id and exists (
    select 1 from public.document_files d
    where d.id=document_versions.document_id and d.owner_user_id=(select auth.uid())
  ));
alter policy document_versions_delete_own on public.document_versions
  using ((select auth.uid())=owner_user_id);
alter policy document_ai_usage_select_own on public.document_ai_usage
  using ((select auth.uid())=owner_user_id);

-- Remove duplicate permissive SELECT evaluation while preserving write authority.
drop policy if exists church_staff_admin_write on church.staff;
create policy church_staff_admin_insert on church.staff for insert to authenticated
  with check (church_private.has_admin_access(tenant_id));
create policy church_staff_admin_update on church.staff for update to authenticated
  using (church_private.has_admin_access(tenant_id)) with check (church_private.has_admin_access(tenant_id));
create policy church_staff_admin_delete on church.staff for delete to authenticated
  using (church_private.has_admin_access(tenant_id));drop policy if exists church_services_admin_write on church.services;
create policy church_services_admin_insert on church.services for insert to authenticated
  with check (church_private.has_admin_access(tenant_id));
create policy church_services_admin_update on church.services for update to authenticated
  using (church_private.has_admin_access(tenant_id)) with check (church_private.has_admin_access(tenant_id));
create policy church_services_admin_delete on church.services for delete to authenticated
  using (church_private.has_admin_access(tenant_id));

drop policy if exists church_events_admin_write on church.events;
create policy church_events_admin_insert on church.events for insert to authenticated
  with check (church_private.has_admin_access(tenant_id));
create policy church_events_admin_update on church.events for update to authenticated
  using (church_private.has_admin_access(tenant_id)) with check (church_private.has_admin_access(tenant_id));
create policy church_events_admin_delete on church.events for delete to authenticated
  using (church_private.has_admin_access(tenant_id));

drop policy if exists bible_group_members_owner_write on public.bible_group_members;
drop policy if exists bible_group_members_owner_read on public.bible_group_members;
drop policy if exists bible_group_members_self_read on public.bible_group_members;
create policy bible_group_members_member_read on public.bible_group_members for select to authenticated
  using ((select auth.uid())=user_id or exists (select 1 from public.bible_groups g where g.id=group_id and g.owner_id=(select auth.uid())));
create policy bible_group_members_owner_insert on public.bible_group_members for insert to authenticated
  with check (exists (select 1 from public.bible_groups g where g.id=group_id and g.owner_id=(select auth.uid())));
create policy bible_group_members_owner_update on public.bible_group_members for update to authenticated
  using (exists (select 1 from public.bible_groups g where g.id=group_id and g.owner_id=(select auth.uid())))
  with check (exists (select 1 from public.bible_groups g where g.id=group_id and g.owner_id=(select auth.uid())));
create policy bible_group_members_owner_delete on public.bible_group_members for delete to authenticated
  using (exists (select 1 from public.bible_groups g where g.id=group_id and g.owner_id=(select auth.uid())));drop policy if exists bible_groups_owner_all on public.bible_groups;
create policy bible_groups_owner_insert on public.bible_groups for insert to authenticated
  with check ((select auth.uid())=owner_id);
create policy bible_groups_owner_update on public.bible_groups for update to authenticated
  using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy bible_groups_owner_delete on public.bible_groups for delete to authenticated
  using ((select auth.uid())=owner_id);

drop policy if exists bible_shared_own_write on public.bible_shared_journeys;
create policy bible_shared_own_insert on public.bible_shared_journeys for insert to authenticated
  with check ((select auth.uid())=user_id and exists (
    select 1 from public.bible_journeys j where j.id=journey_id and j.user_id=(select auth.uid())
  ) and public.bible_is_group_member(group_id));
create policy bible_shared_own_update on public.bible_shared_journeys for update to authenticated
  using ((select auth.uid())=user_id)
  with check ((select auth.uid())=user_id and exists (
    select 1 from public.bible_journeys j where j.id=journey_id and j.user_id=(select auth.uid())
  ) and public.bible_is_group_member(group_id));
create policy bible_shared_own_delete on public.bible_shared_journeys for delete to authenticated
  using ((select auth.uid())=user_id);

drop policy if exists site_access_registry_admin_write on public.site_access_registry;
create policy site_access_registry_admin_insert on public.site_access_registry for insert to authenticated
  with check (public.is_platform_admin());
create policy site_access_registry_admin_update on public.site_access_registry for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy site_access_registry_admin_delete on public.site_access_registry for delete to authenticated
  using (public.is_platform_admin());-- Cover foreign keys reported by the production database linter.
create index if not exists church_events_created_by_fk_idx on church.events(created_by);
create index if not exists church_services_created_by_fk_idx on church.services(created_by);
create index if not exists church_staff_user_id_fk_idx on church.staff(user_id);
create index if not exists church_audit_actor_fk_idx on church_private.audit_logs(actor_user_id);
create index if not exists church_care_created_by_fk_idx on church_private.care_tasks(created_by);
create index if not exists church_care_member_fk_idx on church_private.care_tasks(member_id);
create index if not exists church_members_created_by_fk_idx on church_private.members(created_by);
create index if not exists approval_events_actor_person_fk_idx on public.approval_events(actor_person_id);
create index if not exists approval_executions_requested_by_fk_idx on public.approval_executions(requested_by_person_id);
create index if not exists bible_conversations_journey_fk_idx on public.bible_conversations(journey_id);
create index if not exists bible_followups_journey_fk_idx on public.bible_followups(journey_id);
create index if not exists bible_groups_owner_fk_idx on public.bible_groups(owner_id);
create index if not exists bible_messages_user_fk_idx on public.bible_messages(user_id);
create index if not exists bible_practices_journey_fk_idx on public.bible_practices(journey_id);
create index if not exists bible_shared_journeys_journey_fk_idx on public.bible_shared_journeys(journey_id);
create index if not exists bible_shared_journeys_user_fk_idx on public.bible_shared_journeys(user_id);
create index if not exists business_os_actions_decided_by_fk_idx on public.business_os_actions(decided_by);
create index if not exists business_os_actions_requested_by_fk_idx on public.business_os_actions(requested_by);
create index if not exists business_os_actions_store_fk_idx on public.business_os_actions(store_id);
create index if not exists business_os_finance_recorded_by_fk_idx on public.business_os_finance_daily(recorded_by);
create index if not exists business_os_finance_store_fk_idx on public.business_os_finance_daily(store_id);
create index if not exists business_os_marketing_recorded_by_fk_idx on public.business_os_marketing_daily(recorded_by);
create index if not exists business_os_marketing_store_fk_idx on public.business_os_marketing_daily(store_id);
create index if not exists community_activity_actor_fk_idx on public.community_activity(actor_user_id);
create index if not exists community_circles_owner_fk_idx on public.community_circles(owner_user_id);create index if not exists community_blocks_blocked_user_fk_idx on public.community_connect_blocks(blocked_user_id);
create index if not exists community_reports_reporter_fk_idx on public.community_connect_reports(reporter_user_id);
create index if not exists community_reports_target_fk_idx on public.community_connect_reports(target_user_id);
create index if not exists document_versions_owner_fk_idx on public.document_versions(owner_user_id);
create index if not exists identity_audit_identity_fk_idx on public.identity_audit_logs(identity_id);
create index if not exists site_access_requests_reviewed_by_fk_idx on public.site_access_requests(reviewed_by);
create index if not exists site_access_requests_tenant_fk_idx on public.site_access_requests(tenant_id);
create index if not exists site_presentation_tenant_fk_idx on public.site_presentation_settings(tenant_id);
create index if not exists store_channel_menu_item_fk_idx on public.store_channel_menu_listings(menu_item_id);
create index if not exists trade_admin_grants_person_fk_idx on public.trade_admin_grants(person_id);
create index if not exists trade_company_members_person_fk_idx on public.trade_company_members(person_id);
create index if not exists trade_ack_person_fk_idx on public.trade_record_acknowledgements(person_id);
create index if not exists trade_records_created_by_person_fk_idx on public.trade_records(created_by_person_id);
create index if not exists trade_records_supersedes_fk_idx on public.trade_records(supersedes_id);

comment on function public.current_ekodi_mcp_identity() is
  'Intentional SECURITY DEFINER exception: OAuth MCP access tokens execute as anon DB role but must pass client_id, canonical/legacy audience and ekodi_ai_client claim checks before any identity projection.';
comment on function public.store_user_site_public_profile(text) is
  'Intentional public SECURITY DEFINER projection limited to non-sensitive storefront presentation fields; no private store/member data is returned.';