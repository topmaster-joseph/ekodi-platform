-- EKODI points P2 (#6739): per-site activity evidence adapters and automated
-- anomaly detection.
--
-- Evidence adapters: ONE shared award path; sites differ only by registry rows
-- (site, rule, adapter, trust). A page visit or share click is never an
-- adapter. Trust levels:
--   verified   - evidence is produced by a trusted server system or an operator
--                decision (attendance check-in, instructor-confirmed lecture,
--                approved content, operator-confirmed meeting).
--   low_trust  - member self-report or browser-observed signals; hard capped at
--                5P per event, 50P and 10 events per KST day, like 'active'.
-- Members may submit a claim (pending); only a super-admin decision through
-- the audited governance API turns an operator_confirmed claim into points.
--
-- Anomaly detection: a lightweight AFTER INSERT trigger on the ledger flags
-- bursts in real time; periodic detectors (run by the governance scan RPC)
-- flag cap streaks, referral clusters, shared evidence, repeated rejected
-- claims, ledger/wallet drift and audit-chain breaks. Findings are deduplicated
-- per day and never alter balances; resolution is audited.
create table if not exists public.ekodi_point_evidence_adapters (
  site_id text not null references public.ekodi_point_sites(site_id),
  rule_id text not null,
  adapter text not null check (adapter in (
    'attendance_checkin','lecture_completion','content_approval',
    'meeting_participation','devotion_self_report','operator_confirmed')),
  trust text not null check (trust in ('verified','low_trust')),
  member_claimable boolean not null default false,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (site_id,rule_id,adapter),
  foreign key (site_id,rule_id) references public.ekodi_point_rules(site_id,rule_id),
  -- Self-reports can never be "verified"; server systems are never claimable.
  check (adapter<>'devotion_self_report' or trust='low_trust'),
  check (adapter not in ('attendance_checkin','lecture_completion') or member_claimable=false)
);

create table if not exists public.ekodi_point_evidence_claims (
  claim_id uuid primary key default gen_random_uuid(),
  site_id text not null,
  rule_id text not null,
  adapter text not null,
  person_id uuid not null references public.people(id),
  source_ref text not null check (source_ref ~ '^[A-Za-z0-9:._/-]{3,120}$'),
  note text not null default '' check (length(note)<=500),
  status text not null default 'pending' check (status in ('pending','approved','rejected','duplicate')),
  submitted_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note)<=500),
  ledger_event_key text,
  foreign key (site_id,rule_id,adapter) references public.ekodi_point_evidence_adapters(site_id,rule_id,adapter),
  unique (site_id,rule_id,adapter,person_id,source_ref)
);
create index if not exists ekodi_point_evidence_claims_status_idx
  on public.ekodi_point_evidence_claims(status,submitted_at desc);
create index if not exists ekodi_point_evidence_claims_ref_idx
  on public.ekodi_point_evidence_claims(site_id,adapter,source_ref);

create table if not exists public.ekodi_point_anomalies (
  anomaly_id bigint generated always as identity primary key,
  kind text not null check (kind in ('burst','cap_streak','referral_cluster','shared_evidence',
    'claim_rejections','ledger_drift','audit_chain')),
  severity text not null check (severity in ('info','warning','critical')),
  site_id text,
  person_id uuid,
  detail jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  detected_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  resolved_by text,
  resolved_at timestamptz,
  resolution_note text check (resolution_note is null or length(resolution_note)<=500)
);
create index if not exists ekodi_point_anomalies_open_idx
  on public.ekodi_point_anomalies(status,detected_at desc);

alter table public.ekodi_point_evidence_adapters enable row level security;
alter table public.ekodi_point_evidence_claims enable row level security;
alter table public.ekodi_point_anomalies enable row level security;
revoke all on table public.ekodi_point_evidence_adapters, public.ekodi_point_evidence_claims,
  public.ekodi_point_anomalies from public, anon, authenticated, service_role;
grant select on table public.ekodi_point_evidence_adapters, public.ekodi_point_evidence_claims,
  public.ekodi_point_anomalies to service_role;

create or replace function ekodi_points_private.kst_day_start(p_at timestamptz default now())
returns timestamptz language sql stable
set search_path = pg_catalog
as $$ select ((p_at at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul') $$;

create or replace function ekodi_points_private.flag_anomaly(
  p_kind text, p_severity text, p_site text, p_person uuid, p_detail jsonb, p_dedupe text
) returns boolean language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.ekodi_point_anomalies(kind,severity,site_id,person_id,detail,dedupe_key)
  values(p_kind,p_severity,p_site,p_person,coalesce(p_detail,'{}'::jsonb),p_dedupe)
  on conflict (dedupe_key) do nothing;
  return found;
end;
$$;

-- Shared award path for every adapter. Trusted backend / governance only.
create or replace function ekodi_points_private.award_evidence(
  p_site text, p_rule text, p_person uuid, p_adapter text, p_source_ref text, p_evidence jsonb
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_adapter public.ekodi_point_evidence_adapters%rowtype;
  v_rule public.ekodi_point_rules%rowtype;
  v_others bigint;
begin
  if p_source_ref is null or p_source_ref !~ '^[A-Za-z0-9:._/-]{3,120}$' then
    raise exception 'INVALID_EVIDENCE_REF';
  end if;
  select * into v_adapter from public.ekodi_point_evidence_adapters
    where site_id=p_site and rule_id=p_rule and adapter=p_adapter and enabled;
  if not found then raise exception 'EVIDENCE_ADAPTER_DISABLED'; end if;
  select * into v_rule from public.ekodi_point_rules where site_id=p_site and rule_id=p_rule;
  if v_adapter.trust='low_trust' and (v_rule.points>5 or v_rule.daily_cap>50 or v_rule.daily_events>10) then
    raise exception 'LOW_TRUST_RULE_LIMIT';
  end if;
  -- The same piece of evidence credited to several people is suspicious
  -- (e.g. one approved post claimed by many accounts). Flag, then continue:
  -- per-person dedupe below still blocks double credit for one person.
  select count(distinct user_id) into v_others from public.ekodi_point_ledger
    where site_id=p_site and user_id<>p_person
      and left(event_key,length(p_adapter||':'||p_source_ref||':'))=p_adapter||':'||p_source_ref||':';
  if v_others>0 and p_adapter not in ('attendance_checkin','meeting_participation','lecture_completion') then
    perform ekodi_points_private.flag_anomaly('shared_evidence','warning',p_site,p_person,
      jsonb_build_object('adapter',p_adapter,'source_ref',p_source_ref,'other_people',v_others),
      'shared_evidence:'||p_site||':'||p_adapter||':'||p_source_ref||':'||p_person::text);
  end if;
  return ekodi_points_private.award_activity(p_site,p_person,p_rule,
    p_adapter||':'||p_source_ref||':'||p_person::text,
    coalesce(p_evidence,'{}'::jsonb)||jsonb_build_object('adapter',p_adapter,'trust',v_adapter.trust,
      'source_ref',p_source_ref,'page_visit_or_share_is_not_evidence',true));
end;
$$;

-- Member submits a claim for an adapter the site made claimable. Never awards.
create or replace function public.ekodi_points_submit_evidence_claim(
  p_site text, p_rule text, p_adapter text, p_source_ref text, p_note text default ''
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_auth uuid := auth.uid();
  v_person uuid;
  v_today bigint;
  v_id uuid;
begin
  if v_auth is null then raise exception 'POINTS_AUTH_REQUIRED'; end if;
  v_person := ekodi_points_private.resolve_person_for_auth(v_auth);
  if v_person is null then raise exception 'POINT_IDENTITY_NOT_LINKED'; end if;
  if p_note is not null and length(p_note)>500 then raise exception 'INVALID_EVIDENCE_NOTE'; end if;
  if p_source_ref is null or p_source_ref !~ '^[A-Za-z0-9:._/-]{3,120}$' then raise exception 'INVALID_EVIDENCE_REF'; end if;
  if not exists(select 1 from public.ekodi_point_evidence_adapters a
     join public.ekodi_point_sites s on s.site_id=a.site_id and s.enabled
     join public.ekodi_point_rules r on r.site_id=a.site_id and r.rule_id=a.rule_id and r.enabled
     where a.site_id=p_site and a.rule_id=p_rule and a.adapter=p_adapter and a.enabled and a.member_claimable) then
    raise exception 'EVIDENCE_CLAIM_NOT_AVAILABLE';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('claim:'||p_site||':'||v_person::text,0));
  select count(*) into v_today from public.ekodi_point_evidence_claims
    where person_id=v_person and site_id=p_site and submitted_at>=ekodi_points_private.kst_day_start();
  if v_today>=10 then raise exception 'EVIDENCE_CLAIM_DAILY_LIMIT'; end if;
  insert into public.ekodi_point_evidence_claims(site_id,rule_id,adapter,person_id,source_ref,note)
    values(p_site,p_rule,p_adapter,v_person,p_source_ref,coalesce(btrim(p_note),''))
    on conflict (site_id,rule_id,adapter,person_id,source_ref) do nothing
    returning claim_id into v_id;
  if v_id is null then return jsonb_build_object('submitted',false,'reason','ALREADY_SUBMITTED'); end if;
  return jsonb_build_object('submitted',true,'claim_id',v_id,'status','pending','rewarded',false);
end;
$$;

-- Super-admin decision on a claim (audited). Approval awards via the shared path.
create or replace function public.ekodi_points_admin_decide_claim(
  p_actor text, p_claim uuid, p_approve boolean, p_note text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := ekodi_points_private.assert_admin_actor(p_actor);
  c public.ekodi_point_evidence_claims%rowtype;
  v_award jsonb;
begin
  if p_approve is null or (p_note is not null and length(p_note)>500) then raise exception 'INVALID_ADMIN_DECISION'; end if;
  select * into c from public.ekodi_point_evidence_claims where claim_id=p_claim for update;
  if not found then raise exception 'EVIDENCE_CLAIM_NOT_FOUND'; end if;
  if c.status<>'pending' then return jsonb_build_object('claim_id',c.claim_id,'status',c.status,'replayed',true); end if;
  if not p_approve then
    update public.ekodi_point_evidence_claims set status='rejected',decided_by=v_actor,decided_at=now(),decision_note=p_note
      where claim_id=c.claim_id;
    perform ekodi_points_private.admin_audit_append(v_actor,'claim_reject',null,
      jsonb_build_object('claim_id',c.claim_id,'site_id',c.site_id,'rule_id',c.rule_id,'adapter',c.adapter));
    return jsonb_build_object('claim_id',c.claim_id,'status','rejected');
  end if;
  v_award := ekodi_points_private.award_evidence(c.site_id,c.rule_id,c.person_id,c.adapter,c.source_ref,
    jsonb_build_object('claim_id',c.claim_id,'confirmed_by',v_actor));
  update public.ekodi_point_evidence_claims set
    status=case when v_award->>'awarded'='true' then 'approved'
                when v_award->>'reason'='DUPLICATE' then 'duplicate' else 'approved' end,
    decided_by=v_actor,decided_at=now(),decision_note=p_note,
    ledger_event_key=c.adapter||':'||c.source_ref||':'||c.person_id::text
    where claim_id=c.claim_id;
  perform ekodi_points_private.admin_audit_append(v_actor,'claim_approve',null,
    jsonb_build_object('claim_id',c.claim_id,'site_id',c.site_id,'rule_id',c.rule_id,'adapter',c.adapter,'award',v_award));
  return jsonb_build_object('claim_id',c.claim_id,'status','decided','award',v_award);
end;
$$;

-- Real-time burst flag. Indexed lookup per earn insert; flags only.
create or replace function ekodi_points_private.ledger_burst_watch()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_count bigint;
begin
  if new.event_kind<>'earn' then return null; end if;
  select count(*) into v_count from public.ekodi_point_ledger
    where site_id=new.site_id and user_id=new.user_id and event_kind='earn'
      and created_at>=new.created_at-interval '1 hour';
  if v_count>=20 then
    perform ekodi_points_private.flag_anomaly('burst',case when v_count>=40 then 'critical' else 'warning' end,
      new.site_id,new.user_id,jsonb_build_object('earn_events_last_hour',v_count),
      'burst:'||new.site_id||':'||new.user_id::text||':'||to_char(new.created_at at time zone 'Asia/Seoul','YYYYMMDDHH24'));
  end if;
  return null;
end;
$$;
drop trigger if exists ekodi_points_ledger_burst_watch on public.ekodi_point_ledger;
create trigger ekodi_points_ledger_burst_watch
after insert on public.ekodi_point_ledger
for each row execute function ekodi_points_private.ledger_burst_watch();

-- Periodic detectors; idempotent per KST day. Returns number of new findings.
create or replace function ekodi_points_private.run_anomaly_detectors()
returns integer language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_new integer := 0;
  v_day text := to_char(now() at time zone 'Asia/Seoul','YYYYMMDD');
  v_today timestamptz := ekodi_points_private.kst_day_start();
  r record;
  v_broken bigint;
begin
  -- Site daily cap reached on 3 consecutive KST days.
  for r in
    with daily as (
      select l.site_id,l.user_id,((l.created_at at time zone 'Asia/Seoul')::date) d,sum(l.amount) s
      from public.ekodi_point_ledger l
      where l.event_kind='earn' and l.created_at>=v_today-interval '3 days'
      group by 1,2,3)
    select d.site_id,d.user_id,count(*) days from daily d
      join public.ekodi_point_sites s on s.site_id=d.site_id
     where d.s>=s.daily_cap and s.daily_cap>0 group by 1,2 having count(*)>=3
  loop
    if ekodi_points_private.flag_anomaly('cap_streak','warning',r.site_id,r.user_id,
       jsonb_build_object('cap_days_in_window',r.days),'cap_streak:'||r.site_id||':'||r.user_id::text||':'||v_day)
    then v_new:=v_new+1; end if;
  end loop;
  -- Referral clusters: 3+ rewards for one inviter in one KST day.
  for r in select site_id,inviter_person_id,count(*) n from public.ekodi_point_referral_rewards
      where credited_at>=v_today group by 1,2 having count(*)>=3
  loop
    if ekodi_points_private.flag_anomaly('referral_cluster','warning',r.site_id,r.inviter_person_id,
       jsonb_build_object('rewards_today',r.n),'referral_cluster:'||r.site_id||':'||r.inviter_person_id::text||':'||v_day)
    then v_new:=v_new+1; end if;
  end loop;
  -- Repeated rejected claims (3+ in 7 days).
  for r in select site_id,person_id,count(*) n from public.ekodi_point_evidence_claims
      where status='rejected' and decided_at>=now()-interval '7 days' group by 1,2 having count(*)>=3
  loop
    if ekodi_points_private.flag_anomaly('claim_rejections','info',r.site_id,r.person_id,
       jsonb_build_object('rejected_7d',r.n),'claim_rejections:'||r.site_id||':'||r.person_id::text||':'||v_day)
    then v_new:=v_new+1; end if;
  end loop;
  -- Integrity: ledger/wallet drift and audit chain.
  for r in select site_id,user_id,difference from ekodi_points_private.wallet_reconciliation() loop
    if ekodi_points_private.flag_anomaly('ledger_drift','critical',r.site_id,r.user_id,
       jsonb_build_object('difference',r.difference),'ledger_drift:'||r.site_id||':'||r.user_id::text||':'||v_day)
    then v_new:=v_new+1; end if;
  end loop;
  v_broken := ekodi_points_private.admin_audit_verify();
  if v_broken is not null then
    if ekodi_points_private.flag_anomaly('audit_chain','critical',null,null,
       jsonb_build_object('broken_at_seq',v_broken),'audit_chain:'||v_broken::text)
    then v_new:=v_new+1; end if;
  end if;
  return v_new;
end;
$$;

-- Governance scan: run detectors, then return open anomalies, pending claims
-- and the adapter registry for the super-admin console.
create or replace function public.ekodi_points_admin_scan(p_actor text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := ekodi_points_private.assert_admin_actor(p_actor);
  v_new integer;
begin
  v_new := ekodi_points_private.run_anomaly_detectors();
  return jsonb_build_object(
    'new_findings',v_new,
    'anomalies',(select coalesce(jsonb_agg(to_jsonb(a) order by a.detected_at desc),'[]'::jsonb) from (
      select anomaly_id,kind,severity,site_id,person_id,detail,detected_at,status
      from public.ekodi_point_anomalies where status<>'resolved' order by detected_at desc limit 100) a),
    'claims',(select coalesce(jsonb_agg(to_jsonb(c) order by c.submitted_at),'[]'::jsonb) from (
      select claim_id,site_id,rule_id,adapter,person_id,source_ref,note,submitted_at
      from public.ekodi_point_evidence_claims where status='pending' order by submitted_at limit 100) c),
    'adapters',(select coalesce(jsonb_agg(to_jsonb(x) order by x.site_id,x.rule_id),'[]'::jsonb) from (
      select site_id,rule_id,adapter,trust,member_claimable,enabled from public.ekodi_point_evidence_adapters) x));
end;
$$;

create or replace function public.ekodi_points_admin_resolve_anomaly(
  p_actor text, p_anomaly bigint, p_status text, p_note text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_actor text := ekodi_points_private.assert_admin_actor(p_actor); a public.ekodi_point_anomalies%rowtype;
begin
  if p_status not in ('acknowledged','resolved') or (p_note is not null and length(p_note)>500) then
    raise exception 'INVALID_ADMIN_DECISION';
  end if;
  if p_status='resolved' and length(btrim(coalesce(p_note,'')))<5 then raise exception 'ADMIN_REASON_REQUIRED'; end if;
  select * into a from public.ekodi_point_anomalies where anomaly_id=p_anomaly for update;
  if not found then raise exception 'ANOMALY_NOT_FOUND'; end if;
  if a.status='resolved' then return jsonb_build_object('anomaly_id',a.anomaly_id,'status','resolved','replayed',true); end if;
  update public.ekodi_point_anomalies set status=p_status,resolved_by=v_actor,resolved_at=now(),resolution_note=p_note
    where anomaly_id=a.anomaly_id;
  perform ekodi_points_private.admin_audit_append(v_actor,'anomaly_'||p_status,null,
    jsonb_build_object('anomaly_id',a.anomaly_id,'kind',a.kind,'site_id',a.site_id,'note',p_note));
  return jsonb_build_object('anomaly_id',a.anomaly_id,'status',p_status);
end;
$$;

-- Adapter registry changes go through the audited request/approval flow.
-- Enabling an adapter is economic (second approver required).
create or replace function ekodi_points_private.admin_adapter_state(p_target jsonb)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object('trust',trust,'member_claimable',member_claimable,'enabled',enabled)
  from public.ekodi_point_evidence_adapters
  where site_id=p_target->>'site_id' and rule_id=p_target->>'rule_id' and adapter=p_target->>'adapter'
$$;

create or replace function public.ekodi_points_admin_propose_adapter(
  p_actor text, p_target jsonb, p_proposed jsonb, p_reason text, p_request_key text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := ekodi_points_private.assert_admin_actor(p_actor);
  v_before jsonb; v_risk text := 'standard'; v_existing ekodi_points_private.admin_requests%rowtype; v_id uuid;
begin
  if p_target is null or jsonb_typeof(p_target)<>'object' or p_proposed is null or jsonb_typeof(p_proposed)<>'object' then
    raise exception 'INVALID_ADMIN_REQUEST';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 5 and 500 then raise exception 'ADMIN_REASON_REQUIRED'; end if;
  if (p_proposed - array['trust','member_claimable','enabled']) <> '{}'::jsonb then raise exception 'UNKNOWN_ADMIN_FIELD'; end if;
  if p_proposed->>'trust' is null or p_proposed->>'trust' not in ('verified','low_trust')
     or jsonb_typeof(p_proposed->'member_claimable') is distinct from 'boolean'
     or jsonb_typeof(p_proposed->'enabled') is distinct from 'boolean' then
    raise exception 'INVALID_ADMIN_FIELD:adapter';
  end if;
  if not exists(select 1 from public.ekodi_point_rules where site_id=p_target->>'site_id' and rule_id=p_target->>'rule_id') then
    raise exception 'POINT_RULE_NOT_FOUND';
  end if;
  select * into v_existing from ekodi_points_private.admin_requests where request_key=p_request_key;
  if found then
    if v_existing.requested_by<>v_actor or v_existing.target<>p_target or v_existing.proposed<>p_proposed then
      raise exception 'ADMIN_REQUEST_KEY_REUSED';
    end if;
    return jsonb_build_object('request_id',v_existing.request_id,'status',v_existing.status,'replayed',true);
  end if;
  v_before := ekodi_points_private.admin_adapter_state(p_target);
  if (p_proposed->>'enabled')::boolean and coalesce((v_before->>'enabled')::boolean,false)=false then v_risk:='economic'; end if;
  insert into ekodi_points_private.admin_requests(request_key,kind,target,before_state,proposed,reason,risk,requested_by)
    values(p_request_key,'adapter',p_target,v_before,p_proposed,btrim(p_reason),v_risk,v_actor) returning request_id into v_id;
  perform ekodi_points_private.admin_audit_append(v_actor,'propose',v_id,
    jsonb_build_object('kind','adapter','target',p_target,'proposed',p_proposed,'risk',v_risk));
  return jsonb_build_object('request_id',v_id,'status','pending','risk',v_risk,'replayed',false);
end;
$$;

-- Allow the 'adapter' kind in the shared request table and teach the shared
-- decision function to apply it (stale detection + audit preserved).
alter table ekodi_points_private.admin_requests drop constraint if exists admin_requests_kind_check;
alter table ekodi_points_private.admin_requests add constraint admin_requests_kind_check
  check (kind in ('site','rule','transfer','campaign','adjustment','reversal','adapter'));

create or replace function ekodi_points_private.apply_adapter_request(r ekodi_points_private.admin_requests)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.ekodi_point_evidence_adapters(site_id,rule_id,adapter,trust,member_claimable,enabled)
  values(r.target->>'site_id',r.target->>'rule_id',r.target->>'adapter',r.proposed->>'trust',
    (r.proposed->>'member_claimable')::boolean,(r.proposed->>'enabled')::boolean)
  on conflict (site_id,rule_id,adapter) do update set trust=excluded.trust,
    member_claimable=excluded.member_claimable,enabled=excluded.enabled;
  return ekodi_points_private.admin_adapter_state(r.target);
end;
$$;

create or replace function public.ekodi_points_admin_decide_adapter(
  p_actor text, p_request_id uuid, p_approve boolean, p_note text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := ekodi_points_private.assert_admin_actor(p_actor);
  r ekodi_points_private.admin_requests%rowtype; v_now jsonb; v_after jsonb;
begin
  if p_approve is null or (p_note is not null and length(p_note)>500) then raise exception 'INVALID_ADMIN_DECISION'; end if;
  select * into r from ekodi_points_private.admin_requests where request_id=p_request_id and kind='adapter' for update;
  if not found then raise exception 'ADMIN_REQUEST_NOT_FOUND'; end if;
  if r.status<>'pending' then return jsonb_build_object('request_id',r.request_id,'status',r.status,'replayed',true); end if;
  if not p_approve then
    update ekodi_points_private.admin_requests set status='rejected',decided_by=v_actor,decided_at=now(),decision_note=p_note
      where request_id=r.request_id;
    perform ekodi_points_private.admin_audit_append(v_actor,'reject',r.request_id,jsonb_build_object('note',p_note));
    return jsonb_build_object('request_id',r.request_id,'status','rejected');
  end if;
  if r.risk='economic' and r.requested_by=v_actor then raise exception 'SECOND_APPROVER_REQUIRED'; end if;
  perform 1 from public.ekodi_point_evidence_adapters
    where site_id=r.target->>'site_id' and rule_id=r.target->>'rule_id' and adapter=r.target->>'adapter' for update;
  v_now := ekodi_points_private.admin_adapter_state(r.target);
  if v_now is distinct from r.before_state then
    update ekodi_points_private.admin_requests set status='stale',decided_by=v_actor,decided_at=now(),
      result=jsonb_build_object('current',v_now) where request_id=r.request_id;
    perform ekodi_points_private.admin_audit_append(v_actor,'stale',r.request_id,
      jsonb_build_object('expected',r.before_state,'current',v_now));
    return jsonb_build_object('request_id',r.request_id,'status','stale');
  end if;
  v_after := ekodi_points_private.apply_adapter_request(r);
  update ekodi_points_private.admin_requests set status='applied',decided_by=v_actor,decided_at=now(),
    decision_note=p_note,result=v_after where request_id=r.request_id;
  perform ekodi_points_private.admin_audit_append(v_actor,'apply',r.request_id,
    jsonb_build_object('kind','adapter','target',r.target,'before',r.before_state,'after',v_after));
  return jsonb_build_object('request_id',r.request_id,'status','applied','result',v_after);
end;
$$;

-- The shared decision entry point must never mark an adapter request applied
-- without applying it: move the P1 body to a private core and dispatch by kind.
alter function public.ekodi_points_admin_decide(text,uuid,boolean,text) rename to admin_decide_core;
alter function public.admin_decide_core(text,uuid,boolean,text) set schema ekodi_points_private;
revoke all on function ekodi_points_private.admin_decide_core(text,uuid,boolean,text) from public, anon, authenticated, service_role;
create or replace function public.ekodi_points_admin_decide(
  p_actor text, p_request_id uuid, p_approve boolean, p_note text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if exists(select 1 from ekodi_points_private.admin_requests where request_id=p_request_id and kind='adapter') then
    return public.ekodi_points_admin_decide_adapter(p_actor,p_request_id,p_approve,p_note);
  end if;
  return ekodi_points_private.admin_decide_core(p_actor,p_request_id,p_approve,p_note);
end;
$$;

revoke all on function
  public.ekodi_points_admin_decide(text,uuid,boolean,text),
  ekodi_points_private.kst_day_start(timestamptz),
  ekodi_points_private.flag_anomaly(text,text,text,uuid,jsonb,text),
  ekodi_points_private.award_evidence(text,text,uuid,text,text,jsonb),
  ekodi_points_private.ledger_burst_watch(),
  ekodi_points_private.run_anomaly_detectors(),
  ekodi_points_private.admin_adapter_state(jsonb),
  ekodi_points_private.apply_adapter_request(ekodi_points_private.admin_requests),
  public.ekodi_points_submit_evidence_claim(text,text,text,text,text),
  public.ekodi_points_admin_decide_claim(text,uuid,boolean,text),
  public.ekodi_points_admin_scan(text),
  public.ekodi_points_admin_resolve_anomaly(text,bigint,text,text),
  public.ekodi_points_admin_propose_adapter(text,jsonb,jsonb,text,text),
  public.ekodi_points_admin_decide_adapter(text,uuid,boolean,text)
  from public, anon, authenticated;
grant execute on function ekodi_points_private.award_evidence(text,text,uuid,text,text,jsonb) to service_role;
grant execute on function public.ekodi_points_submit_evidence_claim(text,text,text,text,text) to authenticated;
grant execute on function
  public.ekodi_points_admin_decide(text,uuid,boolean,text),
  public.ekodi_points_admin_decide_claim(text,uuid,boolean,text),
  public.ekodi_points_admin_scan(text),
  public.ekodi_points_admin_resolve_anomaly(text,bigint,text,text),
  public.ekodi_points_admin_propose_adapter(text,jsonb,jsonb,text,text),
  public.ekodi_points_admin_decide_adapter(text,uuid,boolean,text)
  to service_role;
