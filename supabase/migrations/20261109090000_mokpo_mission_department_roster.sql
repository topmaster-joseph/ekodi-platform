-- 목포노회 선교부: 부서 명단 — 부장·서기는 전체(연락처 포함), 부원은 이름 명단만.
-- Owner decision 2026-11-09: 소속 부서의 명단은 부장과 서기가 전체를 보고, 부원은 이름 명단만 본다.
--   전체(full): 서기·관리자(EKODI 로그인, organization_can_manage) 또는 부장(이름 로그인, viewer_role = 'chair').
--   이름(names): 부원(이름 로그인 member, 또는 EKODI 로그인 tenant member).
--   그 외(익명): 거부.
-- Personal data is never written by this file: rows are entered by 서기 through
-- organization_department_roster_set, or seeded out-of-band. The table has RLS on and no grants.
-- Rollback: drop the three functions below and table public.organization_department_roster.

create table if not exists public.organization_department_roster(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  person_name text not null check (length(trim(person_name)) between 1 and 40),
  office text not null default '부원' check (office in ('부장','서기','회계','부원')),
  clergy text not null default '' check (clergy in ('','목사','장로','전도사')),
  church_name text not null default '' check (length(church_name) <= 60),
  phone text not null default '' check (phone = '' or phone ~ '^[0-9-]{9,20}$'),
  email text not null default '' check (length(email) <= 120),
  address text not null default '' check (length(address) <= 200),
  note text not null default '' check (length(note) <= 200),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, person_name, church_name)
);
alter table public.organization_department_roster enable row level security;
revoke all on table public.organization_department_roster from public, anon, authenticated;

-- Read: scope decided server-side from the caller (EKODI session and/or 이름 로그인 token).
create or replace function public.organization_department_roster(p_slug text, p_token text default null)
returns jsonb language plpgsql volatile security definer set search_path = public, auth as $$
declare v_tenant uuid; v_role text; v_label text; v_full boolean := false; v_names boolean := false;
begin
  select id into v_tenant from public.tenants where slug = lower(trim(p_slug)) and status = 'active';
  if v_tenant is null then raise exception 'organization_not_found' using errcode = '42501'; end if;
  if auth.uid() is not null then
    if public.organization_can_manage(v_tenant) then v_full := true; v_label := '서기';
    elsif exists(select 1 from public.tenant_members m where m.tenant_id = v_tenant and m.user_id = auth.uid() and m.status = 'active') then v_names := true;
    end if;
  end if;
  if not v_full and coalesce(p_token,'') <> '' then
    select v.viewer_role, coalesce(v.login_name, v.label) into v_role, v_label
    from public.organization_pin_sessions s join public.organization_pin_viewers v on v.id = s.viewer_id and v.active
    where s.tenant_id = v_tenant and s.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and s.expires_at > now();
    if v_role = 'chair' then v_full := true; elsif v_role is not null then v_names := true; end if;
  end if;
  if v_full then
    insert into public.organization_audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, detail)
    values (v_tenant, auth.uid(), 'department_roster.view_full', 'department_roster', '*', jsonb_build_object('viewer', v_label));
    return jsonb_build_object('scope', 'full', 'people', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'name', person_name, 'office', office, 'clergy', clergy, 'church', church_name,
        'phone', phone, 'email', email, 'address', address, 'note', note) order by sort_order, person_name)
      from public.organization_department_roster where tenant_id = v_tenant), '[]'::jsonb));
  end if;
  if v_names then
    return jsonb_build_object('scope', 'names', 'people', coalesce((select jsonb_agg(jsonb_build_object('name', person_name, 'office', office) order by sort_order, person_name)
      from public.organization_department_roster where tenant_id = v_tenant), '[]'::jsonb));
  end if;
  raise exception 'department_roster_access_required' using errcode = '42501';
end $$;
revoke all on function public.organization_department_roster(text,text) from public;
grant execute on function public.organization_department_roster(text,text) to anon, authenticated;

-- Write: 서기·관리자 only (EKODI login with organization_can_manage).
create or replace function public.organization_department_roster_set(p_slug text, p_person jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, auth as $$
declare v_tenant uuid; v_id uuid; v_name text := trim(coalesce(p_person->>'name',''));
begin
  select id into v_tenant from public.tenants where slug = lower(trim(p_slug)) and status = 'active';
  if v_tenant is null or not public.organization_can_manage(v_tenant) then raise exception 'organization_manage_required' using errcode = '42501'; end if;
  if length(v_name) = 0 then raise exception 'name_required' using errcode = '22023'; end if;
  insert into public.organization_department_roster(tenant_id, person_name, office, clergy, church_name, phone, email, address, note, sort_order)
  values (v_tenant, v_name, coalesce(nullif(p_person->>'office',''),'부원'), coalesce(p_person->>'clergy',''), trim(coalesce(p_person->>'church','')),
          trim(coalesce(p_person->>'phone','')), trim(coalesce(p_person->>'email','')), trim(coalesce(p_person->>'address','')), trim(coalesce(p_person->>'note','')),
          case coalesce(nullif(p_person->>'office',''),'부원') when '부장' then 10 when '서기' then 20 when '회계' then 30 else 100 end)
  on conflict (tenant_id, person_name, church_name) do update set office = excluded.office, clergy = excluded.clergy, phone = excluded.phone,
    email = excluded.email, address = excluded.address, note = excluded.note, sort_order = excluded.sort_order, updated_at = now()
  returning id into v_id;
  insert into public.organization_audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, detail)
  values (v_tenant, auth.uid(), 'department_roster.set', 'department_roster', v_id::text, jsonb_build_object('name', v_name));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function public.organization_department_roster_set(text,jsonb) from public, anon;
grant execute on function public.organization_department_roster_set(text,jsonb) to authenticated;

create or replace function public.organization_department_roster_remove(p_slug text, p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, auth as $$
declare v_tenant uuid; v_count integer;
begin
  select id into v_tenant from public.tenants where slug = lower(trim(p_slug)) and status = 'active';
  if v_tenant is null or not public.organization_can_manage(v_tenant) then raise exception 'organization_manage_required' using errcode = '42501'; end if;
  delete from public.organization_department_roster where tenant_id = v_tenant and id = p_id;
  get diagnostics v_count = row_count;
  insert into public.organization_audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, detail)
  values (v_tenant, auth.uid(), 'department_roster.remove', 'department_roster', coalesce(p_id::text,''), '{}'::jsonb);
  return jsonb_build_object('ok', true, 'removed', v_count);
end $$;
revoke all on function public.organization_department_roster_remove(text,uuid) from public, anon;
grant execute on function public.organization_department_roster_remove(text,uuid) to authenticated;
