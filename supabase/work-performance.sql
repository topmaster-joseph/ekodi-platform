-- EKODI Work performance hardening after the core schema.
-- Cover foreign keys used by ownership lookups and evaluate auth.uid() once per statement.

create index if not exists work_jobs_organization_idx on public.work_jobs(organization_id);
create index if not exists work_jobs_created_by_idx on public.work_jobs(created_by);
-- owner_user_id already has a unique index from the UNIQUE constraint.
drop index if exists public.work_org_owner_idx;

drop policy if exists work_profiles_own_select on public.work_profiles;
drop policy if exists work_profiles_own_insert on public.work_profiles;
drop policy if exists work_profiles_own_update on public.work_profiles;
create policy work_profiles_own_select on public.work_profiles for select to authenticated using (user_id = (select auth.uid()));
create policy work_profiles_own_insert on public.work_profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy work_profiles_own_update on public.work_profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists work_org_owner_insert on public.work_organizations;
drop policy if exists work_org_owner_update on public.work_organizations;
drop policy if exists work_org_owner_delete on public.work_organizations;
create policy work_org_owner_insert on public.work_organizations for insert to authenticated with check (owner_user_id = (select auth.uid()));
create policy work_org_owner_update on public.work_organizations for update to authenticated using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()));
create policy work_org_owner_delete on public.work_organizations for delete to authenticated using (owner_user_id = (select auth.uid()));

drop policy if exists work_jobs_public_select on public.work_jobs;
drop policy if exists work_jobs_owner_insert on public.work_jobs;
drop policy if exists work_jobs_owner_update on public.work_jobs;
drop policy if exists work_jobs_owner_delete on public.work_jobs;
create policy work_jobs_public_select on public.work_jobs for select to anon, authenticated using (status = 'published' or created_by = (select auth.uid()));
create policy work_jobs_owner_insert on public.work_jobs for insert to authenticated with check (
  created_by = (select auth.uid()) and public.work_owns_organization(organization_id)
);
create policy work_jobs_owner_update on public.work_jobs for update to authenticated using (created_by = (select auth.uid())) with check (
  created_by = (select auth.uid()) and public.work_owns_organization(organization_id)
);
create policy work_jobs_owner_delete on public.work_jobs for delete to authenticated using (created_by = (select auth.uid()));

drop policy if exists work_applications_self_select on public.work_applications;
drop policy if exists work_applications_self_insert on public.work_applications;
create policy work_applications_self_select on public.work_applications for select to authenticated using (
  applicant_user_id = (select auth.uid())
);
create policy work_applications_self_insert on public.work_applications for insert to authenticated with check (
  applicant_user_id = (select auth.uid())
  and exists (select 1 from public.work_profiles p where p.user_id = (select auth.uid()))
  and exists (select 1 from public.work_jobs j where j.id = job_id and j.status = 'published')
);
