-- 목포노회 선교부: 이름 + 비밀번호(휴대폰 끝 4자리) 로그인 — 부장·부원 공통 (owner decision 2026-11-06).
-- Because the password is derived from the phone number, the public roster no longer shows any phone digits.
-- Additive: new columns/functions; organization_event_roster_public is re-created with a full mask.
-- Rollback: drop organization_name_login / organization_login_member_set / organization_login_member_disable,
--           drop columns login_name, viewer_role, and restore the previous roster projection.

alter table public.organization_pin_viewers add column if not exists login_name text check (login_name is null or length(trim(login_name)) between 1 and 40);
alter table public.organization_pin_viewers add column if not exists viewer_role text not null default 'member' check (viewer_role in ('chair','member'));
create unique index if not exists uq_organization_pin_viewers_login_name on public.organization_pin_viewers (tenant_id, lower(trim(login_name))) where login_name is not null;

-- Public roster: names, churches, roles, attendance. No phone digits at all (the last four are a password now).
create or replace function public.organization_event_roster_public(p_slug text, p_event text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'seq', r.seq, 'dept', r.dept, 'role', r.role, 'personName', r.person_name, 'clergy', r.clergy,
      'churchName', r.church_name, 'attend', r.attend,
      'phoneMasked', case when r.phone = '' then '' else '010-****-****' end)
    order by r.seq), '[]'::jsonb)
  from public.organization_event_rosters r join public.tenants t on t.id = r.tenant_id
  where t.slug = lower(trim(p_slug)) and t.status = 'active' and r.event_key = lower(trim(p_event));
$;
-- Preserve the exact current production ACL for this phone-masked public roster RPC.
-- The source-public function remains publicly readable; no private viewer or member RPC is exposed.
revoke all on function public.organization_event_roster_public(text,text) from public;
grant execute on function public.organization_event_roster_public(text,text) to anon, authenticated;

-- 서기/관리자: register or update a phone-login person. Password = last four digits of the phone (fixed).
create or replace function public.organization_login_member_set(p_slug text, p_name text, p_phone text, p_role text)
returns jsonb language plpgsql volatile security definer set search_path = public, auth as $$
declare v_tenant uuid; v_phone text := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'); v_name text := trim(coalesce(p_name,''));
begin
  select id into v_tenant from public.tenants where slug = lower(trim(p_slug)) and status = 'active';
  if v_tenant is null or not public.organization_can_manage(v_tenant) then raise exception 'organization_manage_required' using errcode = '42501'; end if;
  if v_phone !~ '^[0-9]{10,11}$' then raise exception 'phone_invalid' using errcode = '22023'; end if;
  if length(v_name) not between 1 and 40 then raise exception 'name_invalid' using errcode = '22023'; end if;
  if p_role not in ('chair','member') then raise exception 'role_invalid' using errcode = '22023'; end if;
  if exists(select 1 from public.organization_pin_viewers where tenant_id = v_tenant and lower(trim(login_name)) = lower(v_name) and phone_digits <> v_phone and active) then
    raise exception 'name_taken' using errcode = '23505';
  end if;
  insert into public.organization_pin_viewers(tenant_id, phone_digits, pin_hash, label, login_name, viewer_role, can_approve)
  values (v_tenant, v_phone, extensions.crypt(right(v_phone,4), extensions.gen_salt('bf', 8)), v_name, v_name, p_role, p_role = 'chair')
  on conflict (tenant_id, phone_digits) do update set pin_hash = excluded.pin_hash, label = excluded.label, login_name = excluded.login_name,
    viewer_role = excluded.viewer_role, can_approve = excluded.can_approve, active = true, failed_count = 0, locked_until = null, updated_at = now();
  insert into public.organization_audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, detail)
  values (v_tenant, auth.uid(), 'login_member_set', 'pin_viewer', v_name, jsonb_build_object('role', p_role));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.organization_login_member_set(text,text,text,text) from public, anon;
grant execute on function public.organization_login_member_set(text,text,text,text) to authenticated;

create or replace function public.organization_login_member_disable(p_slug text, p_name text)
returns jsonb language plpgsql volatile security definer set search_path = public, auth as $$
declare v_tenant uuid; v_count integer;
begin
  select id into v_tenant from public.tenants where slug = lower(trim(p_slug)) and status = 'active';
  if v_tenant is null or not public.organization_can_manage(v_tenant) then raise exception 'organization_manage_required' using errcode = '42501'; end if;
  update public.organization_pin_viewers set active = false, updated_at = now() where tenant_id = v_tenant and lower(trim(login_name)) = lower(trim(coalesce(p_name,'')));
  get diagnostics v_count = row_count;
  delete from public.organization_pin_sessions s using public.organization_pin_viewers v where s.viewer_id = v.id and v.tenant_id = v_tenant and not v.active;
  insert into public.organization_audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, detail)
  values (v_tenant, auth.uid(), 'login_member_disable', 'pin_viewer', trim(coalesce(p_name,'')), '{}'::jsonb);
  return jsonb_build_object('ok', true, 'disabled', v_count);
end $$;
revoke all on function public.organization_login_member_disable(text,text) from public, anon;
grant execute on function public.organization_login_member_disable(text,text) to authenticated;

-- 이름 + 비밀번호 로그인. Same answer for unknown name and wrong password; 5 failures lock for 30 minutes.
create or replace function public.organization_name_login(p_slug text, p_name text, p_pin text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_tenant uuid; v_viewer public.organization_pin_viewers%rowtype; v_token text; v_expires timestamptz := now() + interval '12 hours';
begin
  select id into v_tenant from public.tenants where slug = lower(trim(p_slug)) and status = 'active';
  if v_tenant is null or length(trim(coalesce(p_name,''))) = 0 or coalesce(p_pin,'') !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CREDENTIALS');
  end if;
  select * into v_viewer from public.organization_pin_viewers
  where tenant_id = v_tenant and active and login_name is not null and lower(trim(login_name)) = lower(trim(p_name)) for update;
  if v_viewer.id is null then return jsonb_build_object('ok', false, 'code', 'INVALID_CREDENTIALS'); end if;
  if v_viewer.locked_until is not null and v_viewer.locked_until > now() then
    return jsonb_build_object('ok', false, 'code', 'LOCKED', 'lockedUntil', v_viewer.locked_until);
  end if;
  if extensions.crypt(p_pin, v_viewer.pin_hash) <> v_viewer.pin_hash then
    update public.organization_pin_viewers set failed_count = failed_count + 1,
      locked_until = case when failed_count + 1 >= 5 then now() + interval '30 minutes' else null end, updated_at = now()
    where id = v_viewer.id;
    return jsonb_build_object('ok', false, 'code', 'INVALID_CREDENTIALS');
  end if;
  update public.organization_pin_viewers set failed_count = 0, locked_until = null, last_login_at = now(), updated_at = now() where id = v_viewer.id;
  delete from public.organization_pin_sessions where expires_at < now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.organization_pin_sessions(token_hash, tenant_id, viewer_id, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_tenant, v_viewer.id, v_expires);
  insert into public.organization_audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, detail)
  values (v_tenant, null, 'name_login', 'pin_viewer', v_viewer.login_name, jsonb_build_object('role', v_viewer.viewer_role));
  return jsonb_build_object('ok', true, 'token', v_token, 'expiresAt', v_expires, 'label', v_viewer.label, 'role', v_viewer.viewer_role);
end $$;
revoke all on function public.organization_name_login(text,text,text) from public;
grant execute on function public.organization_name_login(text,text,text) to anon, authenticated;

-- Manager view of phone-login people (no phone digits beyond the mask).
create or replace function public.organization_login_members(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v_tenant uuid;
begin
  select id into v_tenant from public.tenants where slug = lower(trim(p_slug)) and status = 'active';
  if v_tenant is null or not public.organization_can_manage(v_tenant) then raise exception 'organization_manage_required' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(login_name, label), 'role', viewer_role, 'phoneMasked', '010-****-****',
      'active', active, 'locked', locked_until is not null and locked_until > now(), 'lastLoginAt', last_login_at) order by viewer_role, coalesce(login_name, label))
    from public.organization_pin_viewers where tenant_id = v_tenant), '[]'::jsonb);
end $$;
revoke all on function public.organization_login_members(text) from public, anon;
grant execute on function public.organization_login_members(text) to authenticated;

-- 부장: existing phone viewer becomes a name login; password re-derived from the stored phone (no digits in this file).
update public.organization_pin_viewers v
set login_name = '김찬구', label = '김찬구', viewer_role = 'chair', can_approve = true,
    pin_hash = extensions.crypt(right(v.phone_digits,4), extensions.gen_salt('bf', 8)), failed_count = 0, locked_until = null, updated_at = now()
from public.tenants t
where t.id = v.tenant_id and t.slug = 'mokpo-mission' and v.label like '선교부장%' and v.login_name is null;
