-- EKODI Presence API. RPCs are callable exclusively through the trusted service role.
-- Every action independently verifies the logged-in actor's tenant-local staff authority.
-- No public-facing person lists, biometric matching, or silent cross-session linkage.
create or replace function public.presence_staff_allowed(p_tenant uuid,p_actor uuid)
returns boolean language sql stable security definer
set search_path=pg_catalog,public as $$
  select p_tenant is not null and p_actor is not null and (
    exists (select 1 from public.tenant_members tm
      where tm.tenant_id=p_tenant and tm.user_id=p_actor and tm.status='active'
      and tm.role::text in ('tenant_admin','store_owner'))
    or exists(select 1 from public.site_access_registry sar
      join auth.users u on lower(u.email)=lower(sar.email)
      where sar.tenant_id=p_tenant and u.id=p_actor
      and sar.status='active' and sar.role::text='tenant_admin')
  );
$$;
revoke all on function public.presence_staff_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.presence_staff_allowed(uuid,uuid) to service_role;

create or replace function public.presence_apply(p_tenant_slug text,p_actor uuid,p_action text,p_data jsonb,p_request_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,presence_private as $$
declare
  v_tenant uuid;
  v_session uuid;
  v_person uuid;
  v_observation presence_private.observations%rowtype;
  v_existing presence_private.requests%rowtype;
  v_response jsonb;
  v_kind text;
  v_channel text;
  v_status text;
  v_verify text;
  v_title text;
  v_external text;
  v_fingerprint text;
  v_count integer;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  if p_actor is null or p_request_id is null or p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'invalid_request' using errcode='22023';
  end if;
  select id into v_tenant from public.tenants
    where slug=lower(trim(p_tenant_slug)) and status='active';
  if not public.presence_staff_allowed(v_tenant,p_actor) then
    raise exception 'tenant_staff_required' using errcode='42501';
  end if;
  if p_action not in ('open_session','register_person','observe','record_headcount','check_in','resolve','unlink','close_session') then
    raise exception 'invalid_action' using errcode='22023';
  end if;
  v_fingerprint:=md5(coalesce(p_data::text,'{}'));
  -- Acquire the request key before side effects. Concurrent retries wait on this PK.
  insert into presence_private.requests(tenant_id,request_id,actor_id,action,fingerprint,response)
  values(v_tenant,p_request_id,p_actor,p_action,v_fingerprint,'{}'::jsonb)
  on conflict (tenant_id,request_id) do nothing;
  if not found then
    select * into v_existing from presence_private.requests
      where tenant_id=v_tenant and request_id=p_request_id;
    if v_existing.fingerprint <> v_fingerprint or v_existing.action <> p_action or v_existing.actor_id <> p_actor then
      raise exception 'idempotency_conflict' using errcode='23505';
    end if;
    return v_existing.response;
  end if;

  if p_action='open_session' then
    v_title:=nullif(trim(p_data->>'title'),'');
    v_external:=nullif(trim(p_data->>'external_meeting_ref'),'');
    if v_title is null or char_length(v_title)>160 or nullif(p_data->>'starts_at','') is null then
      raise exception 'invalid_session' using errcode='22023';
    end if;
    insert into presence_private.sessions(tenant_id,title,starts_at,status,external_meeting_ref)
    values(v_tenant,v_title,(p_data->>'starts_at')::timestamptz,'open',v_external)
    on conflict (tenant_id,external_meeting_ref) where external_meeting_ref is not null
    do update set title=excluded.title
    returning id into v_session;
    v_response:=jsonb_build_object('session_id',v_session);
  elsif p_action='register_person' then
    v_title:=nullif(trim(p_data->>'display_name'),'');
    if v_title is null or char_length(v_title)>120 or (p_data->>'verified') is distinct from 'true' then
      raise exception 'human_identity_confirmation_required' using errcode='22023';
    end if;
    insert into presence_private.people(tenant_id,display_name,identity_status)
    values(v_tenant,v_title,'verified') returning id into v_person;
    v_response:=jsonb_build_object('person_id',v_person);
  else
    v_session:=nullif(p_data->>'session_id','')::uuid;
    if v_session is null or not exists (
      select 1 from presence_private.sessions where tenant_id=v_tenant and id=v_session and status in ('open','closed')
    ) then
      raise exception 'session_not_open' using errcode='22023';
    end if;
    if p_action in ('observe','record_headcount','check_in') and not exists(
      select 1 from presence_private.sessions where tenant_id=v_tenant and id=v_session and status='open'
    ) then
      raise exception 'session_not_open' using errcode='22023';
    end if;
    if p_action='close_session' then
      update presence_private.sessions set status='closed' where tenant_id=v_tenant and id=v_session;
      v_response:=jsonb_build_object('session_id',v_session,'status','closed');
    elsif p_action='observe' then
      v_title:=nullif(trim(p_data->>'label'),'');
      if v_title is not null and char_length(v_title)>100 then
        raise exception 'label_too_long' using errcode='22023';
      end if;
      insert into presence_private.observations(tenant_id,session_id,origin,provisional_label)
      values(v_tenant,v_session,'staff',v_title) returning id into v_person;
      v_response:=jsonb_build_object('observation_id',v_person,'state','pending');
    elsif p_action='record_headcount' then
      v_count:=nullif(p_data->>'count','')::integer;
      v_kind:=coalesce(nullif(p_data->>'method',''),'manual');
      if v_count is null or v_count<0 or v_count>100000 or v_kind not in ('manual','camera_aggregate') then
        raise exception 'invalid_headcount' using errcode='22023';
      end if;
      insert into presence_private.headcounts(tenant_id,session_id,count_estimate,method)
        values(v_tenant,v_session,v_count,v_kind) returning id into v_person;
      v_response:=jsonb_build_object('headcount_id',v_person,'estimate',v_count);
    elsif p_action='check_in' then
      v_person:=nullif(p_data->>'person_id','')::uuid;
      v_channel:=coalesce(nullif(p_data->>'channel',''),'onsite');
      v_status:=coalesce(nullif(p_data->>'status',''),'present');
      v_verify:=coalesce(nullif(p_data->>'verification_method',''),'staff_verified');
      if v_person is null or v_channel not in ('onsite','online')
         or v_status not in ('present','late','excused')
         or v_verify not in ('self_checkin','staff_verified','qr','nfc')
         or not exists(select 1 from presence_private.people where tenant_id=v_tenant and id=v_person and identity_status='verified') then
        raise exception 'invalid_check_in' using errcode='22023';
      end if;
      insert into presence_private.attendances(tenant_id,session_id,person_id,channel,status,verification_method,recorded_by)
        values(v_tenant,v_session,v_person,v_channel,v_status,v_verify,p_actor)
        on conflict (tenant_id,session_id,person_id,channel) do nothing;
      if not found then
        raise exception 'attendance_already_exists' using errcode='23505';
      end if;
      v_response:=jsonb_build_object('person_id',v_person,'status',v_status,'channel',v_channel);
    elsif p_action='resolve' then
      select * into v_observation from presence_private.observations
       where tenant_id=v_tenant and session_id=v_session and id=nullif(p_data->>'observation_id','')::uuid for update;
      v_person:=nullif(p_data->>'person_id','')::uuid;
      if v_observation.id is null or v_observation.state<>'pending'
         or v_person is null
         or not exists(select 1 from presence_private.people where tenant_id=v_tenant and id=v_person and identity_status='verified')
         or char_length(trim(coalesce(p_data->>'verification_reason','')))<5 then
        raise exception 'human_resolution_required' using errcode='22023';
      end if;
      insert into presence_private.attendances(tenant_id,session_id,person_id,channel,status,verification_method,recorded_by,observation_id)
        values(v_tenant,v_session,v_person,'onsite','present','staff_verified',p_actor,v_observation.id)
        on conflict (tenant_id,session_id,person_id,channel) do update
          set status='present',verification_method='staff_verified',observation_id=excluded.observation_id,recorded_at=now(),recorded_by=p_actor
          where attendances.status='retracted';
      if not found then
        raise exception 'attendance_already_exists' using errcode='23505';
      end if;
      update presence_private.observations set state='linked',person_id=v_person,resolved_at=now(),resolved_by=p_actor
       where id=v_observation.id;
      v_response:=jsonb_build_object('observation_id',v_observation.id,'person_id',v_person,'state','linked');
    elsif p_action='unlink' then
      select * into v_observation from presence_private.observations
       where tenant_id=v_tenant and session_id=v_session and id=nullif(p_data->>'observation_id','')::uuid for update;
      if v_observation.id is null or v_observation.state<>'linked'
         or char_length(trim(coalesce(p_data->>'reason','')))<5 then
        raise exception 'unlink_reason_required' using errcode='22023';
      end if;
      -- Retract only the attendance created by this precise observation, never other checks.
      update presence_private.attendances set status='retracted',observation_id=null
        where tenant_id=v_tenant and session_id=v_session and observation_id=v_observation.id;
      update presence_private.observations set state='pending',person_id=null,resolved_at=null,resolved_by=null
        where id=v_observation.id;
      v_response:=jsonb_build_object('observation_id',v_observation.id,'state','pending');
    end if;
  end if;
  insert into presence_private.audit_events(tenant_id,actor_id,action,subject_id,detail)
  values(v_tenant,p_actor,p_action,coalesce(v_session,v_person),
    jsonb_build_object('request_id',p_request_id,'session_id',v_session,'response',v_response,
      'reason',coalesce(p_data->>'verification_reason',p_data->>'reason')));
  update presence_private.requests set response=v_response
    where tenant_id=v_tenant and request_id=p_request_id;
  return v_response;
end;
$$;

create or replace function public.presence_snapshot(p_tenant_slug text,p_actor uuid,p_session uuid default null,p_search text default null)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,presence_private as $$
declare v_tenant uuid; v_session uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  select id into v_tenant from public.tenants where slug=lower(trim(p_tenant_slug)) and status='active';
  if not public.presence_staff_allowed(v_tenant,p_actor) then
    raise exception 'tenant_staff_required' using errcode='42501';
  end if;
  v_session:=p_session;
  if v_session is not null and not exists(select 1 from presence_private.sessions where tenant_id=v_tenant and id=v_session) then
    raise exception 'session_not_found' using errcode='22023';
  end if;
  return jsonb_build_object(
    'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'starts_at',s.starts_at,'status',s.status) order by s.starts_at desc)
       from (select * from presence_private.sessions where tenant_id=v_tenant order by starts_at desc limit 30) s),'[]'::jsonb),
    'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name) order by p.display_name)
       from (select id,display_name from presence_private.people where tenant_id=v_tenant and identity_status='verified'
         and (p_search is null or position(lower(p_search) in lower(display_name))>0)
         order by display_name limit 80) p),'[]'::jsonb),
    'attendees',coalesce((select jsonb_agg(jsonb_build_object('person_id',a.person_id,'name',p.display_name,'channel',a.channel,'status',a.status) order by a.recorded_at desc)
       from presence_private.attendances a join presence_private.people p on p.id=a.person_id and p.tenant_id=a.tenant_id
       where a.tenant_id=v_tenant and a.session_id=v_session),'[]'::jsonb),
    'pending',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'label',o.provisional_label,'observed_at',o.observed_at) order by o.observed_at desc)
       from presence_private.observations o where o.tenant_id=v_tenant and o.session_id=v_session and o.state='pending'),'[]'::jsonb),
    'headcount', (select jsonb_build_object('estimate',h.count_estimate,'method',h.method,'observed_at',h.observed_at)
       from presence_private.headcounts h where h.tenant_id=v_tenant and h.session_id=v_session order by observed_at desc limit 1)
  );
end;
$$;

revoke all on function public.presence_apply(text,uuid,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.presence_snapshot(text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.presence_apply(text,uuid,text,jsonb,uuid) to service_role;
grant execute on function public.presence_snapshot(text,uuid,uuid,text) to service_role;