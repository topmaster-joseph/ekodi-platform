-- EKODI Volunteer module v1: reuses the tenant-owned canonical Activity + Person ledger.
-- Donor pledges are promises, NOT payment transactions.
create table if not exists public.volunteer_pledges (
 id uuid primary key default gen_random_uuid(),
 activity_id uuid not null references public.activities(id) on delete cascade,
 person_id uuid not null references public.people(id) on delete restrict,
 bricks integer not null check (bricks between 1 and 10000),
 amount_krw integer not null check (amount_krw > 0),
 affiliation text not null default '',
 note text not null default '',
 status text not null default 'pending' check (status in ('pending','confirmed','cancelled')),
 confirmed_by uuid references auth.users(id) on delete set null,
 confirmed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(activity_id,person_id)
);
create index if not exists volunteer_pledges_activity_status_idx on public.volunteer_pledges(activity_id,status,created_at);
alter table public.volunteer_pledges enable row level security;
revoke all on table public.volunteer_pledges from public,anon,authenticated;

create table if not exists public.volunteer_pledge_audit (
 id bigint generated always as identity primary key,
 pledge_id uuid not null references public.volunteer_pledges(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 action text not null,
 before_record jsonb,
 after_record jsonb,
 created_at timestamptz not null default now()
);
alter table public.volunteer_pledge_audit enable row level security;
revoke all on table public.volunteer_pledge_audit from public,anon,authenticated;

-- The campaign belongs to the existing Mission tenant; future campaigns can
-- point at any explicitly authorized tenant, with no parallel person database.
do $seed$
declare v_tenant uuid;
begin
 select id into v_tenant from public.tenants where slug='ekodimission';
 if v_tenant is null then raise exception 'VOLUNTEER_TENANT_NOT_FOUND'; end if;
 insert into public.activities(
  workspace_tenant_id,activity_key,activity_type,title,summary,starts_at,ends_at,venue,
  capacity,status,visibility,registration_open,metadata
 ) values (
  v_tenant,'261205-coal-delivery','volunteer','제12회 사랑의 연탄 배달',
  '지역 교회·학교·선교단체와 함께하는 연탄 나눔 봉사 및 후원',
  '2026-12-05 10:00:00+09',null,'목포 서산초등학교 후문 버스 정류장',
  50,'published','public',true,
  '{"registration_deadline":"2026-11-27T12:00:00+09:00","unit_price_krw":1300,"support_account":"농협 351-1185-2874-13","support_account_holder":"토끼와거북","volunteer_module":true}'::jsonb
 )
 on conflict(workspace_tenant_id,activity_key) do nothing;
end
$seed$;

create or replace function public.volunteer_campaign_public_status(p_workspace_slug text,p_activity_key text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $fn$
declare v public.activities%rowtype; v_deadline timestamptz; v_used integer:=0; v_waitlist integer:=0;
begin
 select a.* into v from public.activities a join public.tenants t on t.id=a.workspace_tenant_id
 where t.slug=lower(trim(p_workspace_slug)) and a.activity_key=p_activity_key
 and a.activity_type='volunteer' and a.status='published' and a.visibility='public';
 if not found then return jsonb_build_object('ok',false,'error','campaign_unavailable');end if;
 v_deadline:=nullif(v.metadata->>'registration_deadline','')::timestamptz;
 select coalesce(sum(p.party_size) filter(where p.status in ('applied','confirmed','attended')),0),
        coalesce(sum(p.party_size) filter(where p.status='waitlist'),0)
 into v_used,v_waitlist from public.activity_participations p where p.activity_id=v.id;
 return jsonb_build_object('ok',true,'activity_key',v.activity_key,'title',v.title,
  'capacity',v.capacity,'applied_count',v_used,'waitlist_count',v_waitlist,
  'registration_open',v.registration_open and (v_deadline is null or now()<v_deadline) and (v.starts_at is null or now()<v.starts_at));
end $fn$;
revoke all on function public.volunteer_campaign_public_status(text,text) from public;
grant execute on function public.volunteer_campaign_public_status(text,text) to anon,authenticated;

create or replace function public.volunteer_submit_application(
 p_workspace_slug text,p_activity_key text,p_mode text,p_name text,p_phone text,
 p_party_size integer default 0,p_bricks integer default 0,p_affiliation text default '',
 p_privacy_consent boolean default false,p_photo_consent boolean default false,p_note text default ''
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $fn$
declare v_activity public.activities%rowtype;v_deadline timestamptz;v_unit integer;
v_participation jsonb:='{}'::jsonb;v_person uuid;v_pledge public.volunteer_pledges%rowtype;
v_existing public.volunteer_pledges%rowtype;v_receipt uuid;v_state text:='';
begin
 if not coalesce(p_privacy_consent,false) then raise exception 'PRIVACY_CONSENT_REQUIRED';end if;
 if p_mode not in ('volunteer','pledge','both') then raise exception 'INVALID_MODE';end if;
 if length(trim(coalesce(p_name,''))) not between 1 and 80 then raise exception 'INVALID_NAME';end if;
 if length(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')) not between 8 and 15 then raise exception 'INVALID_PHONE';end if;
 if length(coalesce(p_affiliation,''))>120 or length(coalesce(p_note,''))>500 then raise exception 'INVALID_NOTES';end if;
 if (p_mode='pledge' and coalesce(p_party_size,-1)<>0) or (p_mode<>'pledge' and coalesce(p_party_size,0) not between 1 and 20) then raise exception 'INVALID_PARTY_SIZE';end if;
 if (p_mode='volunteer' and coalesce(p_bricks,-1)<>0) or (p_mode<>'volunteer' and coalesce(p_bricks,0) not between 1 and 10000) then raise exception 'INVALID_BRICKS';end if;
 select a.* into v_activity from public.activities a join public.tenants t on t.id=a.workspace_tenant_id
 where t.slug=lower(trim(p_workspace_slug)) and a.activity_key=p_activity_key for update;
 if not found or v_activity.activity_type<>'volunteer' or v_activity.status<>'published' or v_activity.visibility<>'public'
 or not v_activity.registration_open then raise exception 'APPLICATION_CLOSED';end if;
 v_deadline:=nullif(v_activity.metadata->>'registration_deadline','')::timestamptz;
 if (v_deadline is not null and now()>=v_deadline) or (v_activity.starts_at is not null and now()>=v_activity.starts_at)
 then raise exception 'VOLUNTEER_DEADLINE_PASSED';end if;
 if p_mode in ('volunteer','both') then
  v_participation:=public.activity_submit_participation(
   p_workspace_slug,p_activity_key,trim(p_name),trim(p_phone),'',p_party_size,'ko','',
   left(concat_ws(' · ',nullif(trim(p_affiliation),''),nullif(trim(p_note),'')),600),
   case when p_photo_consent then 'yes' else 'no' end,true,'website','volunteer-module','[]'::jsonb
  );
  v_person:=(v_participation->>'person_id')::uuid;
  v_receipt:=(v_participation->>'participation_id')::uuid;
  v_state:=coalesce(v_participation->>'status','applied');
 else
  v_person:=public.activity_resolve_person(trim(p_name),trim(p_phone),'','website');
 end if;
 if p_mode in ('pledge','both') then
  v_unit:=coalesce((v_activity.metadata->>'unit_price_krw')::integer,0);
  if v_unit<1 or v_unit>100000 or (p_bricks::bigint*v_unit::bigint)>2147483647 then raise exception 'INVALID_CAMPAIGN_UNIT_PRICE';end if;
  select * into v_existing from public.volunteer_pledges
  where activity_id=v_activity.id and person_id=v_person for update;
  if found and v_existing.status='confirmed' and v_existing.bricks<>p_bricks then
   raise exception 'VOLUNTEER_PLEDGE_ALREADY_CONFIRMED';
  end if;
  insert into public.volunteer_pledges(activity_id,person_id,bricks,amount_krw,affiliation,note)
  values(v_activity.id,v_person,p_bricks,p_bricks*v_unit,left(trim(p_affiliation),120),left(trim(p_note),500))
  on conflict(activity_id,person_id) do update
  set bricks=excluded.bricks,amount_krw=excluded.amount_krw,
      affiliation=excluded.affiliation,note=excluded.note,
      status=case when volunteer_pledges.status='confirmed' then 'confirmed' else 'pending' end,
      updated_at=now()
  returning * into v_pledge;
  v_receipt:=coalesce(v_receipt,v_pledge.id);
  insert into public.volunteer_pledge_audit(pledge_id,action,before_record,after_record)
  values(v_pledge.id,'pledge_submit',case when v_existing.id is null then null else to_jsonb(v_existing) end,to_jsonb(v_pledge));
 end if;
 return jsonb_build_object('ok',true,'receipt_id',v_receipt,
  'participation_status',v_state,'pledge_status',case when p_mode='volunteer' then null else v_pledge.status end);
end $fn$;
revoke all on function public.volunteer_submit_application(text,text,text,text,text,integer,integer,text,boolean,boolean,text) from public;
grant execute on function public.volunteer_submit_application(text,text,text,text,text,integer,integer,text,boolean,boolean,text) to anon,authenticated;

-- Tenant-local access only. Platform-global admin powers never automatically
-- grant access to people or pledges in a tenant.
create or replace function public.volunteer_pledge_admin_snapshot(p_workspace_slug text,p_activity_key text)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $fn$
declare v_activity public.activities%rowtype;v_allowed boolean;v_rows jsonb;
begin
 select a.* into v_activity from public.activities a join public.tenants t on t.id=a.workspace_tenant_id
 where t.slug=lower(trim(p_workspace_slug)) and a.activity_key=p_activity_key and a.activity_type='volunteer';
 if not found then raise exception 'VOLUNTEER_NOT_FOUND';end if;
 select exists(select 1 from jsonb_array_elements(public.current_site_activity_contexts()) x
 where x->>'tenant'=lower(trim(p_workspace_slug)) and x->>'authorization_role' in ('tenant_admin','store_owner'))
 into v_allowed;
 if auth.uid() is null or not v_allowed then raise exception 'VOLUNTEER_ADMIN_FORBIDDEN';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',v.id,'name',pe.display_name,'bricks',v.bricks,'amount_krw',v.amount_krw,
  'status',v.status,'created_at',v.created_at,'confirmed_at',v.confirmed_at
 ) order by v.created_at desc),'[]'::jsonb) into v_rows
 from public.volunteer_pledges v join public.people pe on pe.id=v.person_id
 where v.activity_id=v_activity.id;
 return jsonb_build_object('ok',true,'pledges',v_rows);
end $fn$;
revoke all on function public.volunteer_pledge_admin_snapshot(text,text) from public;
grant execute on function public.volunteer_pledge_admin_snapshot(text,text) to authenticated;

create or replace function public.volunteer_pledge_admin_confirm(p_pledge_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $fn$
declare v public.volunteer_pledges%rowtype;v_activity public.activities%rowtype;v_slug text;v_allowed boolean;v_old jsonb;
begin
 select * into v from public.volunteer_pledges where id=p_pledge_id for update;
 if not found then raise exception 'VOLUNTEER_PLEDGE_NOT_FOUND';end if;
 select a.* into v_activity from public.activities a where a.id=v.activity_id;
 select t.slug into v_slug from public.tenants t where t.id=v_activity.workspace_tenant_id;
 select exists(select 1 from jsonb_array_elements(public.current_site_activity_contexts()) x
 where x->>'tenant'=v_slug and x->>'authorization_role' in ('tenant_admin','store_owner')) into v_allowed;
 if auth.uid() is null or not v_allowed then raise exception 'VOLUNTEER_ADMIN_FORBIDDEN';end if;
 if v.status='cancelled' then raise exception 'CANCELLED_PLEDGE';end if;
 if v.status='confirmed' then return jsonb_build_object('ok',true,'id',v.id,'status','confirmed');end if;
 v_old:=to_jsonb(v);
 update public.volunteer_pledges set status='confirmed',confirmed_by=auth.uid(),confirmed_at=now(),updated_at=now()
 where id=v.id returning * into v;
 insert into public.volunteer_pledge_audit(pledge_id,actor_id,action,before_record,after_record)
 values(v.id,auth.uid(),'payment_manually_confirmed',v_old,to_jsonb(v));
 return jsonb_build_object('ok',true,'id',v.id,'status',v.status);
end $fn$;
revoke all on function public.volunteer_pledge_admin_confirm(uuid) from public;
grant execute on function public.volunteer_pledge_admin_confirm(uuid) to authenticated;

comment on table public.volunteer_pledges is 'Private volunteer donor pledge ledger; not a banking payment confirmation or receipt.';
comment on table public.volunteer_pledge_audit is 'Tenant-authorized audit of pledge submissions and human-confirmed deposits.';
