-- 목포노회 선교부: 업무공간을 사용자 페이지 안으로 — 권한별 열람·수정·승인.
-- 역할: 누구나(공개) · 부원(tenant member, 열람) · 서기/관리자(can_manage, 수정) · 부장(휴대폰+비밀번호, 열람+예산 승인).
-- Additive: new columns/functions only. organization_pin_snapshot is re-created to share one payload builder.
-- Policy change (owner decision 2026-11-06): 선교부 예산 승인은 부장만. 서기(관리자)는 작성·수정, 승인 불가.
-- Rollback: drop the functions created here, drop column organization_pin_viewers.can_approve,
--           and remove tenants.settings->'budget_approver_user_ids' for mokpo-mission.

alter table public.organization_pin_viewers add column if not exists can_approve boolean not null default false;

-- Shared read-only department payload (no audit log). Internal: not callable by API roles.
create or replace function public.organization_view_payload(p_tenant uuid, p_label text, p_can_approve boolean)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_term public.organization_terms%rowtype; v_year integer := extract(year from (now() at time zone 'Asia/Seoul'))::integer;
        v_settings jsonb;
begin
  select coalesce(settings,'{}'::jsonb) into v_settings from public.tenants where id = p_tenant;
  select * into v_term from public.organization_terms where tenant_id = p_tenant and status = 'current' order by starts_on desc nulls last, created_at desc limit 1;
  return jsonb_build_object(
    'viewer', jsonb_build_object('label', p_label, 'canApprove', p_can_approve),
    'name', (select name from public.tenants where id = p_tenant),
    'currentTerm', case when v_term.id is null then null else jsonb_build_object('label', v_term.label, 'startsOn', v_term.starts_on, 'endsOn', v_term.ends_on) end,
    'officers', coalesce((select jsonb_agg(jsonb_build_object('officeLabel', coalesce(r.office_label, o.office_key), 'personName', o.person_name, 'churchName', o.church_name) order by r.sort_order, o.office_key)
      from public.organization_officers o left join public.organization_office_rules r on r.tenant_id = o.tenant_id and r.office_key = o.office_key
      where o.tenant_id = p_tenant and o.term_id = v_term.id), '[]'::jsonb),
    'notices', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'url', url, 'publishedAt', published_at, 'publicationState', publication_state) order by published_at desc nulls last)
      from (select * from public.organization_notices where tenant_id = p_tenant order by published_at desc nulls last limit 50) n), '[]'::jsonb),
    'financeReports', coalesce((select jsonb_agg(jsonb_build_object('periodLabel', period_label, 'openingBalance', opening_balance, 'incomeTotal', income_total, 'expenseTotal', expense_total, 'closingBalance', closing_balance, 'note', note) order by updated_at desc)
      from public.organization_finance_reports where tenant_id = p_tenant), '[]'::jsonb),
    'financeEntries', coalesce((select jsonb_agg(jsonb_build_object('occurredOn', occurred_on, 'entryType', entry_type, 'category', category, 'description', description, 'amount', amount) order by occurred_on desc)
      from (select * from public.organization_finance_entries where tenant_id = p_tenant order by occurred_on desc, created_at desc limit 200) f), '[]'::jsonb),
    'budgetYear', v_year,
    'budgetTargets', coalesce(v_settings->'budget_targets', '{}'::jsonb),
    'budget', coalesce((select jsonb_agg(jsonb_build_object('fiscalYear', l.fiscal_year, 'lineKey', l.line_key, 'label', l.label, 'plannedAmount', l.planned_amount, 'status', l.status, 'approvedAt', l.approved_at,
        'executedAmount', coalesce((select sum(f.amount) from public.organization_finance_entries f where f.tenant_id = p_tenant and f.entry_type = 'expense' and f.category = l.line_key
          and f.occurred_on >= make_date(l.fiscal_year,1,1) and f.occurred_on < make_date(l.fiscal_year + 1,1,1)), 0)) order by l.fiscal_year, l.sort_order, l.line_key)
      from public.organization_budget_lines l where l.tenant_id = p_tenant and l.fiscal_year between v_year and v_year + 1), '[]'::jsonb),
    'meetings', coalesce((select jsonb_agg(jsonb_build_object('heldAt', held_at, 'title', title, 'venue', venue, 'status', status) order by held_at desc)
      from public.organization_meetings where tenant_id = p_tenant), '[]'::jsonb),
    'attendance', coalesce((select jsonb_agg(jsonb_build_object('meetingTitle', m.title, 'attendeeName', a.attendee_name, 'churchName', a.church_name, 'attendanceState', a.attendance_state) order by m.held_at desc, a.attendee_name)
      from (select * from public.organization_attendance where tenant_id = p_tenant limit 500) a join public.organization_meetings m on m.id = a.meeting_id), '[]'::jsonb),
    'rosters', jsonb_build_object('pck-policy-2026', public.organization_event_roster_rows(p_tenant, 'pck-policy-2026')));
end $$;
revoke all on function public.organization_view_payload(uuid,text,boolean) from public, anon, authenticated;

-- 부장(휴대폰 로그인) snapshot now carries canApprove.
create or replace function public.organization_pin_snapshot(p_slug text, p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_tenant uuid; v_label text; v_can_approve boolean;
begin
  select s.tenant_id, v.label, v.can_approve into v_tenant, v_label, v_can_approve
  from public.organization_pin_sessions s join public.organization_pin_viewers v on v.id = s.viewer_id and v.active
  join public.tenants t on t.id = s.tenant_id and t.slug = lower(trim(p_slug)) and t.status = 'active'
  where s.token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex') and s.expires_at > now();
  if v_tenant is null then raise exception 'pin_session_required' using errcode = '42501'; end if;
  return public.organization_view_payload(v_tenant, v_label, v_can_approve);
end $$;
-- Explicitly preserve the existing PIN snapshot Data API privileges from
-- 20261105210000_mokpo_mission_roster_pin_viewer.sql when recreating this RPC.
-- No new roles or permissions are introduced.
revoke all on function public.organization_pin_snapshot(text,text) from public;
grant execute on function public.organization_pin_snapshot(text,text) to anon, authenticated;

-- Who is looking at the page (EKODI login): manager (can_manage) / member (active tenant member) / none.
create or replace function public.organization_site_context(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v_tenant uuid; v_settings jsonb; v_approvers jsonb; v_member boolean; v_manager boolean;
begin
  select id, coalesce(settings,'{}'::jsonb) into v_tenant, v_settings from public.tenants where slug = lower(trim(p_slug)) and status = 'active';
  if v_tenant is null or auth.uid() is null then return jsonb_build_object('role', null); end if;
  v_manager := public.organization_can_manage(v_tenant);
  v_member := exists(select 1 from public.tenant_members m where m.tenant_id = v_tenant and m.user_id = auth.uid() and m.status = 'active');
  v_approvers := coalesce(v_settings->'budget_approver_user_ids', '[]'::jsonb);
  return jsonb_build_object(
    'role', case when v_manager then 'manager' when v_member then 'member' else null end,
    'canApprove', v_manager and (jsonb_array_length(v_approvers) = 0 or v_approvers ? auth.uid()::text),
    'email', (select email from auth.users where id = auth.uid()));
end $$;
revoke all on function public.organization_site_context(text) from public, anon;
grant execute on function public.organization_site_context(text) to authenticated;

-- 부원 열람: active tenant members read the same department payload.
create or replace function public.organization_member_snapshot(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v_tenant uuid;
begin
  select id into v_tenant from public.tenants where slug = lower(trim(p_slug)) and status = 'active';
  if v_tenant is null or auth.uid() is null
     or not exists(select 1 from public.tenant_members m where m.tenant_id = v_tenant and m.user_id = auth.uid() and m.status = 'active') then
    raise exception 'organization_member_required' using errcode = '42501';
  end if;
  return public.organization_view_payload(v_tenant, '부원', false);
end $$;
revoke all on function public.organization_member_snapshot(text) from public, anon;
grant execute on function public.organization_member_snapshot(text) to authenticated;

-- 부장 승인(휴대폰 로그인): approve every draft budget line of a year. Same guards as approve_year.
create or replace function public.organization_pin_budget_approve(p_slug text, p_token text, p_year integer)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_tenant uuid; v_label text; v_can boolean; v_settings jsonb; v_before jsonb; v_count integer;
begin
  select s.tenant_id, v.label, v.can_approve into v_tenant, v_label, v_can
  from public.organization_pin_sessions s join public.organization_pin_viewers v on v.id = s.viewer_id and v.active
  join public.tenants t on t.id = s.tenant_id and t.slug = lower(trim(p_slug)) and t.status = 'active'
  where s.token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex') and s.expires_at > now();
  if v_tenant is null then raise exception 'pin_session_required' using errcode = '42501'; end if;
  if not coalesce(v_can, false) then raise exception 'budget_approver_required' using errcode = '42501'; end if;
  if p_year is null or p_year < 2000 or p_year > 2100 then raise exception 'fiscal_year_invalid' using errcode = '22023'; end if;
  select coalesce(settings,'{}'::jsonb) into v_settings from public.tenants where id = v_tenant;
  if nullif(v_settings #>> array['budget_targets', p_year::text], '') is not null
     and (select coalesce(sum(planned_amount),0) from public.organization_budget_lines where tenant_id = v_tenant and fiscal_year = p_year)
         > (v_settings #>> array['budget_targets', p_year::text])::bigint then
    raise exception 'budget_exceeds_target' using errcode = '22023';
  end if;
  select jsonb_agg(to_jsonb(l)) into v_before from public.organization_budget_lines l where tenant_id = v_tenant and fiscal_year = p_year and status = 'draft';
  update public.organization_budget_lines set status = 'approved', approved_by = null, approved_at = now(), updated_at = now()
    where tenant_id = v_tenant and fiscal_year = p_year and status = 'draft';
  get diagnostics v_count = row_count;
  insert into public.organization_audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, detail)
  values (v_tenant, null, 'budget.approve_year', 'budget', p_year::text || ':*',
          jsonb_build_object('fiscalYear', p_year, 'approvedVia', 'pin', 'approver', v_label, 'before', v_before, 'after', jsonb_build_object('approvedLines', v_count)));
  return jsonb_build_object('ok', true, 'approvedLines', v_count);
end $$;
revoke all on function public.organization_pin_budget_approve(text,text,integer) from public;
grant execute on function public.organization_pin_budget_approve(text,text,integer) to anon, authenticated;

-- 선교부: 부장만 승인. A non-user approver id means no EKODI account (서기 포함) can approve_year;
-- 부장 approves through the phone login (can_approve).
update public.tenants
set settings = coalesce(settings,'{}'::jsonb) || jsonb_build_object('budget_approver_user_ids', jsonb_build_array('pin-viewer:chair'))
where slug = 'mokpo-mission';
update public.organization_pin_viewers v set can_approve = true, updated_at = now()
from public.tenants t
where t.id = v.tenant_id and t.slug = 'mokpo-mission' and v.label like '선교부장%';
