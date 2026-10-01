-- EKODI Supabase scale hardening.
-- Safe, additive changes only:
-- 1) add covering indexes for observed foreign keys when their tables exist;
-- 2) optimize church_worship_materials RLS auth.jwt() evaluation with init-plan SELECTs.
-- The migration is environment-tolerant so legacy DEV and canonical PROD can share one source of truth.

do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('church_private','attendance_records','member_id','church_private_attendance_records_member_id_idx'),
      ('church_private','attendance_records','recorded_by','church_private_attendance_records_recorded_by_idx'),
      ('church_private','attendance_records','service_id','church_private_attendance_records_service_id_idx'),
      ('church_private','group_memberships','created_by','church_private_group_memberships_created_by_idx'),
      ('church_private','group_memberships','group_id','church_private_group_memberships_group_id_idx'),
      ('church_private','group_memberships','member_id','church_private_group_memberships_member_id_idx'),
      ('church_private','groups','created_by','church_private_groups_created_by_idx'),
      ('church_private','groups','parent_group_id','church_private_groups_parent_group_id_idx'),
      ('church_private','ledger_entries','created_by','church_private_ledger_entries_created_by_idx'),
      ('church_private','members','auth_user_id','church_private_members_auth_user_id_idx'),
      ('church_private','offerings','created_by','church_private_offerings_created_by_idx'),
      ('church_private','offerings','member_id','church_private_offerings_member_id_idx'),
      ('church_private','receipt_requests','handled_by','church_private_receipt_requests_handled_by_idx'),
      ('church_private','receipt_requests','member_id','church_private_receipt_requests_member_id_idx'),
      ('church_private','receipt_requests','requester_user_id','church_private_receipt_requests_requester_user_id_idx'),
      ('private','person_contact_exchanges','sender_person_id','private_person_contact_exchanges_sender_person_id_idx'),
      ('private','person_share_contexts','role_id','private_person_share_contexts_role_id_idx'),
      ('public','activities','created_by','activities_created_by_idx'),
      ('public','activity_collab_shares','document_id','activity_collab_shares_document_id_idx'),
      ('public','activity_media_links','created_by','activity_media_links_created_by_idx'),
      ('public','activity_participation_audit','actor_user_id','activity_participation_audit_actor_user_id_idx'),
      ('public','activity_participation_audit','participation_id','activity_participation_audit_participation_id_idx'),
      ('public','activity_public_shares','created_by','activity_public_shares_created_by_idx'),
      ('public','church_worship_materials','created_by','church_worship_materials_created_by_idx'),
      ('public','person_workspace_relationships','workspace_tenant_id','person_workspace_relationships_workspace_tenant_id_idx'),
      ('public','store_commerce_sync_jobs','source_config_id','store_commerce_sync_jobs_source_config_id_idx'),
      ('public','store_delivery_actions','store_id','store_delivery_actions_store_id_idx')
    ) as v(schema_name, table_name, column_name, index_name)
  loop
    if to_regclass(format('%I.%I', item.schema_name, item.table_name)) is not null
       and exists (
         select 1
         from information_schema.columns
         where table_schema = item.schema_name
           and table_name = item.table_name
           and column_name = item.column_name
       )
    then
      execute format(
        'create index if not exists %I on %I.%I (%I)',
        item.index_name, item.schema_name, item.table_name, item.column_name
      );
    end if;
  end loop;
end
$$;

do $$
begin
  if to_regclass('public.church_worship_materials') is null
     or to_regclass('public.site_access_registry') is null then
    return;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='church_worship_materials'
      and policyname='church tenant admin can insert worship'
  ) then
    execute $sql$
      alter policy "church tenant admin can insert worship"
      on public.church_worship_materials
      with check (
        exists (
          select 1 from public.site_access_registry r
          where lower(r.email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
            and r.site_key = 'church'
            and r.status = 'active'
            and r.role::text = 'tenant_admin'
        )
      )
    $sql$;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='church_worship_materials'
      and policyname='church tenant admin can update worship'
  ) then
    execute $sql$
      alter policy "church tenant admin can update worship"
      on public.church_worship_materials
      using (
        exists (
          select 1 from public.site_access_registry r
          where lower(r.email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
            and r.site_key = 'church'
            and r.status = 'active'
            and r.role::text = 'tenant_admin'
        )
      )
      with check (
        exists (
          select 1 from public.site_access_registry r
          where lower(r.email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
            and r.site_key = 'church'
            and r.status = 'active'
            and r.role::text = 'tenant_admin'
        )
      )
    $sql$;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='church_worship_materials'
      and policyname='church tenant admin can read all worship'
  ) then
    execute $sql$
      alter policy "church tenant admin can read all worship"
      on public.church_worship_materials
      using (
        is_published = true
        or exists (
          select 1 from public.site_access_registry r
          where lower(r.email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
            and r.site_key = 'church'
            and r.status = 'active'
            and r.role::text = 'tenant_admin'
        )
      )
    $sql$;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='church_worship_materials'
      and policyname='church tenant admin can delete worship'
  ) then
    execute $sql$
      alter policy "church tenant admin can delete worship"
      on public.church_worship_materials
      using (
        exists (
          select 1 from public.site_access_registry r
          where lower(r.email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
            and r.site_key = 'church'
            and r.status = 'active'
            and r.role::text = 'tenant_admin'
        )
      )
    $sql$;
  end if;
end
$$;
