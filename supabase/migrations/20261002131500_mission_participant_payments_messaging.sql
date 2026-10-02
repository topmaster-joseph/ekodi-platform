-- EKODI Mission participant fee tracking and tenant-scoped group messaging.
-- Additive only: existing activity participation, registration and check-in flows remain unchanged.

alter table public.activity_participations
  add column if not exists fee_amount integer not null default 0 check (fee_amount >= 0),
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','paid','exempt','refunded')),
  add column if not exists paid_amount integer not null default 0 check (paid_amount >= 0),
  add column if not exists paid_at timestamptz,
  add column if not exists payment_method text not null default '',
  add column if not exists payment_note text not null default '';

create table if not exists public.activity_message_campaigns (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  channel text not null default 'email' check (channel in ('email','sms','alimtalk')),
  subject text not null default '',
  body text not null,
  recipient_participation_ids uuid[] not null default '{}'::uuid[],
  requested_count integer not null default 0 check (requested_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  sender_ref text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists activity_message_campaigns_activity_created_idx
  on public.activity_message_campaigns(activity_id,created_at desc);
alter table public.activity_message_campaigns enable row level security;
revoke all on table public.activity_message_campaigns from anon, authenticated, service_role;

create or replace function public.activity_admin_payment_snapshot(
  p_workspace_slug text,
  p_activity_key text
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_tenant public.tenants%rowtype;
  v_activity public.activities%rowtype;
begin
  select * into v_tenant
  from public.tenants
  where slug=lower(trim(p_workspace_slug));

  select a.* into v_activity
  from public.activities a
  where a.workspace_tenant_id=v_tenant.id and a.activity_key=p_activity_key;

  if v_tenant.id is null or v_activity.id is null
     or not public.activity_is_workspace_operator(v_tenant.id) then
    raise exception 'ACTIVITY_ADMIN_FORBIDDEN';
  end if;

  return jsonb_build_object(
    'summary',jsonb_build_object(
      'paid',(select count(*) from public.activity_participations p where p.activity_id=v_activity.id and p.payment_status='paid'),
      'unpaid',(select count(*) from public.activity_participations p where p.activity_id=v_activity.id and p.payment_status='unpaid'),
      'exempt',(select count(*) from public.activity_participations p where p.activity_id=v_activity.id and p.payment_status='exempt'),
      'refunded',(select count(*) from public.activity_participations p where p.activity_id=v_activity.id and p.payment_status='refunded'),
      'paid_amount',(select coalesce(sum(p.paid_amount),0) from public.activity_participations p where p.activity_id=v_activity.id and p.payment_status='paid'),
      'expected_amount',(select coalesce(sum(p.fee_amount),0) from public.activity_participations p where p.activity_id=v_activity.id)
    ),
    'payments',coalesce((
      select jsonb_agg(jsonb_build_object(
        'participation_id',p.id,
        'fee_amount',p.fee_amount,
        'payment_status',p.payment_status,
        'paid_amount',p.paid_amount,
        'paid_at',p.paid_at,
        'payment_method',p.payment_method,
        'payment_note',p.payment_note
      ) order by p.submitted_at desc)
      from public.activity_participations p
      where p.activity_id=v_activity.id
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.activity_admin_payment_snapshot(text,text) from public, anon, authenticated;
grant execute on function public.activity_admin_payment_snapshot(text,text) to authenticated, service_role;

create or replace function public.activity_admin_update_payment(
  p_participation_id uuid,
  p_payment_status text,
  p_fee_amount integer default null,
  p_paid_amount integer default null,
  p_payment_method text default null,
  p_payment_note text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_activity_id uuid;
  v_tenant_id uuid;
  v_status text:=lower(trim(coalesce(p_payment_status,'')));
begin
  select p.activity_id,a.workspace_tenant_id,to_jsonb(p)
  into v_activity_id,v_tenant_id,v_before
  from public.activity_participations p
  join public.activities a on a.id=p.activity_id
  where p.id=p_participation_id
  for update of p;

  if v_activity_id is null or not public.activity_is_workspace_operator(v_tenant_id) then
    raise exception 'ACTIVITY_ADMIN_FORBIDDEN';
  end if;
  if v_status not in ('unpaid','paid','exempt','refunded') then raise exception 'INVALID_PAYMENT_STATUS'; end if;
  if p_fee_amount is not null and p_fee_amount<0 then raise exception 'INVALID_FEE_AMOUNT'; end if;
  if p_paid_amount is not null and p_paid_amount<0 then raise exception 'INVALID_PAID_AMOUNT'; end if;

  update public.activity_participations
  set payment_status=v_status,
      fee_amount=coalesce(p_fee_amount,fee_amount),
      paid_amount=case
        when v_status='paid' then coalesce(p_paid_amount,nullif(paid_amount,0),coalesce(p_fee_amount,fee_amount))
        when v_status='refunded' then coalesce(p_paid_amount,paid_amount)
        else 0
      end,
      paid_at=case when v_status='paid' then coalesce(paid_at,now()) else null end,
      payment_method=case when p_payment_method is null then payment_method else left(trim(p_payment_method),80) end,
      payment_note=case when p_payment_note is null then payment_note else left(trim(p_payment_note),1000) end,
      updated_at=now()
  where id=p_participation_id
  returning to_jsonb(activity_participations.*) into v_after;

  perform public.activity_record_participation_audit(
    v_activity_id,p_participation_id,'payment_update',v_before,v_after,'admin'
  );
  return jsonb_build_object('ok',true,'payment',v_after);
end;
$$;
revoke all on function public.activity_admin_update_payment(uuid,text,integer,integer,text,text) from public, anon, authenticated;
grant execute on function public.activity_admin_update_payment(uuid,text,integer,integer,text,text) to authenticated, service_role;

create or replace function public.activity_admin_message_recipients(
  p_workspace_slug text,
  p_activity_key text,
  p_participation_ids uuid[] default null
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_tenant public.tenants%rowtype;
  v_activity public.activities%rowtype;
begin
  select * into v_tenant from public.tenants where slug=lower(trim(p_workspace_slug));
  select a.* into v_activity from public.activities a
  where a.workspace_tenant_id=v_tenant.id and a.activity_key=p_activity_key;

  if v_tenant.id is null or v_activity.id is null
     or not public.activity_is_workspace_operator(v_tenant.id) then
    raise exception 'ACTIVITY_ADMIN_FORBIDDEN';
  end if;

  return jsonb_build_object(
    'activity',jsonb_build_object('id',v_activity.id,'activity_key',v_activity.activity_key,'title',v_activity.title,'starts_at',v_activity.starts_at,'venue',v_activity.venue),
    'recipients',coalesce((
      select jsonb_agg(jsonb_build_object(
        'participation_id',p.id,
        'name',pe.display_name,
        'email',(select c.value from public.person_contacts c where c.person_id=pe.id and c.kind='email' order by c.is_primary desc,c.created_at limit 1),
        'phone',(select c.value from public.person_contacts c where c.person_id=pe.id and c.kind='phone' order by c.is_primary desc,c.created_at limit 1)
      ) order by p.submitted_at)
      from public.activity_participations p
      join public.people pe on pe.id=p.person_id
      where p.activity_id=v_activity.id
        and p.status not in ('cancelled')
        and (p_participation_ids is null or p.id=any(p_participation_ids))
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.activity_admin_message_recipients(text,text,uuid[]) from public, anon, authenticated;
grant execute on function public.activity_admin_message_recipients(text,text,uuid[]) to authenticated, service_role;

create or replace function public.activity_admin_record_message(
  p_workspace_slug text,
  p_activity_key text,
  p_channel text,
  p_subject text,
  p_body text,
  p_recipient_participation_ids uuid[],
  p_requested_count integer,
  p_sent_count integer,
  p_failed_count integer,
  p_sender_ref text default ''
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_tenant public.tenants%rowtype;
  v_activity public.activities%rowtype;
  v_id uuid;
begin
  select * into v_tenant from public.tenants where slug=lower(trim(p_workspace_slug));
  select a.* into v_activity from public.activities a
  where a.workspace_tenant_id=v_tenant.id and a.activity_key=p_activity_key;
  if v_tenant.id is null or v_activity.id is null
     or not public.activity_is_workspace_operator(v_tenant.id) then
    raise exception 'ACTIVITY_ADMIN_FORBIDDEN';
  end if;
  if lower(trim(coalesce(p_channel,''))) not in ('email','sms','alimtalk') then raise exception 'INVALID_MESSAGE_CHANNEL'; end if;

  insert into public.activity_message_campaigns(
    activity_id,channel,subject,body,recipient_participation_ids,
    requested_count,sent_count,failed_count,sender_ref,created_by
  ) values (
    v_activity.id,lower(trim(p_channel)),left(coalesce(p_subject,''),500),left(coalesce(p_body,''),20000),
    coalesce(p_recipient_participation_ids,'{}'::uuid[]),greatest(coalesce(p_requested_count,0),0),
    greatest(coalesce(p_sent_count,0),0),greatest(coalesce(p_failed_count,0),0),
    left(coalesce(p_sender_ref,''),300),auth.uid()
  ) returning id into v_id;
  return jsonb_build_object('ok',true,'campaign_id',v_id);
end;
$$;
revoke all on function public.activity_admin_record_message(text,text,text,text,text,uuid[],integer,integer,integer,text) from public, anon, authenticated;
grant execute on function public.activity_admin_record_message(text,text,text,text,text,uuid[],integer,integer,integer,text) to authenticated, service_role;

create or replace function public.activity_admin_message_history(
  p_workspace_slug text,
  p_activity_key text,
  p_limit integer default 20
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_tenant public.tenants%rowtype;
  v_activity public.activities%rowtype;
begin
  select * into v_tenant from public.tenants where slug=lower(trim(p_workspace_slug));
  select a.* into v_activity from public.activities a
  where a.workspace_tenant_id=v_tenant.id and a.activity_key=p_activity_key;
  if v_tenant.id is null or v_activity.id is null
     or not public.activity_is_workspace_operator(v_tenant.id) then
    raise exception 'ACTIVITY_ADMIN_FORBIDDEN';
  end if;

  return jsonb_build_object('messages',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from (
      select id,channel,subject,requested_count,sent_count,failed_count,sender_ref,created_at
      from public.activity_message_campaigns
      where activity_id=v_activity.id
      order by created_at desc
      limit least(greatest(coalesce(p_limit,20),1),100)
    ) x
  ),'[]'::jsonb));
end;
$$;
revoke all on function public.activity_admin_message_history(text,text,integer) from public, anon, authenticated;
grant execute on function public.activity_admin_message_history(text,text,integer) to authenticated, service_role;
