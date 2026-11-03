-- Budget planning on the shared tenant-scoped organization engine.
-- First user: 목포노회 선교부 (mokpo-mission), fiscal year 2027, 3,000,000원 draft.
--
-- Additive only: one new table and two new RPCs. The existing ledger
-- (organization_finance_entries) is not altered: an expense counts against a
-- budget line when its `category` equals the line's `line_key`.
-- Permission reuses public.organization_can_manage(tenant). Approval is open to
-- every tenant manager unless tenants.settings->'budget_approver_user_ids'
-- lists specific auth user ids (pilot: empty, so the secretary may also approve).
-- Every write is recorded in public.organization_audit_logs with before/after.
-- Rollback: drop function public.organization_budget_command(text,text,jsonb);
--           drop function public.organization_budget_snapshot(text,integer);
--           drop table public.organization_budget_lines;

create table if not exists public.organization_budget_lines(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  fiscal_year integer not null check (fiscal_year between 2000 and 2100),
  line_key text not null check (line_key ~ '^[a-z0-9_]{2,40}$'),
  label text not null check (length(trim(label)) between 1 and 80),
  planned_amount bigint not null default 0 check (planned_amount >= 0 and planned_amount <= 100000000000),
  sort_order integer not null default 100,
  status text not null default 'draft' check (status in ('draft','approved')),
  approved_by uuid,
  approved_at timestamptz,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, fiscal_year, line_key)
);
comment on table public.organization_budget_lines is 'Tenant-private budget plan per fiscal year. Never projected by organization_public_snapshot.';

alter table public.organization_budget_lines enable row level security;
revoke all on public.organization_budget_lines from public, anon, authenticated, service_role;

create or replace function public.organization_budget_snapshot(p_slug text, p_year integer)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v_tenant uuid; v_settings jsonb; v_lines jsonb; v_target bigint; v_approvers jsonb;
begin
  select id, coalesce(settings,'{}'::jsonb) into v_tenant, v_settings from public.tenants where slug = lower(trim(p_slug)) and status = 'active';
  if v_tenant is null or not public.organization_can_manage(v_tenant) then
    raise exception 'organization_manage_required' using errcode = '42501';
  end if;
  v_target := nullif(v_settings #>> array['budget_targets', p_year::text], '')::bigint;
  v_approvers := coalesce(v_settings->'budget_approver_user_ids', '[]'::jsonb);
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x."sortOrder", x."lineKey"), '[]'::jsonb) into v_lines from (
    select l.id, l.line_key as "lineKey", l.label, l.planned_amount as "plannedAmount", l.sort_order as "sortOrder",
           l.status, l.approved_at as "approvedAt", l.updated_at as "updatedAt",
           coalesce((select sum(f.amount) from public.organization_finance_entries f
                     where f.tenant_id = v_tenant and f.entry_type = 'expense' and f.category = l.line_key
                       and f.occurred_on >= make_date(p_year,1,1) and f.occurred_on < make_date(p_year + 1,1,1)), 0) as "executedAmount"
    from public.organization_budget_lines l where l.tenant_id = v_tenant and l.fiscal_year = p_year
  ) x;
  return jsonb_build_object(
    'slug', lower(trim(p_slug)), 'fiscalYear', p_year, 'targetAmount', v_target, 'lines', v_lines,
    'canApprove', (jsonb_array_length(v_approvers) = 0 or v_approvers ? auth.uid()::text),
    'history', coalesce((select jsonb_agg(jsonb_build_object('action', a.action, 'at', a.created_at, 'detail', a.detail) order by a.created_at desc)
                          from (select * from public.organization_audit_logs where tenant_id = v_tenant and entity_type = 'budget' order by created_at desc limit 30) a), '[]'::jsonb)
  );
end $$;
revoke all on function public.organization_budget_snapshot(text,integer) from public, anon;
grant execute on function public.organization_budget_snapshot(text,integer) to authenticated;

create or replace function public.organization_budget_command(p_slug text, p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, auth as $$
declare v_tenant uuid; v_settings jsonb; v_action text := lower(trim(coalesce(p_action,''))); v_year integer; v_key text;
        v_before jsonb; v_after jsonb; v_approvers jsonb; v_count integer;
begin
  select id, coalesce(settings,'{}'::jsonb) into v_tenant, v_settings from public.tenants where slug = lower(trim(p_slug)) and status = 'active';
  if v_tenant is null or not public.organization_can_manage(v_tenant) then
    raise exception 'organization_manage_required' using errcode = '42501';
  end if;
  v_year := nullif(p_payload->>'fiscalYear','')::integer;
  if v_year is null then raise exception 'fiscal_year_required' using errcode = '22023'; end if;

  if v_action = 'upsert_line' then
    v_key := lower(trim(coalesce(p_payload->>'lineKey','')));
    select to_jsonb(l) into v_before from public.organization_budget_lines l where tenant_id = v_tenant and fiscal_year = v_year and line_key = v_key;
    -- Any change to a line returns it to draft so it needs approval again.
    insert into public.organization_budget_lines(tenant_id, fiscal_year, line_key, label, planned_amount, sort_order, status, approved_by, approved_at, updated_by, updated_at)
    values (v_tenant, v_year, v_key, trim(coalesce(p_payload->>'label','')), coalesce(nullif(p_payload->>'plannedAmount','')::bigint, 0),
            coalesce(nullif(p_payload->>'sortOrder','')::integer, 100), 'draft', null, null, auth.uid(), now())
    on conflict (tenant_id, fiscal_year, line_key) do update set label = excluded.label, planned_amount = excluded.planned_amount,
      sort_order = excluded.sort_order, status = 'draft', approved_by = null, approved_at = null, updated_by = auth.uid(), updated_at = now();
    select to_jsonb(l) into v_after from public.organization_budget_lines l where tenant_id = v_tenant and fiscal_year = v_year and line_key = v_key;
  elsif v_action = 'delete_line' then
    v_key := lower(trim(coalesce(p_payload->>'lineKey','')));
    select to_jsonb(l) into v_before from public.organization_budget_lines l where tenant_id = v_tenant and fiscal_year = v_year and line_key = v_key;
    if v_before is null then raise exception 'budget_line_not_found' using errcode = '22023'; end if;
    if v_before->>'status' = 'approved' then raise exception 'approved_line_locked' using errcode = '22023'; end if;
    if exists (select 1 from public.organization_finance_entries f where f.tenant_id = v_tenant and f.category = v_key) then
      raise exception 'budget_line_has_expenses' using errcode = '22023';
    end if;
    delete from public.organization_budget_lines where tenant_id = v_tenant and fiscal_year = v_year and line_key = v_key;
  elsif v_action = 'approve_year' then
    v_approvers := coalesce(v_settings->'budget_approver_user_ids', '[]'::jsonb);
    if jsonb_array_length(v_approvers) > 0 and not (v_approvers ? auth.uid()::text) then
      raise exception 'budget_approver_required' using errcode = '42501';
    end if;
    -- Over-budget guard: a year with a target cannot be approved while its lines exceed it.
    if nullif(v_settings #>> array['budget_targets', v_year::text], '') is not null
       and (select coalesce(sum(planned_amount),0) from public.organization_budget_lines where tenant_id = v_tenant and fiscal_year = v_year)
           > (v_settings #>> array['budget_targets', v_year::text])::bigint then
      raise exception 'budget_exceeds_target' using errcode = '22023';
    end if;
    select jsonb_agg(to_jsonb(l)) into v_before from public.organization_budget_lines l where tenant_id = v_tenant and fiscal_year = v_year and status = 'draft';
    update public.organization_budget_lines set status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now()
      where tenant_id = v_tenant and fiscal_year = v_year and status = 'draft';
    get diagnostics v_count = row_count;
    v_after := jsonb_build_object('approvedLines', v_count);
  else
    raise exception 'unsupported_budget_action' using errcode = '22023';
  end if;

  insert into public.organization_audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, detail)
  values (v_tenant, auth.uid(), 'budget.' || v_action, 'budget', v_year::text || ':' || coalesce(v_key,'*'),
          jsonb_build_object('fiscalYear', v_year, 'before', v_before, 'after', v_after));
  return public.organization_budget_snapshot(p_slug, v_year);
end $$;
revoke all on function public.organization_budget_command(text,text,jsonb) from public, anon;
grant execute on function public.organization_budget_command(text,text,jsonb) to authenticated;

-- 선교부 2027 target and draft lines (amounts as stated by the owner; draft until approved).
update public.tenants set settings = coalesce(settings,'{}'::jsonb) || jsonb_build_object('budget_targets', coalesce(settings->'budget_targets','{}'::jsonb) || jsonb_build_object('2027', 3000000))
where slug = 'mokpo-mission';

with t as (select id from public.tenants where slug = 'mokpo-mission'),
lines(line_key, label, planned_amount, sort_order) as (values
  ('policy_seminar', '정책협의회 및 세미나', 400000, 10),
  ('evangelism', '전도목사 및 전도사역 지원', 900000, 20),
  ('military', '군선교 지원', 500000, 30),
  ('rural_island', '농어촌·도서지역 교회 선교협력', 500000, 40),
  ('assembly', '선교부 전체모임', 400000, 50),
  ('operations', '임원회의 및 운영비', 200000, 60),
  ('reserve', '예비비', 100000, 70))
insert into public.organization_budget_lines(tenant_id, fiscal_year, line_key, label, planned_amount, sort_order, status)
select t.id, 2027, l.line_key, l.label, l.planned_amount, l.sort_order, 'draft' from t cross join lines l
on conflict (tenant_id, fiscal_year, line_key) do nothing;
