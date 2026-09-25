-- EKODI Activity History: recurring series, source evidence, and tenant-scoped history administration.
-- Google Drive evidence is durable reference material. ChatGPT context is imported as a reviewable
-- provenance source only and never overrides canonical EKODI records automatically.

create table if not exists public.activity_series (
  id uuid primary key default gen_random_uuid(),
  workspace_tenant_id uuid not null references public.tenants(id) on delete cascade,
  series_key text not null,
  title text not null,
  activity_type text not null default 'gathering',
  cadence_kind text not null default 'custom'
    check (cadence_kind in ('none','weekly','monthly','annual','custom')),
  cadence_rule text not null default '',
  default_start_time time,
  default_duration_minutes integer
    check (default_duration_minutes is null or default_duration_minutes between 1 and 1440),
  default_venue text not null default '',
  status text not null default 'active'
    check (status in ('active','inactive','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_tenant_id,series_key)
);
create index if not exists activity_series_workspace_status_idx
  on public.activity_series(workspace_tenant_id,status,series_key);

alter table public.activity_series enable row level security;
revoke all on table public.activity_series from anon, authenticated, service_role;

alter table public.activities
  add column if not exists series_id uuid references public.activity_series(id) on delete set null,
  add column if not exists reported_attendance integer
    check (reported_attendance is null or reported_attendance >= 0),
  add column if not exists history_note text not null default '',
  add column if not exists history_record_status text not null default 'confirmed'
    check (history_record_status in ('confirmed','needs_review','conflict'));

create index if not exists activities_series_starts_idx
  on public.activities(series_id,starts_at desc);

create table if not exists public.activity_evidence_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_tenant_id uuid not null references public.tenants(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete cascade,
  series_id uuid references public.activity_series(id) on delete cascade,
  source_kind text not null
    check (source_kind in ('ekodi','google_drive','chatgpt_context','manual','website','import')),
  source_ref text not null default '',
  source_title text not null default '',
  source_url text not null default '',
  source_observed_at timestamptz,
  verification_status text not null default 'reference'
    check (verification_status in ('confirmed','reference','needs_review','conflict')),
  extracted_facts jsonb not null default '{}'::jsonb,
  note text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (activity_id is not null or series_id is not null)
);
create index if not exists activity_evidence_workspace_idx
  on public.activity_evidence_sources(workspace_tenant_id,verification_status,created_at desc);
create index if not exists activity_evidence_activity_idx
  on public.activity_evidence_sources(activity_id,created_at desc);
create index if not exists activity_evidence_series_idx
  on public.activity_evidence_sources(series_id,created_at desc);

alter table public.activity_evidence_sources enable row level security;
revoke all on table public.activity_evidence_sources from anon, authenticated, service_role;

create or replace function public.activity_admin_history_snapshot(
  p_workspace_slug text,
  p_series_key text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_tenant public.tenants%rowtype;
  v_series_id uuid;
  v_result jsonb;
begin
  select * into v_tenant
  from public.tenants
  where slug=lower(trim(coalesce(p_workspace_slug,'')))
  limit 1;

  if not found then raise exception 'WORKSPACE_NOT_FOUND'; end if;
  if not public.activity_is_workspace_operator(v_tenant.id) then
    raise exception 'ACTIVITY_ADMIN_FORBIDDEN';
  end if;

  if nullif(trim(coalesce(p_series_key,'')),'') is not null then
    select id into v_series_id
    from public.activity_series
    where workspace_tenant_id=v_tenant.id
      and series_key=trim(p_series_key)
    limit 1;
    if v_series_id is null then raise exception 'ACTIVITY_SERIES_NOT_FOUND'; end if;
  end if;

  select jsonb_build_object(
    'workspace',jsonb_build_object('tenant_id',v_tenant.id,'slug',v_tenant.slug,'name',v_tenant.name),
    'summary',jsonb_build_object(
      'series',(
        select count(*) from public.activity_series s
        where s.workspace_tenant_id=v_tenant.id
          and (v_series_id is null or s.id=v_series_id)
      ),
      'activities',(
        select count(*) from public.activities a
        where a.workspace_tenant_id=v_tenant.id
          and (v_series_id is null or a.series_id=v_series_id)
      ),
      'confirmed',(
        select count(*) from public.activities a
        where a.workspace_tenant_id=v_tenant.id
          and a.history_record_status='confirmed'
          and (v_series_id is null or a.series_id=v_series_id)
      ),
      'needs_review',(
        select count(*) from public.activities a
        where a.workspace_tenant_id=v_tenant.id
          and a.history_record_status='needs_review'
          and (v_series_id is null or a.series_id=v_series_id)
      ),
      'conflicts',(
        select count(*) from public.activity_evidence_sources e
        where e.workspace_tenant_id=v_tenant.id
          and e.verification_status='conflict'
          and (
            v_series_id is null
            or e.series_id=v_series_id
            or exists (
              select 1 from public.activities a
              where a.id=e.activity_id and a.series_id=v_series_id
            )
          )
      ),
      'evidence',(
        select count(*) from public.activity_evidence_sources e
        where e.workspace_tenant_id=v_tenant.id
          and (
            v_series_id is null
            or e.series_id=v_series_id
            or exists (
              select 1 from public.activities a
              where a.id=e.activity_id and a.series_id=v_series_id
            )
          )
      )
    ),
    'series',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',s.id,
          'series_key',s.series_key,
          'title',s.title,
          'activity_type',s.activity_type,
          'cadence_kind',s.cadence_kind,
          'cadence_rule',s.cadence_rule,
          'default_start_time',s.default_start_time,
          'default_duration_minutes',s.default_duration_minutes,
          'default_venue',s.default_venue,
          'status',s.status,
          'metadata',s.metadata,
          'evidence_count',(
            select count(*) from public.activity_evidence_sources e where e.series_id=s.id
          )
        )
        order by s.title
      )
      from public.activity_series s
      where s.workspace_tenant_id=v_tenant.id
        and (v_series_id is null or s.id=v_series_id)
    ),'[]'::jsonb),
    'history',coalesce((
      select jsonb_agg(row_to_json(h)::jsonb order by h.starts_at desc nulls last,h.created_at desc)
      from (
        select
          a.id,
          a.activity_key,
          a.activity_type,
          a.title,
          a.summary,
          a.starts_at,
          a.ends_at,
          a.venue,
          a.status,
          a.visibility,
          a.registration_open,
          a.reported_attendance,
          a.history_note,
          a.history_record_status,
          a.created_at,
          s.series_key,
          s.title as series_title,
          s.cadence_kind,
          coalesce((
            select sum(p.party_size)::integer
            from public.activity_participations p
            where p.activity_id=a.id and p.status='attended'
          ),0) as tracked_attendance,
          coalesce((
            select jsonb_agg(jsonb_build_object(
              'source_kind',e.source_kind,
              'source_ref',e.source_ref,
              'source_title',e.source_title,
              'source_url',e.source_url,
              'source_observed_at',e.source_observed_at,
              'verification_status',e.verification_status,
              'extracted_facts',e.extracted_facts,
              'note',e.note
            ) order by e.created_at desc)
            from public.activity_evidence_sources e
            where e.activity_id=a.id
          ),'[]'::jsonb) as evidence
        from public.activities a
        left join public.activity_series s on s.id=a.series_id
        where a.workspace_tenant_id=v_tenant.id
          and (v_series_id is null or a.series_id=v_series_id)
        order by a.starts_at desc nulls last,a.created_at desc
        limit 300
      ) h
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function public.activity_admin_history_snapshot(text,text) from public;
grant execute on function public.activity_admin_history_snapshot(text,text) to authenticated;

create or replace function public.activity_admin_upsert_series(
  p_workspace_slug text,
  p_series_key text,
  p_title text,
  p_activity_type text default 'gathering',
  p_cadence_kind text default 'custom',
  p_cadence_rule text default '',
  p_default_start_time time default null,
  p_default_duration_minutes integer default null,
  p_default_venue text default '',
  p_status text default 'active',
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_tenant public.tenants%rowtype;
  v_series public.activity_series%rowtype;
begin
  select * into v_tenant
  from public.tenants
  where slug=lower(trim(coalesce(p_workspace_slug,'')))
  limit 1;
  if not found then raise exception 'WORKSPACE_NOT_FOUND'; end if;
  if not public.activity_is_workspace_operator(v_tenant.id) then
    raise exception 'ACTIVITY_ADMIN_FORBIDDEN';
  end if;
  if length(trim(coalesce(p_series_key,'')))<2 then raise exception 'INVALID_SERIES_KEY'; end if;
  if length(trim(coalesce(p_title,'')))<1 then raise exception 'INVALID_SERIES_TITLE'; end if;
  if coalesce(p_cadence_kind,'custom') not in ('none','weekly','monthly','annual','custom') then
    raise exception 'INVALID_CADENCE_KIND';
  end if;
  if coalesce(p_status,'active') not in ('active','inactive','archived') then
    raise exception 'INVALID_SERIES_STATUS';
  end if;

  insert into public.activity_series(
    workspace_tenant_id,series_key,title,activity_type,cadence_kind,cadence_rule,
    default_start_time,default_duration_minutes,default_venue,status,metadata,created_by,updated_at
  ) values (
    v_tenant.id,trim(p_series_key),left(trim(p_title),160),left(trim(coalesce(p_activity_type,'gathering')),60),
    p_cadence_kind,left(trim(coalesce(p_cadence_rule,'')),300),p_default_start_time,
    p_default_duration_minutes,left(trim(coalesce(p_default_venue,'')),200),p_status,
    coalesce(p_metadata,'{}'::jsonb),auth.uid(),now()
  )
  on conflict (workspace_tenant_id,series_key) do update
  set title=excluded.title,
      activity_type=excluded.activity_type,
      cadence_kind=excluded.cadence_kind,
      cadence_rule=excluded.cadence_rule,
      default_start_time=excluded.default_start_time,
      default_duration_minutes=excluded.default_duration_minutes,
      default_venue=excluded.default_venue,
      status=excluded.status,
      metadata=public.activity_series.metadata || excluded.metadata,
      updated_at=now()
  returning * into v_series;

  return jsonb_build_object('ok',true,'series_id',v_series.id,'series_key',v_series.series_key);
end;
$$;
revoke all on function public.activity_admin_upsert_series(text,text,text,text,text,text,time,integer,text,text,jsonb) from public;
grant execute on function public.activity_admin_upsert_series(text,text,text,text,text,text,time,integer,text,text,jsonb) to authenticated;

create or replace function public.activity_admin_add_history_record(
  p_workspace_slug text,
  p_series_key text,
  p_activity_key text,
  p_title text,
  p_activity_type text default 'event',
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_venue text default '',
  p_summary text default '',
  p_reported_attendance integer default null,
  p_history_record_status text default 'confirmed',
  p_source_kind text default 'manual',
  p_source_ref text default '',
  p_source_title text default '',
  p_source_url text default '',
  p_source_verification_status text default 'confirmed',
  p_source_note text default ''
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_tenant public.tenants%rowtype;
  v_series_id uuid;
  v_activity public.activities%rowtype;
  v_source_kind text:=lower(trim(coalesce(p_source_kind,'manual')));
begin
  select * into v_tenant
  from public.tenants
  where slug=lower(trim(coalesce(p_workspace_slug,'')))
  limit 1;
  if not found then raise exception 'WORKSPACE_NOT_FOUND'; end if;
  if not public.activity_is_workspace_operator(v_tenant.id) then
    raise exception 'ACTIVITY_ADMIN_FORBIDDEN';
  end if;

  if length(trim(coalesce(p_activity_key,'')))<2 then raise exception 'INVALID_ACTIVITY_KEY'; end if;
  if length(trim(coalesce(p_title,'')))<1 then raise exception 'INVALID_ACTIVITY_TITLE'; end if;
  if p_reported_attendance is not null and p_reported_attendance<0 then
    raise exception 'INVALID_REPORTED_ATTENDANCE';
  end if;
  if coalesce(p_history_record_status,'confirmed') not in ('confirmed','needs_review','conflict') then
    raise exception 'INVALID_HISTORY_RECORD_STATUS';
  end if;
  if v_source_kind not in ('ekodi','google_drive','chatgpt_context','manual','website','import') then
    raise exception 'INVALID_ACTIVITY_SOURCE_KIND';
  end if;
  if coalesce(p_source_verification_status,'confirmed') not in ('confirmed','reference','needs_review','conflict') then
    raise exception 'INVALID_SOURCE_VERIFICATION_STATUS';
  end if;

  if nullif(trim(coalesce(p_series_key,'')),'') is not null then
    select id into v_series_id
    from public.activity_series
    where workspace_tenant_id=v_tenant.id
      and series_key=trim(p_series_key)
    limit 1;
    if v_series_id is null then raise exception 'ACTIVITY_SERIES_NOT_FOUND'; end if;
  end if;

  insert into public.activities(
    workspace_tenant_id,activity_key,activity_type,title,summary,starts_at,ends_at,venue,
    status,visibility,registration_open,series_id,reported_attendance,history_record_status,
    history_note,created_by,updated_at
  ) values (
    v_tenant.id,trim(p_activity_key),left(trim(coalesce(p_activity_type,'event')),60),
    left(trim(p_title),200),left(trim(coalesce(p_summary,'')),4000),p_starts_at,p_ends_at,
    left(trim(coalesce(p_venue,'')),200),
    case when p_history_record_status='confirmed' then 'closed' else 'review' end,
    'workspace',false,v_series_id,p_reported_attendance,p_history_record_status,'',auth.uid(),now()
  )
  on conflict (workspace_tenant_id,activity_key) do update
  set series_id=coalesce(excluded.series_id,public.activities.series_id),
      activity_type=excluded.activity_type,
      title=excluded.title,
      summary=excluded.summary,
      starts_at=coalesce(excluded.starts_at,public.activities.starts_at),
      ends_at=coalesce(excluded.ends_at,public.activities.ends_at),
      venue=case when excluded.venue<>'' then excluded.venue else public.activities.venue end,
      reported_attendance=coalesce(excluded.reported_attendance,public.activities.reported_attendance),
      history_record_status=excluded.history_record_status,
      updated_at=now()
  returning * into v_activity;

  insert into public.activity_evidence_sources(
    workspace_tenant_id,activity_id,series_id,source_kind,source_ref,source_title,source_url,
    source_observed_at,verification_status,note,created_by
  ) values (
    v_tenant.id,v_activity.id,v_series_id,v_source_kind,left(coalesce(p_source_ref,''),500),
    left(coalesce(p_source_title,''),300),left(coalesce(p_source_url,''),1000),now(),
    p_source_verification_status,left(coalesce(p_source_note,''),4000),auth.uid()
  );

  return jsonb_build_object(
    'ok',true,
    'activity_id',v_activity.id,
    'activity_key',v_activity.activity_key,
    'history_record_status',v_activity.history_record_status
  );
end;
$$;
revoke all on function public.activity_admin_add_history_record(
  text,text,text,text,text,timestamptz,timestamptz,text,text,integer,text,text,text,text,text,text,text
) from public;
grant execute on function public.activity_admin_add_history_record(
  text,text,text,text,text,timestamptz,timestamptz,text,text,integer,text,text,text,text,text,text,text
) to authenticated;

-- Seed recurring Mission series from durable Drive evidence plus reviewable ChatGPT context.
with mission as (
  select id from public.tenants where slug='ekodimission'
)
insert into public.activity_series(
  workspace_tenant_id,series_key,title,activity_type,cadence_kind,cadence_rule,
  default_start_time,default_venue,status,metadata
)
select mission.id,v.series_key,v.title,v.activity_type,v.cadence_kind,v.cadence_rule,
       v.default_start_time,v.default_venue,'active',v.metadata
from mission
cross join (values
  (
    'saturday-gathering','토요모임','gathering','weekly','FREQ=WEEKLY;BYDAY=SA',
    time '11:00','에코디교회',
    jsonb_build_object('theme','말씀·나눔·식사·기도','history_import','drive+chatgpt-context')
  ),
  (
    'open-table','열린식탁','event','annual','',
    null::time,'자담치킨 목포대점',
    jsonb_build_object('history_import','drive+ekodi')
  ),
  (
    'summer-camp','여름캠프','camp','annual','',
    null::time,'',
    jsonb_build_object('history_import','drive+chatgpt-context','date_conflict',true)
  )
) as v(series_key,title,activity_type,cadence_kind,cadence_rule,default_start_time,default_venue,metadata)
on conflict (workspace_tenant_id,series_key) do update
set title=excluded.title,
    activity_type=excluded.activity_type,
    cadence_kind=excluded.cadence_kind,
    cadence_rule=excluded.cadence_rule,
    default_start_time=excluded.default_start_time,
    default_venue=excluded.default_venue,
    metadata=public.activity_series.metadata || excluded.metadata,
    updated_at=now();

-- Church recurring meetings are also first-class history series. The weekly/daily cadence
-- comes from repeated bulletin announcements and Last week's statistics.
with church as (
  select id from public.tenants where slug='ekodi-church'
)
insert into public.activity_series(
  workspace_tenant_id,series_key,title,activity_type,cadence_kind,cadence_rule,
  default_start_time,default_venue,status,metadata
)
select church.id,v.series_key,v.title,v.activity_type,v.cadence_kind,v.cadence_rule,
       v.default_start_time,v.default_venue,'active',v.metadata
from church
cross join (values
  (
    'sunday-gathering','주일모임','worship','weekly','FREQ=WEEKLY;BYDAY=SU',
    time '11:00','에코디교회',
    jsonb_build_object('history_import','google_drive','evidence','weekly-bulletins')
  ),
  (
    'prayer-meeting','기도모임','prayer','custom','FREQ=DAILY',
    time '23:30','에코디교회',
    jsonb_build_object('history_import','google_drive','evidence','weekly-bulletins')
  ),
  (
    'praise-gathering','찬양모임','worship','weekly','FREQ=WEEKLY;BYDAY=SU',
    time '17:00','목포',
    jsonb_build_object('history_import','google_drive','evidence','weekly-bulletins')
  )
) as v(series_key,title,activity_type,cadence_kind,cadence_rule,default_start_time,default_venue,metadata)
on conflict (workspace_tenant_id,series_key) do update
set title=excluded.title,
    activity_type=excluded.activity_type,
    cadence_kind=excluded.cadence_kind,
    cadence_rule=excluded.cadence_rule,
    default_start_time=excluded.default_start_time,
    default_venue=excluded.default_venue,
    metadata=public.activity_series.metadata || excluded.metadata,
    updated_at=now();

-- Confirmed Sunday attendance reconstructed from the following Sunday's bulletin statistics.
with church as (
  select id from public.tenants where slug='ekodi-church'
), series as (
  select s.id,s.workspace_tenant_id
  from public.activity_series s join church c on c.id=s.workspace_tenant_id
  where s.series_key='sunday-gathering'
), stats(activity_key,starts_at,attendance,source_ref,source_title) as (
  values
    ('260726-sunday-gathering',timestamptz '2026-07-26 11:00:00+09',6,'drive:260802-bulletin','260802에코디주보'),
    ('260802-sunday-gathering',timestamptz '2026-08-02 11:00:00+09',6,'drive:260809-bulletin','260809에코디주보'),
    ('260809-sunday-gathering',timestamptz '2026-08-09 11:00:00+09',6,'drive:260816-bulletin','260816에코디주보'),
    ('260830-sunday-gathering',timestamptz '2026-08-30 11:00:00+09',6,'drive:260906-bulletin','260906 에코디 주보'),
    ('260906-sunday-gathering',timestamptz '2026-09-06 11:00:00+09',6,'drive:260913-bulletin','260913 에코디 주보'),
    ('260913-sunday-gathering',timestamptz '2026-09-13 11:00:00+09',6,'drive:260920-bulletin','260920 에코디 주보')
)
insert into public.activities(
  workspace_tenant_id,activity_key,activity_type,title,summary,starts_at,venue,status,
  visibility,registration_open,series_id,reported_attendance,history_record_status,metadata
)
select series.workspace_tenant_id,stats.activity_key,'worship','주일모임',
       '다음 주 주보의 지난주 통계로 확인된 주일모임',stats.starts_at,'에코디교회','closed',
       'workspace',false,series.id,stats.attendance,'confirmed',
       jsonb_build_object('import_source','google_drive','verified_from_following_sunday_bulletin',true)
from series cross join stats
on conflict (workspace_tenant_id,activity_key) do update
set series_id=excluded.series_id,
    reported_attendance=excluded.reported_attendance,
    history_record_status='confirmed',
    status=case when public.activities.status='review' then 'closed' else public.activities.status end,
    metadata=public.activities.metadata || excluded.metadata,
    updated_at=now();

with church as (
  select id from public.tenants where slug='ekodi-church'
), stats(activity_key,attendance,source_ref,source_title) as (
  values
    ('260726-sunday-gathering',6,'drive:260802-bulletin','260802에코디주보'),
    ('260802-sunday-gathering',6,'drive:260809-bulletin','260809에코디주보'),
    ('260809-sunday-gathering',6,'drive:260816-bulletin','260816에코디주보'),
    ('260830-sunday-gathering',6,'drive:260906-bulletin','260906 에코디 주보'),
    ('260906-sunday-gathering',6,'drive:260913-bulletin','260913 에코디 주보'),
    ('260913-sunday-gathering',6,'drive:260920-bulletin','260920 에코디 주보')
)
insert into public.activity_evidence_sources(
  workspace_tenant_id,activity_id,series_id,source_kind,source_ref,source_title,source_url,
  source_observed_at,verification_status,extracted_facts,note
)
select a.workspace_tenant_id,a.id,a.series_id,'google_drive',stats.source_ref,stats.source_title,'',
       now(),'confirmed',jsonb_build_object('attendance',stats.attendance,'time','11:00','venue','교회'),
       '해당 주보의 Last week statistics를 직전 주일모임 결과로 연결'
from public.activities a
join church c on c.id=a.workspace_tenant_id
join stats on stats.activity_key=a.activity_key;

-- Recurring prayer/praise cadence is retained as series evidence without inventing
-- per-day attendance occurrences where the bulletin only gives a recurring statistic.
with church as (
  select id from public.tenants where slug='ekodi-church'
), targets as (
  select s.id,s.workspace_tenant_id,s.series_key
  from public.activity_series s join church c on c.id=s.workspace_tenant_id
  where s.series_key in ('sunday-gathering','prayer-meeting','praise-gathering')
)
insert into public.activity_evidence_sources(
  workspace_tenant_id,series_id,source_kind,source_ref,source_title,source_url,
  source_observed_at,verification_status,extracted_facts,note
)
select t.workspace_tenant_id,t.id,'google_drive','drive:260920-bulletin','260920 에코디 주보','',
       timestamptz '2026-09-20 10:12:43+09','confirmed',
       case t.series_key
         when 'sunday-gathering' then jsonb_build_object('cadence','매주 일요일 11시','venue','교회','reported_last_week_attendance',6)
         when 'prayer-meeting' then jsonb_build_object('cadence','매일 23:30','venue','교회','reported_statistic',2)
         else jsonb_build_object('cadence','매주 일요일 17시','venue','목포','reported_last_week_attendance',null)
       end,
       case t.series_key
         when 'prayer-meeting' then '반복 일정은 확인되지만 통계 2를 특정 일자의 참석으로 환산하지 않음'
         when 'praise-gathering' then '반복 일정은 확인되지만 참석 인원은 주보에 - 로 표시되어 미확정'
         else '주일 정기모임 시간·장소를 확인한 주보 근거'
       end
from targets t;

-- Link the canonical 2026 Open Table activity to its recurring series without changing its current public schedule.
update public.activities a
set series_id=s.id,updated_at=now()
from public.activity_series s,public.tenants t
where t.slug='ekodimission'
  and s.workspace_tenant_id=t.id
  and s.series_key='open-table'
  and a.workspace_tenant_id=t.id
  and a.activity_key='260926-chuseok-open-table'
  and a.series_id is distinct from s.id;

-- One confirmed historical Saturday meeting from the 2026-09-20 bulletin:
-- "Last week's statistics" reports Saturday 11:00 at church, attendance 10.
with mission as (
  select id from public.tenants where slug='ekodimission'
), series as (
  select s.id,s.workspace_tenant_id
  from public.activity_series s join mission m on m.id=s.workspace_tenant_id
  where s.series_key='saturday-gathering'
)
insert into public.activities(
  workspace_tenant_id,activity_key,activity_type,title,summary,starts_at,venue,status,
  visibility,registration_open,series_id,reported_attendance,history_record_status,metadata
)
select series.workspace_tenant_id,'260919-saturday-gathering','gathering','토요모임',
       '주보의 지난주 통계로 확인된 토요모임',
       timestamptz '2026-09-19 11:00:00+09','에코디교회','closed',
       'workspace',false,series.id,10,'confirmed',
       jsonb_build_object('import_source','google_drive','verified_from_bulletin',true)
from series
on conflict (workspace_tenant_id,activity_key) do update
set series_id=excluded.series_id,
    reported_attendance=coalesce(public.activities.reported_attendance,excluded.reported_attendance),
    history_record_status='confirmed',
    updated_at=now();

-- September plan occurrences are imported as review items, not silently treated as completed meetings.
with mission as (
  select id from public.tenants where slug='ekodimission'
), series as (
  select s.id,s.workspace_tenant_id
  from public.activity_series s join mission m on m.id=s.workspace_tenant_id
  where s.series_key='saturday-gathering'
)
insert into public.activities(
  workspace_tenant_id,activity_key,activity_type,title,summary,starts_at,status,
  visibility,registration_open,series_id,history_record_status,metadata
)
select series.workspace_tenant_id,v.activity_key,'gathering','토요모임',v.summary,v.starts_at,
       'review','workspace',false,series.id,'needs_review',
       jsonb_build_object('import_source','google_drive','plan_only',true)
from series
cross join (values
  ('260905-saturday-gathering','9월 토요모임 기획: 기쁨·나눔·공의',timestamptz '2026-09-05 11:00:00+09'),
  ('260912-saturday-gathering','9월 토요모임 기획: 두려움·전쟁·믿음',timestamptz '2026-09-12 11:00:00+09')
) as v(activity_key,summary,starts_at)
on conflict (workspace_tenant_id,activity_key) do nothing;

-- Backfill Saturday gatherings that are confirmed by the following Sunday's
-- "Last week's statistics" bulletin. These records are stronger than plan-only evidence.
with mission as (
  select id from public.tenants where slug='ekodimission'
), series as (
  select s.id,s.workspace_tenant_id
  from public.activity_series s join mission m on m.id=s.workspace_tenant_id
  where s.series_key='saturday-gathering'
), stats(activity_key,starts_at,attendance,source_ref,source_title) as (
  values
    ('260801-saturday-gathering',timestamptz '2026-08-01 11:00:00+09',6,'drive:260802-bulletin','260802에코디주보'),
    ('260808-saturday-gathering',timestamptz '2026-08-08 11:00:00+09',6,'drive:260809-bulletin','260809에코디주보'),
    ('260815-saturday-gathering',timestamptz '2026-08-15 11:00:00+09',6,'drive:260816-bulletin','260816에코디주보'),
    ('260905-saturday-gathering',timestamptz '2026-09-05 11:00:00+09',6,'drive:260906-bulletin','260906 에코디 주보'),
    ('260912-saturday-gathering',timestamptz '2026-09-12 11:00:00+09',10,'drive:260913-bulletin','260913 에코디 주보')
)
insert into public.activities(
  workspace_tenant_id,activity_key,activity_type,title,summary,starts_at,venue,status,
  visibility,registration_open,series_id,reported_attendance,history_record_status,metadata
)
select series.workspace_tenant_id,stats.activity_key,'gathering','토요모임',
       '다음날 주보의 지난주 통계로 확인된 토요모임',stats.starts_at,'에코디교회','closed',
       'workspace',false,series.id,stats.attendance,'confirmed',
       jsonb_build_object('import_source','google_drive','verified_from_following_sunday_bulletin',true)
from series cross join stats
on conflict (workspace_tenant_id,activity_key) do update
set series_id=excluded.series_id,
    title=excluded.title,
    venue=case when public.activities.venue='' then excluded.venue else public.activities.venue end,
    reported_attendance=excluded.reported_attendance,
    history_record_status='confirmed',
    status=case when public.activities.status='review' then 'closed' else public.activities.status end,
    metadata=public.activities.metadata || excluded.metadata,
    updated_at=now();

with mission as (
  select id from public.tenants where slug='ekodimission'
), stats(activity_key,attendance,source_ref,source_title) as (
  values
    ('260801-saturday-gathering',6,'drive:260802-bulletin','260802에코디주보'),
    ('260808-saturday-gathering',6,'drive:260809-bulletin','260809에코디주보'),
    ('260815-saturday-gathering',6,'drive:260816-bulletin','260816에코디주보'),
    ('260905-saturday-gathering',6,'drive:260906-bulletin','260906 에코디 주보'),
    ('260912-saturday-gathering',10,'drive:260913-bulletin','260913 에코디 주보')
)
insert into public.activity_evidence_sources(
  workspace_tenant_id,activity_id,series_id,source_kind,source_ref,source_title,source_url,
  source_observed_at,verification_status,extracted_facts,note
)
select a.workspace_tenant_id,a.id,a.series_id,'google_drive',stats.source_ref,stats.source_title,'',
       now(),'confirmed',jsonb_build_object('attendance',stats.attendance,'time','11:00','venue','교회'),
       '해당 주일 주보의 Last week statistics를 직전 토요일 토요모임 결과로 연결'
from public.activities a
join mission m on m.id=a.workspace_tenant_id
join stats on stats.activity_key=a.activity_key;

-- Summer Camp is visible in the history, but the end date remains reviewable because
-- Drive planning material and remembered/report context are not identical.
with mission as (
  select id from public.tenants where slug='ekodimission'
), series as (
  select s.id,s.workspace_tenant_id
  from public.activity_series s join mission m on m.id=s.workspace_tenant_id
  where s.series_key='summer-camp'
)
insert into public.activities(
  workspace_tenant_id,activity_key,activity_type,title,summary,starts_at,ends_at,venue,
  status,visibility,registration_open,series_id,history_record_status,metadata
)
select series.workspace_tenant_id,'260821-summer-camp-jeju','camp','2026 에코디 여름캠프 · 제주',
       '제주 여름캠프. 자료 간 종료일 차이가 있어 최종 일정 확인 필요.',
       timestamptz '2026-08-21 00:00:00+09',timestamptz '2026-08-24 00:00:00+09','제주',
       'review','workspace',false,series.id,'needs_review',
       jsonb_build_object('all_day',true,'candidate_end_date','2026-08-23','source_conflict',true)
from series
on conflict (workspace_tenant_id,activity_key) do update
set series_id=excluded.series_id,
    history_record_status=case when public.activities.history_record_status='confirmed' then 'confirmed' else 'needs_review' end,
    metadata=public.activities.metadata || excluded.metadata,
    updated_at=now();

-- Series-level Drive and ChatGPT provenance.
with mission as (
  select id from public.tenants where slug='ekodimission'
), saturday as (
  select s.id,s.workspace_tenant_id from public.activity_series s join mission m on m.id=s.workspace_tenant_id
  where s.series_key='saturday-gathering'
), open_table as (
  select s.id,s.workspace_tenant_id from public.activity_series s join mission m on m.id=s.workspace_tenant_id
  where s.series_key='open-table'
), summer as (
  select s.id,s.workspace_tenant_id from public.activity_series s join mission m on m.id=s.workspace_tenant_id
  where s.series_key='summer-camp'
)
insert into public.activity_evidence_sources(
  workspace_tenant_id,series_id,source_kind,source_ref,source_title,source_url,
  source_observed_at,verification_status,extracted_facts,note
)
select * from (
  select saturday.workspace_tenant_id,saturday.id,'google_drive'::text,
    'drive:260920-bulletin',
    '260920 에코디 주보',
    '',
    timestamptz '2026-09-20 10:12:43+09','confirmed',
    jsonb_build_object('cadence','매주 토요일 오전 11시','venue','교회','reported_last_week_attendance',10),
    '정기 토요모임 시간과 지난주 통계를 확인한 Drive 근거'
  from saturday
  union all
  select saturday.workspace_tenant_id,saturday.id,'google_drive',
    'drive:202609-saturday-plan',
    '2026년 9월 에코디교회·에코디선교회 토요모임 기획',
    '',
    timestamptz '2026-09-02 00:00:00+09','reference',
    jsonb_build_object('dates',jsonb_build_array('2026-09-05','2026-09-12','2026-09-19','2026-09-26'),'theme','함께 살아내는 믿음'),
    '기획 자료이므로 실제 개최 여부와 참석 인원은 별도 확인'
  from saturday
  union all
  select saturday.workspace_tenant_id,saturday.id,'chatgpt_context',
    'chatgpt-memory-2026-09-25',
    'ChatGPT 기억 기반 토요모임 맥락',
    '',
    timestamptz '2026-09-25 01:00:00+09','reference',
    jsonb_build_object('cadence','매주 토요일','program',jsonb_build_array('말씀','나눔','식사','기도')),
    '대화 기억은 보조 출처이며 Drive·EKODI 원장과 충돌하면 자동 확정하지 않음'
  from saturday
  union all
  select open_table.workspace_tenant_id,open_table.id,'google_drive',
    'drive:2026-open-table-ops',
    '2026 에코디 한가위 열린식탁 | 공지·신청 운영안',
    '',
    timestamptz '2026-09-14 09:48:42+09','conflict',
    jsonb_build_object('date','2026-09-26','time','16:30-18:30','venue','자담치킨','capacity',30),
    '현재 EKODI 공개 원장의 16:00-18:00과 시간이 달라 증거 충돌로 보존'
  from open_table
  union all
  select open_table.workspace_tenant_id,open_table.id,'google_drive',
    'drive:2026-mission-letter-09-10',
    '에코디선교회 격월 선교편지 | 2026년 9-10월',
    '',
    timestamptz '2026-09-02 20:08:59+09','confirmed',
    jsonb_build_object('date','2026-09-26','venue','자담치킨','audience','지역주민·청년·외국인·어르신'),
    '날짜·장소·행사 취지를 확인하는 Drive 근거'
  from open_table
  union all
  select summer.workspace_tenant_id,summer.id,'google_drive',
    'drive:2026-summer-camp-plan',
    '2026 에코디 여름캠프 제주 1박2일 일정안 (8.21-22)',
    '',
    timestamptz '2026-08-13 14:08:41+09','needs_review',
    jsonb_build_object('start_date','2026-08-21','end_date','2026-08-22','label','제주 1박2일 일정안'),
    '다른 기록의 8.21-23 일정과 차이가 있어 실제 최종 일정 확인 필요'
  from summer
  union all
  select summer.workspace_tenant_id,summer.id,'chatgpt_context',
    'chatgpt-memory-2026-09-25',
    'ChatGPT 기억 기반 2026 에코디 여름캠프',
    '',
    timestamptz '2026-09-25 01:00:00+09','conflict',
    jsonb_build_object('start_date','2026-08-21','end_date','2026-08-23','place','제주'),
    'Drive의 1박2일 일정안과 기간이 달라 확정하지 않고 충돌 근거로 보존'
  from summer
) seed(
  workspace_tenant_id,series_id,source_kind,source_ref,source_title,source_url,
  source_observed_at,verification_status,extracted_facts,note
);

-- Activity-level evidence for imported September Saturday occurrences and canonical Open Table.
with mission as (
  select id from public.tenants where slug='ekodimission'
)
insert into public.activity_evidence_sources(
  workspace_tenant_id,activity_id,series_id,source_kind,source_ref,source_title,source_url,
  source_observed_at,verification_status,extracted_facts,note
)
select a.workspace_tenant_id,a.id,a.series_id,'google_drive',
  case when a.activity_key='260919-saturday-gathering'
    then 'drive:260920-bulletin'
    else 'drive:202609-saturday-plan' end,
  case when a.activity_key='260919-saturday-gathering'
    then '260920 에코디 주보'
    else '2026년 9월 에코디교회·에코디선교회 토요모임 기획' end,
  case when a.activity_key='260919-saturday-gathering'
    then ''
    else '' end,
  now(),
  case when a.activity_key='260919-saturday-gathering' then 'confirmed' else 'reference' end,
  case when a.activity_key='260919-saturday-gathering'
    then jsonb_build_object('attendance',10,'time','11:00','venue','교회')
    else jsonb_build_object('plan_only',true,'date',to_char(a.starts_at at time zone 'Asia/Seoul','YYYY-MM-DD')) end,
  case when a.activity_key='260919-saturday-gathering'
    then '실행 결과가 주보 통계로 확인됨'
    else '9월 기획 문서는 활동 주제·예정일을 보조하는 참고 근거로 보존' end
from public.activities a
join mission m on m.id=a.workspace_tenant_id
where a.activity_key in ('260905-saturday-gathering','260912-saturday-gathering','260919-saturday-gathering');

with mission as (
  select id from public.tenants where slug='ekodimission'
)
insert into public.activity_evidence_sources(
  workspace_tenant_id,activity_id,series_id,source_kind,source_ref,source_title,source_url,
  source_observed_at,verification_status,extracted_facts,note
)
select a.workspace_tenant_id,a.id,a.series_id,'ekodi','activities',
  'EKODI canonical activity ledger','https://ekodi.kr/ekodimission/apply/260926-open-table',
  now(),'confirmed',
  jsonb_build_object('activity_key',a.activity_key,'starts_at',a.starts_at,'ends_at',a.ends_at,'venue',a.venue),
  '현재 EKODI 원장을 기준값으로 유지'
from public.activities a
join mission m on m.id=a.workspace_tenant_id
where a.activity_key='260926-chuseok-open-table';

-- Current public event page and Drive plan disagree with the current database timestamp.
-- Preserve all three observations so the operator can resolve the schedule explicitly.
with mission as (
  select id from public.tenants where slug='ekodimission'
)
insert into public.activity_evidence_sources(
  workspace_tenant_id,activity_id,series_id,source_kind,source_ref,source_title,source_url,
  source_observed_at,verification_status,extracted_facts,note
)
select a.workspace_tenant_id,a.id,a.series_id,v.source_kind,v.source_ref,v.source_title,v.source_url,
       now(),v.verification_status,v.extracted_facts,v.note
from public.activities a
join mission m on m.id=a.workspace_tenant_id
cross join (values
  (
    'website'::text,'https://ekodi.kr/ekodimission/apply/260926-open-table','현재 공개 신청 페이지',
    'https://ekodi.kr/ekodimission/apply/260926-open-table','conflict'::text,
    jsonb_build_object('date','2026-09-26','time','16:00-18:00','venue','자담치킨 목포대점'),
    '현재 공개 페이지는 16:00-18:00으로 표시되며 데이터 원장 시각과 달라 자동 수정하지 않음'
  ),
  (
    'google_drive','drive:2026-open-table-ops','2026 에코디 한가위 열린식탁 | 공지·신청 운영안',
    '','conflict',jsonb_build_object('date','2026-09-26','time','16:30-18:30','venue','자담치킨'),
    'Drive 운영안은 16:30-18:30으로 기록되어 현재 공개 페이지와도 차이가 있음'
  )
) v(source_kind,source_ref,source_title,source_url,verification_status,extracted_facts,note)
where a.activity_key='260926-chuseok-open-table';

with mission as (
  select id from public.tenants where slug='ekodimission'
)
insert into public.activity_evidence_sources(
  workspace_tenant_id,activity_id,series_id,source_kind,source_ref,source_title,source_url,
  source_observed_at,verification_status,extracted_facts,note
)
select a.workspace_tenant_id,a.id,a.series_id,v.source_kind,v.source_ref,v.source_title,'',
       now(),v.verification_status,v.extracted_facts,v.note
from public.activities a
join mission m on m.id=a.workspace_tenant_id
cross join (values
  (
    'google_drive'::text,'drive:2026-summer-camp-plan','2026 에코디 여름캠프 제주 1박2일 일정안',
    'needs_review'::text,jsonb_build_object('start_date','2026-08-21','end_date','2026-08-22'),
    '계획 문서의 1박2일 범위. 실제 최종 일정인지 확인 필요'
  ),
  (
    'chatgpt_context','chatgpt-context:2026-09-25','ChatGPT 기억 기반 2026 에코디 여름캠프',
    'conflict',jsonb_build_object('start_date','2026-08-21','end_date','2026-08-23','place','제주'),
    '대화 기억의 8.21-23과 Drive 계획안의 8.21-22가 달라 자동 확정하지 않음'
  )
) v(source_kind,source_ref,source_title,verification_status,extracted_facts,note)
where a.activity_key='260821-summer-camp-jeju';
