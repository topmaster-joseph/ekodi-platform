-- EKODI points super-admin governance (#6739, P1).
-- Every policy edit, manual adjustment and reversal is a REQUEST that must be
-- decided on the server. Wallet balances are never edited directly: money-like
-- corrections are compensating ledger entries. Economic requests require a
-- second, different super-admin. A request whose target changed after it was
-- proposed is marked stale instead of overwriting (optimistic concurrency).
-- All actions append to a SHA-256 hash-chained, append-only audit log.
-- Callers: api-worker after canonical EKODI super_admin session verification,
-- using the service_role key. Never executable by anon/authenticated.
create schema if not exists ekodi_points_private;

create table if not exists ekodi_points_private.admin_requests (
  request_id uuid primary key default gen_random_uuid(),
  request_key text not null unique check (request_key ~ '^[A-Za-z0-9:_-]{8,120}$'),
  kind text not null check (kind in ('site','rule','transfer','campaign','adjustment','reversal')),
  target jsonb not null check (jsonb_typeof(target)='object'),
  before_state jsonb,
  proposed jsonb not null check (jsonb_typeof(proposed)='object'),
  reason text not null check (length(btrim(reason)) between 5 and 500),
  risk text not null check (risk in ('standard','economic')),
  requested_by text not null,
  requested_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending','applied','rejected','cancelled','stale')),
  decided_by text,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note)<=500),
  result jsonb
);
create index if not exists admin_requests_status_idx
  on ekodi_points_private.admin_requests(status,requested_at desc);

create table if not exists ekodi_points_private.admin_audit (
  seq bigint generated always as identity primary key,
  at timestamptz not null default clock_timestamp(),
  actor text not null,
  action text not null,
  request_id uuid,
  detail jsonb not null default '{}'::jsonb,
  prev_hash bytea,
  row_hash bytea not null
);
alter table ekodi_points_private.admin_requests enable row level security;
alter table ekodi_points_private.admin_audit enable row level security;
revoke all on table ekodi_points_private.admin_requests, ekodi_points_private.admin_audit
  from public, anon, authenticated, service_role;

create or replace function ekodi_points_private.reject_audit_mutation()
returns trigger language plpgsql security invoker
set search_path = pg_catalog
as $$ begin raise exception 'POINT_ADMIN_AUDIT_APPEND_ONLY' using errcode='23514'; end; $$;
drop trigger if exists ekodi_points_admin_audit_append_only on ekodi_points_private.admin_audit;
create trigger ekodi_points_admin_audit_append_only
before update or delete on ekodi_points_private.admin_audit
for each row execute function ekodi_points_private.reject_audit_mutation();
revoke all on function ekodi_points_private.reject_audit_mutation() from public, anon, authenticated;

create or replace function ekodi_points_private.audit_row_hash(
  p_prev bytea, p_at timestamptz, p_actor text, p_action text, p_request uuid, p_detail jsonb
) returns bytea language sql immutable
set search_path = pg_catalog
as $$
  select sha256(coalesce(p_prev,'\x'::bytea) || convert_to(
    to_char(p_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US') || '|' || p_actor || '|' ||
    p_action || '|' || coalesce(p_request::text,'') || '|' || p_detail::text, 'UTF8'))
$$;

create or replace function ekodi_points_private.admin_audit_append(
  p_actor text, p_action text, p_request uuid, p_detail jsonb
) returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_prev bytea; v_at timestamptz := clock_timestamp();
begin
  -- Serialize chain appends so the hash chain is linear.
  perform pg_advisory_xact_lock(hashtextextended('ekodi-points-admin-audit',0));
  select row_hash into v_prev from ekodi_points_private.admin_audit order by seq desc limit 1;
  insert into ekodi_points_private.admin_audit(at,actor,action,request_id,detail,prev_hash,row_hash)
  values(v_at,p_actor,p_action,p_request,coalesce(p_detail,'{}'::jsonb),v_prev,
    ekodi_points_private.audit_row_hash(v_prev,v_at,p_actor,p_action,p_request,coalesce(p_detail,'{}'::jsonb)));
end;
$$;

create or replace function ekodi_points_private.assert_admin_actor(p_actor text)
returns text language plpgsql immutable
set search_path = pg_catalog
as $$
begin
  if p_actor is null or p_actor !~ '^ekodi-admin:[^@[:space:]]{1,64}@[^@[:space:]]{1,190}$' then
    raise exception 'ADMIN_ACTOR_REQUIRED';
  end if;
  return lower(p_actor);
end;
$$;

-- Current state of a request target, used both when proposing (before_state)
-- and when deciding (stale detection). NULL means "does not exist yet".
create or replace function ekodi_points_private.admin_target_state(p_kind text, p_target jsonb)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare v jsonb;
begin
  if p_kind='site' then
    select jsonb_build_object('display_name',display_name,'enabled',enabled,'daily_cap',daily_cap)
      into v from public.ekodi_point_sites where site_id=p_target->>'site_id';
  elsif p_kind='rule' then
    select jsonb_build_object('points',points,'daily_cap',daily_cap,'daily_events',daily_events,
      'min_active_seconds',min_active_seconds,'enabled',enabled)
      into v from public.ekodi_point_rules
      where site_id=p_target->>'site_id' and rule_id=p_target->>'rule_id';
  elsif p_kind='transfer' then
    select jsonb_build_object('numerator',numerator,'denominator',denominator,
      'daily_cap',daily_cap,'enabled',enabled)
      into v from public.ekodi_point_transfer_policies
      where from_site=p_target->>'from_site' and to_site=p_target->>'to_site';
  elsif p_kind='campaign' then
    if p_target ? 'campaign_id' then
      select jsonb_build_object('site_id',site_id,'title',title,'recipient_name',recipient_name,
        'enabled',enabled,'starts_at',starts_at,'ends_at',ends_at)
        into v from public.ekodi_point_donation_campaigns
        where campaign_id=(p_target->>'campaign_id')::uuid;
    end if;
  elsif p_kind='adjustment' then
    select jsonb_build_object('balance',balance) into v from public.ekodi_point_wallets
      where site_id=p_target->>'site_id' and user_id=(p_target->>'person_id')::uuid;
    v := coalesce(v,jsonb_build_object('balance',0));
  elsif p_kind='reversal' then
    select jsonb_build_object('site_id',l.site_id,'user_id',l.user_id,'amount',l.amount,
      'event_kind',l.event_kind,'reversed',exists(
        select 1 from public.ekodi_point_ledger r
        where r.site_id=l.site_id and r.user_id=l.user_id and r.event_key='reversal:'||l.id))
      into v from public.ekodi_point_ledger l where l.id=(p_target->>'ledger_id')::bigint;
  end if;
  return v;
end;
$$;

create or replace function ekodi_points_private.int_field(p jsonb, k text, lo bigint, hi bigint)
returns integer language plpgsql immutable
set search_path = pg_catalog
as $$
begin
  if jsonb_typeof(p->k) is distinct from 'number' or (p->>k) !~ '^-?[0-9]{1,9}$'
     or (p->>k)::bigint not between lo and hi then
    raise exception 'INVALID_ADMIN_FIELD:%',k;
  end if;
  return (p->>k)::integer;
end;
$$;

create or replace function public.ekodi_points_admin_propose(
  p_actor text, p_kind text, p_target jsonb, p_proposed jsonb, p_reason text, p_request_key text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := ekodi_points_private.assert_admin_actor(p_actor);
  v_before jsonb;
  v_risk text := 'standard';
  v_existing ekodi_points_private.admin_requests%rowtype;
  v_id uuid;
  v_points integer; v_cap integer; v_events integer;
begin
  if p_target is null or jsonb_typeof(p_target)<>'object'
     or p_proposed is null or jsonb_typeof(p_proposed)<>'object'
     or octet_length(p_proposed::text)>4096 or octet_length(p_target::text)>1024 then
    raise exception 'INVALID_ADMIN_REQUEST';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 5 and 500 then
    raise exception 'ADMIN_REASON_REQUIRED';
  end if;
  select * into v_existing from ekodi_points_private.admin_requests where request_key=p_request_key;
  if found then
    -- Idempotent retry of the same submission returns the original request.
    if v_existing.requested_by<>v_actor or v_existing.kind<>p_kind
       or v_existing.target<>p_target or v_existing.proposed<>p_proposed then
      raise exception 'ADMIN_REQUEST_KEY_REUSED';
    end if;
    return jsonb_build_object('request_id',v_existing.request_id,'status',v_existing.status,'replayed',true);
  end if;

  if p_kind in ('site','rule') and coalesce(p_target->>'site_id','') !~ '^[a-z0-9_-]{2,64}$' then
    raise exception 'INVALID_ADMIN_FIELD:site_id';
  end if;
  if p_kind='site' then
    if p_proposed ? 'daily_cap' then perform ekodi_points_private.int_field(p_proposed,'daily_cap',0,100000); end if;
    if p_proposed ? 'enabled' and jsonb_typeof(p_proposed->'enabled')<>'boolean' then raise exception 'INVALID_ADMIN_FIELD:enabled'; end if;
    if p_proposed ? 'display_name' and length(btrim(coalesce(p_proposed->>'display_name',''))) not between 2 and 80 then
      raise exception 'INVALID_ADMIN_FIELD:display_name';
    end if;
    if (p_proposed - array['display_name','enabled','daily_cap']) <> '{}'::jsonb then raise exception 'UNKNOWN_ADMIN_FIELD'; end if;
  elsif p_kind='rule' then
    if coalesce(p_target->>'rule_id','') !~ '^[a-z0-9_-]{2,64}$' then raise exception 'INVALID_ADMIN_FIELD:rule_id'; end if;
    if (p_proposed - array['points','daily_cap','daily_events','min_active_seconds','enabled']) <> '{}'::jsonb then raise exception 'UNKNOWN_ADMIN_FIELD'; end if;
    v_points := ekodi_points_private.int_field(p_proposed,'points',1,10000);
    v_cap := ekodi_points_private.int_field(p_proposed,'daily_cap',0,100000);
    v_events := ekodi_points_private.int_field(p_proposed,'daily_events',0,10000);
    perform ekodi_points_private.int_field(p_proposed,'min_active_seconds',0,86400);
    if jsonb_typeof(p_proposed->'enabled') is distinct from 'boolean' then raise exception 'INVALID_ADMIN_FIELD:enabled'; end if;
    -- Low-trust browser-observed rules keep their hard server ceilings.
    if p_target->>'rule_id'='active' and (v_points>5 or v_cap>50 or v_events>10) then
      raise exception 'LOW_TRUST_RULE_LIMIT';
    end if;
    if p_target->>'rule_id'='referral' and (v_points>5 or v_cap>25 or v_events>5) then
      raise exception 'LOW_TRUST_RULE_LIMIT';
    end if;
    if not exists(select 1 from public.ekodi_point_sites where site_id=p_target->>'site_id') then
      raise exception 'POINT_SITE_NOT_FOUND';
    end if;
  elsif p_kind='transfer' then
    if coalesce(p_target->>'from_site','') !~ '^[a-z0-9_-]{2,64}$'
       or coalesce(p_target->>'to_site','') !~ '^[a-z0-9_-]{2,64}$'
       or p_target->>'from_site'=p_target->>'to_site' then raise exception 'INVALID_ADMIN_FIELD:transfer_sites'; end if;
    if (p_proposed - array['numerator','denominator','daily_cap','enabled']) <> '{}'::jsonb then raise exception 'UNKNOWN_ADMIN_FIELD'; end if;
    perform ekodi_points_private.int_field(p_proposed,'numerator',1,1000);
    perform ekodi_points_private.int_field(p_proposed,'denominator',1,1000);
    perform ekodi_points_private.int_field(p_proposed,'daily_cap',0,100000);
    if jsonb_typeof(p_proposed->'enabled') is distinct from 'boolean' then raise exception 'INVALID_ADMIN_FIELD:enabled'; end if;
    if (p_proposed->>'enabled')::boolean then v_risk:='economic'; end if;
  elsif p_kind='campaign' then
    if (p_proposed - array['title','recipient_name','enabled','starts_at','ends_at']) <> '{}'::jsonb then raise exception 'UNKNOWN_ADMIN_FIELD'; end if;
    if not (p_target ? 'campaign_id') and (coalesce(p_target->>'site_id','') !~ '^[a-z0-9_-]{2,64}$'
       or not (p_proposed ? 'title') or not (p_proposed ? 'recipient_name')) then
      raise exception 'INVALID_ADMIN_FIELD:new_campaign';
    end if;
    if p_target ? 'campaign_id' then perform (p_target->>'campaign_id')::uuid; end if;
    if p_proposed ? 'enabled' and jsonb_typeof(p_proposed->'enabled')<>'boolean' then raise exception 'INVALID_ADMIN_FIELD:enabled'; end if;
    if coalesce((p_proposed->>'enabled')::boolean,false) then v_risk:='economic'; end if;
  elsif p_kind='adjustment' then
    if coalesce(p_target->>'site_id','') !~ '^[a-z0-9_-]{2,64}$' then raise exception 'INVALID_ADMIN_FIELD:site_id'; end if;
    if (p_proposed - array['amount']) <> '{}'::jsonb then raise exception 'UNKNOWN_ADMIN_FIELD'; end if;
    if ekodi_points_private.int_field(p_proposed,'amount',-10000,10000)=0 then raise exception 'INVALID_ADMIN_FIELD:amount'; end if;
    if not exists(select 1 from public.people where id=(p_target->>'person_id')::uuid and status='active') then
      raise exception 'POINT_PERSON_NOT_FOUND';
    end if;
    v_risk:='economic';
  elsif p_kind='reversal' then
    if coalesce(p_target->>'ledger_id','') !~ '^[0-9]{1,18}$' then raise exception 'INVALID_ADMIN_FIELD:ledger_id'; end if;
    if p_proposed <> '{}'::jsonb then raise exception 'UNKNOWN_ADMIN_FIELD'; end if;
    v_risk:='economic';
  else
    raise exception 'INVALID_ADMIN_KIND';
  end if;

  v_before := ekodi_points_private.admin_target_state(p_kind,p_target);
  if p_kind='reversal' then
    if v_before is null then raise exception 'POINT_LEDGER_ENTRY_NOT_FOUND'; end if;
    if (v_before->>'reversed')::boolean then raise exception 'ALREADY_REVERSED'; end if;
    if v_before->>'event_kind' in ('reversal','transfer_out','transfer_in') then
      raise exception 'REVERSAL_KIND_NOT_SUPPORTED';
    end if;
  end if;
  if p_kind='site' and v_before is null and not (p_proposed ? 'display_name') then
    raise exception 'INVALID_ADMIN_FIELD:display_name';
  end if;
  if p_kind='site' and coalesce((p_proposed->>'enabled')::boolean,false)
     and coalesce((v_before->>'enabled')::boolean,false)=false then
    v_risk:='economic';
  end if;

  insert into ekodi_points_private.admin_requests
    (request_key,kind,target,before_state,proposed,reason,risk,requested_by)
  values(p_request_key,p_kind,p_target,v_before,p_proposed,btrim(p_reason),v_risk,v_actor)
  returning request_id into v_id;
  perform ekodi_points_private.admin_audit_append(v_actor,'propose',v_id,
    jsonb_build_object('kind',p_kind,'target',p_target,'proposed',p_proposed,'risk',v_risk));
  return jsonb_build_object('request_id',v_id,'status','pending','risk',v_risk,'replayed',false);
end;
$$;

create or replace function public.ekodi_points_admin_decide(
  p_actor text, p_request_id uuid, p_approve boolean, p_note text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := ekodi_points_private.assert_admin_actor(p_actor);
  r ekodi_points_private.admin_requests%rowtype;
  v_now jsonb;
  v_result jsonb;
  v_site text; v_user uuid; v_amount integer; v_balance bigint; v_orig record; v_cid uuid;
begin
  if p_approve is null then raise exception 'INVALID_ADMIN_DECISION'; end if;
  if p_note is not null and length(p_note)>500 then raise exception 'INVALID_ADMIN_FIELD:note'; end if;
  select * into r from ekodi_points_private.admin_requests where request_id=p_request_id for update;
  if not found then raise exception 'ADMIN_REQUEST_NOT_FOUND'; end if;
  if r.status<>'pending' then
    return jsonb_build_object('request_id',r.request_id,'status',r.status,'replayed',true);
  end if;
  if not p_approve then
    update ekodi_points_private.admin_requests set status='rejected',decided_by=v_actor,
      decided_at=now(),decision_note=p_note where request_id=r.request_id;
    perform ekodi_points_private.admin_audit_append(v_actor,'reject',r.request_id,
      jsonb_build_object('note',p_note));
    return jsonb_build_object('request_id',r.request_id,'status','rejected');
  end if;
  if r.risk='economic' and r.requested_by=v_actor then
    raise exception 'SECOND_APPROVER_REQUIRED';
  end if;

  -- Lock the target and compare with the state the requester saw.
  if r.kind='site' then
    perform 1 from public.ekodi_point_sites where site_id=r.target->>'site_id' for update;
  elsif r.kind='rule' then
    perform 1 from public.ekodi_point_rules where site_id=r.target->>'site_id' and rule_id=r.target->>'rule_id' for update;
  elsif r.kind='transfer' then
    perform 1 from public.ekodi_point_transfer_policies where from_site=r.target->>'from_site' and to_site=r.target->>'to_site' for update;
  elsif r.kind='campaign' and r.target ? 'campaign_id' then
    perform 1 from public.ekodi_point_donation_campaigns where campaign_id=(r.target->>'campaign_id')::uuid for update;
  elsif r.kind='adjustment' then
    perform pg_advisory_xact_lock(hashtextextended((r.target->>'site_id')||':'||(r.target->>'person_id'),0));
  elsif r.kind='reversal' then
    select site_id,user_id,amount,event_kind,id into v_orig from public.ekodi_point_ledger
      where id=(r.target->>'ledger_id')::bigint;
    perform pg_advisory_xact_lock(hashtextextended(v_orig.site_id||':'||v_orig.user_id::text,0));
  end if;
  v_now := ekodi_points_private.admin_target_state(r.kind,r.target);
  if v_now is distinct from r.before_state and r.kind<>'adjustment' then
    update ekodi_points_private.admin_requests set status='stale',decided_by=v_actor,
      decided_at=now(),decision_note=p_note,result=jsonb_build_object('current',v_now)
      where request_id=r.request_id;
    perform ekodi_points_private.admin_audit_append(v_actor,'stale',r.request_id,
      jsonb_build_object('expected',r.before_state,'current',v_now));
    return jsonb_build_object('request_id',r.request_id,'status','stale');
  end if;

  if r.kind='site' then
    if r.before_state is null then
      insert into public.ekodi_point_sites(site_id,display_name,enabled,daily_cap)
      values(r.target->>'site_id',btrim(r.proposed->>'display_name'),
        coalesce((r.proposed->>'enabled')::boolean,false),coalesce((r.proposed->>'daily_cap')::integer,100));
    else
      update public.ekodi_point_sites set
        display_name=coalesce(btrim(r.proposed->>'display_name'),display_name),
        enabled=coalesce((r.proposed->>'enabled')::boolean,enabled),
        daily_cap=coalesce((r.proposed->>'daily_cap')::integer,daily_cap)
      where site_id=r.target->>'site_id';
    end if;
  elsif r.kind='rule' then
    insert into public.ekodi_point_rules(site_id,rule_id,points,daily_cap,daily_events,min_active_seconds,enabled)
    values(r.target->>'site_id',r.target->>'rule_id',(r.proposed->>'points')::integer,
      (r.proposed->>'daily_cap')::integer,(r.proposed->>'daily_events')::integer,
      (r.proposed->>'min_active_seconds')::integer,(r.proposed->>'enabled')::boolean)
    on conflict(site_id,rule_id) do update set points=excluded.points,daily_cap=excluded.daily_cap,
      daily_events=excluded.daily_events,min_active_seconds=excluded.min_active_seconds,enabled=excluded.enabled;
  elsif r.kind='transfer' then
    insert into public.ekodi_point_transfer_policies(from_site,to_site,numerator,denominator,daily_cap,enabled)
    values(r.target->>'from_site',r.target->>'to_site',(r.proposed->>'numerator')::integer,
      (r.proposed->>'denominator')::integer,(r.proposed->>'daily_cap')::integer,(r.proposed->>'enabled')::boolean)
    on conflict(from_site,to_site) do update set numerator=excluded.numerator,denominator=excluded.denominator,
      daily_cap=excluded.daily_cap,enabled=excluded.enabled;
  elsif r.kind='campaign' then
    if r.target ? 'campaign_id' then
      update public.ekodi_point_donation_campaigns set
        title=coalesce(btrim(r.proposed->>'title'),title),
        recipient_name=coalesce(btrim(r.proposed->>'recipient_name'),recipient_name),
        enabled=coalesce((r.proposed->>'enabled')::boolean,enabled),
        starts_at=case when r.proposed ? 'starts_at' then (r.proposed->>'starts_at')::timestamptz else starts_at end,
        ends_at=case when r.proposed ? 'ends_at' then (r.proposed->>'ends_at')::timestamptz else ends_at end
      where campaign_id=(r.target->>'campaign_id')::uuid returning campaign_id into v_cid;
    else
      insert into public.ekodi_point_donation_campaigns(site_id,title,recipient_name,enabled,starts_at,ends_at)
      values(r.target->>'site_id',btrim(r.proposed->>'title'),btrim(r.proposed->>'recipient_name'),
        coalesce((r.proposed->>'enabled')::boolean,false),(r.proposed->>'starts_at')::timestamptz,
        (r.proposed->>'ends_at')::timestamptz) returning campaign_id into v_cid;
    end if;
    v_result := jsonb_build_object('campaign_id',v_cid);
  elsif r.kind='adjustment' then
    v_site := r.target->>'site_id'; v_user := (r.target->>'person_id')::uuid;
    v_amount := (r.proposed->>'amount')::integer;
    if not exists(select 1 from public.ekodi_point_sites where site_id=v_site) then raise exception 'POINT_SITE_NOT_FOUND'; end if;
    insert into public.ekodi_point_wallets(site_id,user_id) values(v_site,v_user) on conflict do nothing;
    select balance into v_balance from public.ekodi_point_wallets where site_id=v_site and user_id=v_user for update;
    if v_balance+v_amount<0 then raise exception 'ADJUSTMENT_EXCEEDS_BALANCE'; end if;
    insert into public.ekodi_point_ledger(site_id,user_id,amount,event_kind,rule_id,event_key,metadata)
    values(v_site,v_user,v_amount,'admin_adjustment',null,'admin:'||r.request_id,
      jsonb_build_object('request_id',r.request_id,'requested_by',r.requested_by,'approved_by',v_actor,'reason',r.reason));
    update public.ekodi_point_wallets set balance=balance+v_amount,updated_at=now()
      where site_id=v_site and user_id=v_user returning balance into v_balance;
    v_result := jsonb_build_object('amount',v_amount,'balance',v_balance);
  elsif r.kind='reversal' then
    select balance into v_balance from public.ekodi_point_wallets
      where site_id=v_orig.site_id and user_id=v_orig.user_id for update;
    if v_balance-v_orig.amount<0 then raise exception 'REVERSAL_EXCEEDS_BALANCE'; end if;
    insert into public.ekodi_point_ledger(site_id,user_id,amount,event_kind,rule_id,event_key,metadata)
    values(v_orig.site_id,v_orig.user_id,-v_orig.amount,'reversal',null,'reversal:'||v_orig.id,
      jsonb_build_object('reverses_ledger_id',v_orig.id,'request_id',r.request_id,
        'requested_by',r.requested_by,'approved_by',v_actor,'reason',r.reason));
    update public.ekodi_point_wallets set balance=balance-v_orig.amount,updated_at=now()
      where site_id=v_orig.site_id and user_id=v_orig.user_id returning balance into v_balance;
    v_result := jsonb_build_object('reversed_ledger_id',v_orig.id,'amount',-v_orig.amount,'balance',v_balance);
  end if;

  update ekodi_points_private.admin_requests set status='applied',decided_by=v_actor,
    decided_at=now(),decision_note=p_note,result=coalesce(v_result,'{}'::jsonb)
    where request_id=r.request_id;
  perform ekodi_points_private.admin_audit_append(v_actor,'apply',r.request_id,
    jsonb_build_object('kind',r.kind,'target',r.target,'before',r.before_state,
      'after',ekodi_points_private.admin_target_state(r.kind,r.target),'result',v_result));
  return jsonb_build_object('request_id',r.request_id,'status','applied','result',coalesce(v_result,'{}'::jsonb));
end;
$$;

create or replace function public.ekodi_points_admin_cancel(p_actor text, p_request_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_actor text := ekodi_points_private.assert_admin_actor(p_actor); r ekodi_points_private.admin_requests%rowtype;
begin
  select * into r from ekodi_points_private.admin_requests where request_id=p_request_id for update;
  if not found then raise exception 'ADMIN_REQUEST_NOT_FOUND'; end if;
  if r.requested_by<>v_actor then raise exception 'ONLY_REQUESTER_MAY_CANCEL'; end if;
  if r.status<>'pending' then return jsonb_build_object('request_id',r.request_id,'status',r.status,'replayed',true); end if;
  update ekodi_points_private.admin_requests set status='cancelled',decided_by=v_actor,decided_at=now()
    where request_id=r.request_id;
  perform ekodi_points_private.admin_audit_append(v_actor,'cancel',r.request_id,'{}'::jsonb);
  return jsonb_build_object('request_id',r.request_id,'status','cancelled');
end;
$$;

-- Recomputes the hash chain; returns the first broken sequence number or null.
create or replace function ekodi_points_private.admin_audit_verify()
returns bigint language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare a record; v_prev bytea;
begin
  for a in select * from ekodi_points_private.admin_audit order by seq loop
    if a.prev_hash is distinct from v_prev
       or a.row_hash<>ekodi_points_private.audit_row_hash(a.prev_hash,a.at,a.actor,a.action,a.request_id,a.detail) then
      return a.seq;
    end if;
    v_prev := a.row_hash;
  end loop;
  return null;
end;
$$;

-- Read model for the super-admin console: KPIs, anomalies, pending requests,
-- recent audit. Aggregates only; no member identities beyond opaque ids.
create or replace function public.ekodi_points_admin_overview(p_actor text)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := ekodi_points_private.assert_admin_actor(p_actor);
  v_start timestamptz := ((now() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul');
begin
  return jsonb_build_object(
    'kpis', jsonb_build_object(
      'earned_today',(select coalesce(sum(amount),0) from public.ekodi_point_ledger where event_kind='earn' and created_at>=v_start),
      'earners_today',(select count(distinct user_id) from public.ekodi_point_ledger where event_kind='earn' and created_at>=v_start),
      'earned_7d',(select coalesce(sum(amount),0) from public.ekodi_point_ledger where event_kind='earn' and created_at>=now()-interval '7 days'),
      'adjusted_7d',(select coalesce(sum(amount),0) from public.ekodi_point_ledger where event_kind in ('admin_adjustment','reversal') and created_at>=now()-interval '7 days'),
      'outstanding',(select coalesce(sum(balance),0) from public.ekodi_point_wallets),
      'wallets',(select count(*) from public.ekodi_point_wallets),
      'pending_requests',(select count(*) from ekodi_points_private.admin_requests where status='pending')),
    'reconciliation_drift',(select count(*) from ekodi_points_private.wallet_reconciliation()),
    'audit_chain_broken_at',ekodi_points_private.admin_audit_verify(),
    'anomalies',jsonb_build_object(
      'site_cap_hits_today',(select coalesce(jsonb_agg(x),'[]'::jsonb) from (
        select l.site_id,count(*) as members from (
          select site_id,user_id,sum(amount) s from public.ekodi_point_ledger
          where event_kind='earn' and created_at>=v_start group by site_id,user_id) l
        join public.ekodi_point_sites s on s.site_id=l.site_id
        where l.s>=s.daily_cap group by l.site_id) x),
      'burst_last_hour',(select coalesce(jsonb_agg(x),'[]'::jsonb) from (
        select site_id,user_id,count(*) as events from public.ekodi_point_ledger
        where event_kind='earn' and created_at>=now()-interval '1 hour'
        group by site_id,user_id having count(*)>=20 order by count(*) desc limit 20) x),
      'referral_heavy_inviters_today',(select coalesce(jsonb_agg(x),'[]'::jsonb) from (
        select site_id,inviter_person_id,count(*) as rewards from public.ekodi_point_referral_rewards
        where credited_at>=v_start group by site_id,inviter_person_id having count(*)>=3) x)),
    'requests',(select coalesce(jsonb_agg(to_jsonb(q) order by q.requested_at desc),'[]'::jsonb) from (
      select request_id,kind,target,before_state,proposed,reason,risk,requested_by,requested_at,
             status,decided_by,decided_at,decision_note,result
      from ekodi_points_private.admin_requests order by requested_at desc limit 50) q),
    'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.seq desc),'[]'::jsonb) from (
      select seq,at,actor,action,request_id,detail from ekodi_points_private.admin_audit
      order by seq desc limit 50) a)
  );
end;
$$;

-- Member transaction audit view for a specific site/person; every lookup of a
-- member's history is itself audited.
create or replace function public.ekodi_points_admin_member_ledger(
  p_actor text, p_site text, p_person uuid, p_limit integer default 50
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_actor text := ekodi_points_private.assert_admin_actor(p_actor);
begin
  if p_site is null or p_site !~ '^[a-z0-9_-]{2,64}$' or p_person is null then raise exception 'INVALID_ADMIN_REQUEST'; end if;
  perform ekodi_points_private.admin_audit_append(v_actor,'view_member_ledger',null,
    jsonb_build_object('site_id',p_site,'person_id',p_person));
  return jsonb_build_object(
    'balance',(select balance from public.ekodi_point_wallets where site_id=p_site and user_id=p_person),
    'entries',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id desc),'[]'::jsonb) from (
      select id,amount,event_kind,rule_id,event_key,created_at from public.ekodi_point_ledger
      where site_id=p_site and user_id=p_person order by id desc
      limit greatest(1,least(coalesce(p_limit,50),200))) e));
end;
$$;

revoke all on function
  ekodi_points_private.audit_row_hash(bytea,timestamptz,text,text,uuid,jsonb),
  ekodi_points_private.admin_audit_append(text,text,uuid,jsonb),
  ekodi_points_private.assert_admin_actor(text),
  ekodi_points_private.admin_target_state(text,jsonb),
  ekodi_points_private.int_field(jsonb,text,bigint,bigint),
  ekodi_points_private.admin_audit_verify(),
  public.ekodi_points_admin_propose(text,text,jsonb,jsonb,text,text),
  public.ekodi_points_admin_decide(text,uuid,boolean,text),
  public.ekodi_points_admin_cancel(text,uuid),
  public.ekodi_points_admin_overview(text),
  public.ekodi_points_admin_member_ledger(text,text,uuid,integer)
  from public, anon, authenticated;
grant execute on function
  public.ekodi_points_admin_propose(text,text,jsonb,jsonb,text,text),
  public.ekodi_points_admin_decide(text,uuid,boolean,text),
  public.ekodi_points_admin_cancel(text,uuid),
  public.ekodi_points_admin_overview(text),
  public.ekodi_points_admin_member_ledger(text,text,uuid,integer)
  to service_role;
