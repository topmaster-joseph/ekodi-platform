-- EKODI Church attendance analytics: shared recorded-basis metrics for member and pastor surfaces.
-- Missing attendance records are never inferred as absences or streak breaks.

create or replace function public.church_member_attendance_summary(
  p_church_slug text,
  p_user_id uuid,
  p_email text,
  p_year integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, church, church_private
as $$
declare
  v_tenant_id uuid;
  v_member church_private.members%rowtype;
  v_year integer := coalesce(p_year,extract(year from current_date)::integer);
  v_matches integer := 0;
  v_items jsonb := '[]'::jsonb;
  v_monthly jsonb := '[]'::jsonb;
  v_recorded integer := 0;
  v_attended integer := 0;
  v_present integer := 0;
  v_late integer := 0;
  v_online integer := 0;
  v_absent integer := 0;
  v_excused integer := 0;
  v_current_streak integer := 0;
  v_longest_streak integer := 0;
  v_last_attended date;
  v_last_absence date;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;

  select id into v_tenant_id
  from public.tenants
  where slug=p_church_slug and status='active'
  limit 1;
  if v_tenant_id is null then
    return jsonb_build_object('linked',false,'reason','tenant_not_found');
  end if;

  select * into v_member
  from church_private.members
  where tenant_id=v_tenant_id and auth_user_id=p_user_id and status<>'inactive'
  limit 1;

  if v_member.id is null and nullif(trim(coalesce(p_email,'')),'') is not null then
    select count(*) into v_matches
    from church_private.members
    where tenant_id=v_tenant_id
      and status<>'inactive'
      and lower(email)=lower(trim(p_email));

    if v_matches=1 then
      select * into v_member
      from church_private.members
      where tenant_id=v_tenant_id
        and status<>'inactive'
        and lower(email)=lower(trim(p_email))
      limit 1;
    elsif v_matches>1 then
      return jsonb_build_object('linked',false,'reason','ambiguous_email');
    end if;
  end if;

  if v_member.id is null then
    return jsonb_build_object('linked',false,'reason','member_not_linked');
  end if;

  with base as (
    select
      a.id,
      a.attendance_state,
      a.check_in_at,
      s.id service_id,
      s.service_date,
      s.title service_title,
      (a.attendance_state in ('present','late','online')) attended
    from church_private.attendance_records a
    join church.services s on s.id=a.service_id and s.tenant_id=a.tenant_id
    where a.tenant_id=v_tenant_id
      and a.member_id=v_member.id
      and extract(year from s.service_date)::integer=v_year
  )
  select
    count(*)::integer,
    count(*) filter (where attended)::integer,
    count(*) filter (where attendance_state='present')::integer,
    count(*) filter (where attendance_state='late')::integer,
    count(*) filter (where attendance_state='online')::integer,
    count(*) filter (where attendance_state='absent')::integer,
    count(*) filter (where attendance_state='excused')::integer,
    max(service_date) filter (where attended),
    max(service_date) filter (where attendance_state='absent')
  into v_recorded,v_attended,v_present,v_late,v_online,v_absent,v_excused,v_last_attended,v_last_absence
  from base;

  with base as (
    select
      a.attendance_state,
      s.service_date,
      (a.attendance_state in ('present','late','online')) attended
    from church_private.attendance_records a
    join church.services s on s.id=a.service_id and s.tenant_id=a.tenant_id
    where a.tenant_id=v_tenant_id
      and a.member_id=v_member.id
      and extract(year from s.service_date)::integer=v_year
  ),
  recent as (
    select
      attended,
      sum(case when attended then 0 else 1 end)
        over(order by service_date desc rows between unbounded preceding and current row) breaks
    from base
  ),
  asc_rows as (
    select
      attended,
      sum(case when attended then 0 else 1 end)
        over(order by service_date asc rows between unbounded preceding and current row) grp
    from base
  ),
  streaks as (
    select grp,count(*)::integer streak
    from asc_rows
    where attended
    group by grp
  )
  select
    coalesce((select count(*)::integer from recent where attended and breaks=0),0),
    coalesce((select max(streak) from streaks),0)
  into v_current_streak,v_longest_streak;

  with monthly as (
    select
      extract(month from s.service_date)::integer month_no,
      count(*)::integer recorded,
      count(*) filter (where a.attendance_state in ('present','late','online'))::integer attended,
      count(*) filter (where a.attendance_state='absent')::integer absent,
      count(*) filter (where a.attendance_state='excused')::integer excused
    from church_private.attendance_records a
    join church.services s on s.id=a.service_id and s.tenant_id=a.tenant_id
    where a.tenant_id=v_tenant_id
      and a.member_id=v_member.id
      and extract(year from s.service_date)::integer=v_year
    group by extract(month from s.service_date)::integer
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'month',month_no,
        'recorded_count',recorded,
        'attended_count',attended,
        'absent_count',absent,
        'excused_count',excused,
        'attendance_rate',case when recorded=0 then null else round((attended::numeric/recorded::numeric)*100,1) end
      )
      order by month_no
    ),
    '[]'::jsonb
  )
  into v_monthly
  from monthly;

  select coalesce(jsonb_agg(x.row_value order by x.service_date desc),'[]'::jsonb)
  into v_items
  from (
    select
      jsonb_build_object(
        'service_id',s.id,
        'service_date',s.service_date,
        'service_title',s.title,
        'attendance_state',a.attendance_state,
        'check_in_at',a.check_in_at
      ) row_value,
      s.service_date
    from church_private.attendance_records a
    join church.services s on s.id=a.service_id and s.tenant_id=a.tenant_id
    where a.tenant_id=v_tenant_id
      and a.member_id=v_member.id
      and extract(year from s.service_date)::integer=v_year
    order by s.service_date desc,a.created_at desc
    limit 500
  ) x;

  return jsonb_build_object(
    'linked',true,
    'year',v_year,
    'member',jsonb_build_object(
      'id',v_member.id,
      'name',coalesce(v_member.preferred_name,v_member.full_name)
    ),
    'recorded_count',v_recorded,
    'attended_count',v_attended,
    'present_count',v_present,
    'late_count',v_late,
    'online_count',v_online,
    'absent_count',v_absent,
    'excused_count',v_excused,
    'attendance_rate',case when v_recorded=0 then null else round((v_attended::numeric/v_recorded::numeric)*100,1) end,
    'current_streak',v_current_streak,
    'longest_streak',v_longest_streak,
    'last_attended_date',v_last_attended,
    'last_absence_date',v_last_absence,
    'monthly',v_monthly,
    'attendance',v_items,
    'rate_basis','recorded_attendance',
    'streak_basis','consecutive_recorded_attended_states'
  );
end;
$$;

create or replace function public.church_attendance_member_summaries(
  p_church_slug text,
  p_year integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, church, church_private
as $$
declare
  v_tenant_id uuid;
  v_year integer := coalesce(p_year,extract(year from current_date)::integer);
  v_result jsonb := '[]'::jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;

  select id into v_tenant_id
  from public.tenants
  where slug=p_church_slug and status='active'
  limit 1;
  if v_tenant_id is null then return v_result; end if;

  with base as (
    select
      m.id member_id,
      coalesce(m.preferred_name,m.full_name) member_name,
      m.status member_status,
      a.attendance_state,
      s.service_date,
      (a.attendance_state in ('present','late','online')) attended
    from church_private.members m
    left join church_private.attendance_records a
      on a.member_id=m.id and a.tenant_id=m.tenant_id
    left join church.services s
      on s.id=a.service_id and s.tenant_id=a.tenant_id
      and extract(year from s.service_date)::integer=v_year
    where m.tenant_id=v_tenant_id and m.status<>'inactive'
  ),
  year_rows as (
    select *
    from base
    where service_date is not null
  ),
  stats as (
    select
      m.id member_id,
      coalesce(m.preferred_name,m.full_name) member_name,
      m.status member_status,
      count(y.service_date)::integer recorded_count,
      count(y.service_date) filter (where y.attended)::integer attended_count,
      count(y.service_date) filter (where y.attendance_state='present')::integer present_count,
      count(y.service_date) filter (where y.attendance_state='late')::integer late_count,
      count(y.service_date) filter (where y.attendance_state='online')::integer online_count,
      count(y.service_date) filter (where y.attendance_state='absent')::integer absent_count,
      count(y.service_date) filter (where y.attendance_state='excused')::integer excused_count,
      max(y.service_date) filter (where y.attended) last_attended_date,
      max(y.service_date) filter (where y.attendance_state='absent') last_absence_date
    from church_private.members m
    left join year_rows y on y.member_id=m.id
    where m.tenant_id=v_tenant_id and m.status<>'inactive'
    group by m.id,m.preferred_name,m.full_name,m.status
  ),
  streak_rows as (
    select
      member_id,
      attended,
      service_date,
      sum(case when attended then 0 else 1 end)
        over(partition by member_id order by service_date desc rows between unbounded preceding and current row) reverse_breaks,
      sum(case when attended then 0 else 1 end)
        over(partition by member_id order by service_date asc rows between unbounded preceding and current row) forward_group
    from year_rows
  ),
  current_streak as (
    select member_id,count(*)::integer current_streak
    from streak_rows
    where attended and reverse_breaks=0
    group by member_id
  ),
  streak_groups as (
    select member_id,forward_group,count(*)::integer streak
    from streak_rows
    where attended
    group by member_id,forward_group
  ),
  longest_streak as (
    select member_id,max(streak)::integer longest_streak
    from streak_groups
    group by member_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'member_id',s.member_id,
        'member_name',s.member_name,
        'member_status',s.member_status,
        'year',v_year,
        'recorded_count',s.recorded_count,
        'attended_count',s.attended_count,
        'present_count',s.present_count,
        'late_count',s.late_count,
        'online_count',s.online_count,
        'absent_count',s.absent_count,
        'excused_count',s.excused_count,
        'attendance_rate',case when s.recorded_count=0 then null else round((s.attended_count::numeric/s.recorded_count::numeric)*100,1) end,
        'current_streak',coalesce(c.current_streak,0),
        'longest_streak',coalesce(l.longest_streak,0),
        'last_attended_date',s.last_attended_date,
        'last_absence_date',s.last_absence_date,
        'rate_basis','recorded_attendance'
      )
      order by s.member_name
    ),
    '[]'::jsonb
  )
  into v_result
  from stats s
  left join current_streak c on c.member_id=s.member_id
  left join longest_streak l on l.member_id=s.member_id;

  return v_result;
end;
$$;

revoke all on function public.church_member_attendance_summary(text,uuid,text,integer) from public,anon,authenticated;
revoke all on function public.church_attendance_member_summaries(text,integer) from public,anon,authenticated;
grant execute on function public.church_member_attendance_summary(text,uuid,text,integer) to service_role;
grant execute on function public.church_attendance_member_summaries(text,integer) to service_role;

comment on function public.church_attendance_member_summaries(text,integer) is
  'Restricted pastor attendance analytics. Metrics use recorded attendance only; missing services are not inferred.';
