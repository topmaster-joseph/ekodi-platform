-- 목포노회 선교부: 총회 정책협의회 참석자 명단(임원 입력) + 휴대폰·비밀번호 읽기 전용 조회.
-- Additive only. Existing organization tables and functions are not modified.
--
-- 1) organization_event_rosters: event roster entered by administrators (총회 붙임2 columns).
--    Phones are entered by administrators and never live in this repository.
--    Public projection masks the phone (organization_event_roster_public).
-- 2) organization_pin_viewers / organization_pin_sessions: a read-only viewer (e.g. 선교부장) signs in
--    with phone + 4-digit PIN. PIN is bcrypt-hashed; 5 failures lock the viewer for 30 minutes;
--    sessions are random 32-byte tokens stored only as SHA-256 hashes and expire after 12 hours.
--    Viewers can read the department snapshot; they can never write.
-- Rollback: drop the functions below, then the three tables.

create table if not exists public.organization_event_rosters(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_key text not null check (event_key ~ '^[a-z0-9-]{3,60}$'),
  seq integer not null check (seq between 1 and 200),
  dept text not null check (dept in ('선교부','국내선교부','전도부')),
  role text not null check (role in ('부장','서기','회계','총무','부원','기타')),
  person_name text not null check (length(trim(person_name)) between 1 and 40),
  clergy text not null check (clergy in ('목사','장로')),
  church_name text not null check (length(trim(church_name)) between 1 and 60),
  phone text not null default '' check (phone = '' or phone ~ '^[0-9-]{9,20}$'),
  attend text not null check (attend in ('O','X')),
  updated_at timestamptz not null default now(),
  unique (tenant_id, event_key, seq)
);
comment on table public.organization_event_rosters is 'Administrator-entered event rosters. Phone is projected publicly only masked.';
alter table public.organization_event_rosters enable row level security;
revoke all on public.organization_event_rosters from public, anon, authenticated, service_role;

create table if not exists public.organization_pin_viewers(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone_digits text not null check (phone_digits ~ '^[0-9]{10,11}$'),
  pin_hash text not null,
  label text not null default '' check (length(label) <= 40),
  active boolean not null default true,
  failed_count integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (tenant_id, phone_digits)
);
alter table public.organization_pin_viewers enable row level security;
revoke all on public.organization_pin_viewers from public, anon, authenticated, service_role;

create table if not exists public.organization_pin_sessions(
  token_hash text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  viewer_id uuid not null references public.organization_pin_viewers(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists idx_organization_pin_sessions_expiry on public.organization_pin_sessions(expires_at);
alter table public.organization_pin_sessions enable row level security;
revoke all on public.organization_pin_sessions from public, anon, authenticated, service_role;

-- Public roster: names, churches, roles and attendance; phone masked to the last four digits.
create or replace function public.organization_event_roster_public(p_slug text, p_event text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'seq', r.seq, 'dept', r.dept, 'role', r.role, 'personName', r.person_name, 'clergy', r.clergy,
      'churchName', r.church_name, 'attend', r.attend,
      'phoneMasked', case when r.phone = '' then '' else '010-****-' || right(regexp_replace(r.phone,'[^0-9]','','g'),4) end)
    order by r.seq), '[]'::jsonb)
  from public.organization_event_rosters r join public.tenants t on t.id = r.tenant_id
  where t.slug = lower(trim(p_slug)) and t.status = 'active' and r.event_key = lower(trim(p_event));
$$;
revoke all on function public.organization_event_roster_public(text,text) from public;
grant execute on function public.organization_event_roster_public(text,text) to anon, authenticated;

create or replace function public.organization_event_roster_rows(p_tenant uuid, p_event text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('seq', seq, 'dept', dept, 'role', role, 'personName', person_name,
      'clergy', clergy, 'churchName', church_name, 'phone', phone, 'attend', attend, 'updatedAt', updated_at) order by seq), '[]'::jsonb)
  from public.organization_event_rosters where tenant_id = p_tenant and event_key = lower(trim(p_event));
$$;
revoke all on function public.organization_event_roster_rows(uuid,text) from public, anon, authenticated;

-- Administrators: full roster (with phones) and viewer status.
create or replace function public.organization_event_roster_admin(p_slug text, p_event text)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v_tenant uuid;
begin
  select id into v_tenant from public.tenants where slug = lower(trim(p_slug)) and status = 'active';
  if v_tenant is null or not public.organization_can_manage(v_tenant) then
    raise exception 'organization_manage_required' using errcode = '42501';
  end if;
  return jsonb_build_object('rows', public.organization_event_roster_rows(v_tenant, p_event),
    'viewers', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'phoneMasked', '010-****-' || right(phone_digits,4),
        'active', active, 'lockedUntil', locked_until, 'lastLoginAt', last_login_at) order by label)
      from public.organization_pin_viewers where tenant_id = v_tenant), '[]'::jsonb));
end $$;
revoke all on function public.organization_event_roster_admin(text,text) from public, anon;
grant execute on function public.organization_event_roster_admin(text,text) to authenticated;

-- Administrators: create/replace a read-only viewer (phone + 4-digit PIN). A null PIN deactivates.
create or replace function public.organization_pin_viewer_set(p_slug text, p_phone text, p_pin text, p_label text default '')
returns jsonb language plpgsql volatile security definer set search_path = public, auth as $$
declare v_tenant uuid; v_phone text := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
begin
  select id into v_tenant from public.tenants where slug = lower(trim(p_slug)) and status = 'active';
  if v_tenant is null or not public.organization_can_manage(v_tenant) then
    raise exception 'organization_manage_required' using errcode = '42501';
  end if;
  if v_phone !~ '^[0-9]{10,11}$' then raise exception 'phone_invalid' using errcode = '22023'; end if;
  if p_pin is null then
    update public.organization_pin_viewers set active = false, updated_at = now() where tenant_id = v_tenant and phone_digits = v_phone;
    delete from public.organization_pin_sessions s using public.organization_pin_viewers v where s.viewer_id = v.id and v.tenant_id = v_tenant and v.phone_digits = v_phone;
    return jsonb_build_object('ok', true, 'active', false);
  end if;
  if p_pin !~ '^[0-9]{4}$' then raise exception 'pin_invalid' using errcode = '22023'; end if;
  insert into public.organization_pin_viewers(tenant_id, phone_digits, pin_hash, label)
  values (v_tenant, v_phone, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), left(coalesce(p_label,''),40))
  on conflict (tenant_id, phone_digits) do update set pin_hash = excluded.pin_hash,
    label = case when excluded.label = '' then organization_pin_viewers.label else excluded.label end,
    active = true, failed_count = 0, locked_until = null, updated_at = now();
  delete from public.organization_pin_sessions s using public.organization_pin_viewers v where s.viewer_id = v.id and v.tenant_id = v_tenant and v.phone_digits = v_phone;
  insert into public.organization_audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, detail)
  values (v_tenant, auth.uid(), 'pin_viewer_set', 'pin_viewer', '010-****-' || right(v_phone,4), '{}'::jsonb);
  return jsonb_build_object('ok', true, 'active', true);
end $$;
revoke all on function public.organization_pin_viewer_set(text,text,text,text) from public, anon;
grant execute on function public.organization_pin_viewer_set(text,text,text,text) to authenticated;

-- Viewer sign-in. Same answer for unknown phone and wrong PIN; lockout after 5 failures.
create or replace function public.organization_pin_login(p_slug text, p_phone text, p_pin text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_tenant uuid; v_viewer public.organization_pin_viewers%rowtype; v_phone text := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
        v_token text; v_expires timestamptz := now() + interval '12 hours';
begin
  select id into v_tenant from public.tenants where slug = lower(trim(p_slug)) and status = 'active';
  if v_tenant is null or v_phone !~ '^[0-9]{10,11}$' or coalesce(p_pin,'') !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CREDENTIALS');
  end if;
  select * into v_viewer from public.organization_pin_viewers where tenant_id = v_tenant and phone_digits = v_phone and active for update;
  if v_viewer.id is null then return jsonb_build_object('ok', false, 'code', 'INVALID_CREDENTIALS'); end if;
  if v_viewer.locked_until is not null and v_viewer.locked_until > now() then
    return jsonb_build_object('ok', false, 'code', 'LOCKED', 'lockedUntil', v_viewer.locked_until);
  end if;
  if extensions.crypt(p_pin, v_viewer.pin_hash) <> v_viewer.pin_hash then
    update public.organization_pin_viewers set failed_count = failed_count + 1,
      locked_until = case when failed_count + 1 >= 5 then now() + interval '30 minutes' else null end,
      updated_at = now() where id = v_viewer.id;
    return jsonb_build_object('ok', false, 'code', 'INVALID_CREDENTIALS');
  end if;
  update public.organization_pin_viewers set failed_count = 0, locked_until = null, last_login_at = now(), updated_at = now() where id = v_viewer.id;
  delete from public.organization_pin_sessions where expires_at < now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.organization_pin_sessions(token_hash, tenant_id, viewer_id, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_tenant, v_viewer.id, v_expires);
  insert into public.organization_audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, detail)
  values (v_tenant, null, 'pin_viewer_login', 'pin_viewer', '010-****-' || right(v_phone,4), '{}'::jsonb);
  return jsonb_build_object('ok', true, 'token', v_token, 'expiresAt', v_expires, 'label', v_viewer.label);
end $$;
revoke all on function public.organization_pin_login(text,text,text) from public;
grant execute on function public.organization_pin_login(text,text,text) to anon, authenticated;

create or replace function public.organization_pin_logout(p_token text)
returns jsonb language sql volatile security definer set search_path = public as $$
  delete from public.organization_pin_sessions where token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex');
  select jsonb_build_object('ok', true);
$$;
revoke all on function public.organization_pin_logout(text) from public;
grant execute on function public.organization_pin_logout(text) to anon, authenticated;

-- Read-only department snapshot for a signed-in viewer. Excludes the audit log.
create or replace function public.organization_pin_snapshot(p_slug text, p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_tenant uuid; v_label text; v_term public.organization_terms%rowtype; v_year integer := extract(year from (now() at time zone 'Asia/Seoul'))::integer;
begin
  select s.tenant_id, v.label into v_tenant, v_label
  from public.organization_pin_sessions s join public.organization_pin_viewers v on v.id = s.viewer_id and v.active
  join public.tenants t on t.id = s.tenant_id and t.slug = lower(trim(p_slug)) and t.status = 'active'
  where s.token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex') and s.expires_at > now();
  if v_tenant is null then raise exception 'pin_session_required' using errcode = '42501'; end if;
  select * into v_term from public.organization_terms where tenant_id = v_tenant and status = 'current' order by starts_on desc nulls last, created_at desc limit 1;
  return jsonb_build_object(
    'viewer', jsonb_build_object('label', v_label),
    'name', (select name from public.tenants where id = v_tenant),
    'currentTerm', case when v_term.id is null then null else jsonb_build_object('label', v_term.label, 'startsOn', v_term.starts_on, 'endsOn', v_term.ends_on) end,
    'officers', coalesce((select jsonb_agg(jsonb_build_object('officeLabel', coalesce(r.office_label, o.office_key), 'personName', o.person_name, 'churchName', o.church_name) order by r.sort_order, o.office_key)
      from public.organization_officers o left join public.organization_office_rules r on r.tenant_id = o.tenant_id and r.office_key = o.office_key
      where o.tenant_id = v_tenant and o.term_id = v_term.id), '[]'::jsonb),
    'notices', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'url', url, 'publishedAt', published_at, 'publicationState', publication_state) order by published_at desc nulls last)
      from (select * from public.organization_notices where tenant_id = v_tenant order by published_at desc nulls last limit 50) n), '[]'::jsonb),
    'financeReports', coalesce((select jsonb_agg(jsonb_build_object('periodLabel', period_label, 'openingBalance', opening_balance, 'incomeTotal', income_total, 'expenseTotal', expense_total, 'closingBalance', closing_balance, 'note', note) order by updated_at desc)
      from public.organization_finance_reports where tenant_id = v_tenant), '[]'::jsonb),
    'financeEntries', coalesce((select jsonb_agg(jsonb_build_object('occurredOn', occurred_on, 'entryType', entry_type, 'category', category, 'description', description, 'amount', amount) order by occurred_on desc)
      from (select * from public.organization_finance_entries where tenant_id = v_tenant order by occurred_on desc, created_at desc limit 200) f), '[]'::jsonb),
    'budgetYear', v_year,
    'budget', coalesce((select jsonb_agg(jsonb_build_object('fiscalYear', l.fiscal_year, 'label', l.label, 'plannedAmount', l.planned_amount, 'status', l.status,
        'executedAmount', coalesce((select sum(f.amount) from public.organization_finance_entries f where f.tenant_id = v_tenant and f.entry_type = 'expense' and f.category = l.line_key
          and f.occurred_on >= make_date(l.fiscal_year,1,1) and f.occurred_on < make_date(l.fiscal_year + 1,1,1)), 0)) order by l.fiscal_year, l.sort_order, l.line_key)
      from public.organization_budget_lines l where l.tenant_id = v_tenant and l.fiscal_year between v_year and v_year + 1), '[]'::jsonb),
    'meetings', coalesce((select jsonb_agg(jsonb_build_object('heldAt', held_at, 'title', title, 'venue', venue, 'status', status) order by held_at desc)
      from public.organization_meetings where tenant_id = v_tenant), '[]'::jsonb),
    'attendance', coalesce((select jsonb_agg(jsonb_build_object('meetingTitle', m.title, 'attendeeName', a.attendee_name, 'churchName', a.church_name, 'attendanceState', a.attendance_state) order by m.held_at desc, a.attendee_name)
      from (select * from public.organization_attendance where tenant_id = v_tenant limit 500) a join public.organization_meetings m on m.id = a.meeting_id), '[]'::jsonb),
    'rosters', jsonb_build_object('pck-policy-2026', public.organization_event_roster_rows(v_tenant, 'pck-policy-2026')));
end $$;
revoke all on function public.organization_pin_snapshot(text,text) from public;
grant execute on function public.organization_pin_snapshot(text,text) to anon, authenticated;

-- Seed: 제111회기 총회 국내선교부 정책협의회 명단 (현재 임원 부장·서기, 참석 O). Phones are entered by administrators.
insert into public.organization_event_rosters(tenant_id, event_key, seq, dept, role, person_name, clergy, church_name, attend)
select t.id, 'pck-policy-2026', v.seq, '선교부', v.role, v.person_name, '목사', v.church_name, 'O'
from public.tenants t cross join (values (1,'부장','김찬구','안좌대리교회'),(2,'서기','정찬균','에코디교회')) as v(seq, role, person_name, church_name)
where t.slug = 'mokpo-mission'
on conflict (tenant_id, event_key, seq) do nothing;
