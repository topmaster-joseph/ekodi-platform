-- EKODI Human Publishing: private co-writing enrollment, written answers and
-- dormant new subscription entitlements. Non-EKODIAN projects only.
-- All paid entitlements are FAIL-CLOSED until verified billing is implemented.
-- No existing author_* tables or book sales are altered.
create table if not exists public.human_author_subscriptions (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null check (plan_id in ('writer1', 'writer3')),
  status text not null default 'pending' check (status in ('pending','active','past_due','cancelled','suspended')),
  verified_payment_at timestamptz,
  paid_until timestamptz,
  payment_provider_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint human_subscription_active_verified
    check (status <> 'active' or (verified_payment_at is not null and paid_until is not null))
);

create table if not exists public.human_author_enrollments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  author_project_id uuid not null unique references public.author_projects(id) on delete cascade,
  cycle_month date not null,
  request_key text not null check (length(request_key) between 8 and 100),
  plan_id text not null check (plan_id in ('free', 'writer1', 'writer3')),
  writing_mode text not null check (writing_mode in ('simple','human')),
  status text not null default 'active' check (status in ('active','completed','archived')),
  created_at timestamptz not null default now(),
  unique(owner_user_id, cycle_month, request_key)
);

create index if not exists idx_human_author_enrollments_owner_month
  on public.human_author_enrollments(owner_user_id, cycle_month);

create table if not exists public.human_author_interview_turns (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.human_author_enrollments(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  stage text not null check (stage in ('intent','lived-context','tension','audience','structure','chapter','revision','approval')),
  question text not null check (length(question) between 1 and 1200),
  author_answer text not null check (length(author_answer) between 1 and 18000),
  created_at timestamptz not null default now()
);

create index if not exists idx_human_author_interview_owner_time
  on public.human_author_interview_turns(owner_user_id, enrollment_id, created_at desc);

alter table public.human_author_subscriptions enable row level security;
alter table public.human_author_enrollments enable row level security;
alter table public.human_author_interview_turns enable row level security;

-- Paid rights are privately readable; only a trusted billing handler may write them.
create policy human_author_subscriptions_owner_read
  on public.human_author_subscriptions for select to authenticated
  using (owner_user_id = (select auth.uid()));
revoke all on public.human_author_subscriptions from anon, authenticated;
grant select on public.human_author_subscriptions to authenticated;

create policy human_author_enrollments_owner_read
  on public.human_author_enrollments for select to authenticated
  using (owner_user_id = (select auth.uid()));
revoke all on public.human_author_enrollments from anon, authenticated;
grant select on public.human_author_enrollments to authenticated;

create policy human_author_interview_owner_read
  on public.human_author_interview_turns for select to authenticated
  using (owner_user_id = (select auth.uid()));
-- Append-only draft responses. The buyer cannot impersonate an editor or
-- view / write a different author's drafts through guessed UUIDs.
create policy human_author_interview_owner_append
  on public.human_author_interview_turns for insert to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and exists (
      select 1 from public.human_author_enrollments e
      where e.id = enrollment_id
        and e.owner_user_id = (select auth.uid())
        and e.writing_mode = 'human'
    )
  );
revoke all on public.human_author_interview_turns from anon, authenticated;
grant select, insert on public.human_author_interview_turns to authenticated;

-- This is a server-side transactional lock, quota and ownership guard. It does
-- not activate a billing plan. No client may insert enrollment rows directly.
create or replace function public.human_author_reserve_project(
  p_author_project_id uuid,
  p_request_key text,
  p_writing_mode text default 'simple'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_month date := date_trunc('month', now() at time zone 'Asia/Seoul')::date;
  v_existing public.human_author_enrollments%rowtype;
  v_subscription public.human_author_subscriptions%rowtype;
  v_plan text := 'free';
  v_limit integer := 1;
  v_used integer;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;
  if p_author_project_id is null or p_request_key is null
     or length(trim(p_request_key)) < 8 or length(p_request_key) > 100
     or p_writing_mode not in ('simple','human') then
    raise exception 'invalid_human_author_request';
  end if;

  -- Do not accept arbitrary client-supplied roles or plan identifiers.
  if not exists (
    select 1 from public.author_projects
    where id = p_author_project_id
      and owner_user_id = v_user
      and creator_mode = 'writer'
      and status not in ('published')
  ) then
    raise exception 'owned_writer_project_required';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user::text), hashtext(v_month::text));

  select * into v_existing from public.human_author_enrollments
    where owner_user_id = v_user and author_project_id = p_author_project_id;
  if found then
    return jsonb_build_object('ok', true, 'idempotent', true,
      'enrollment_id', v_existing.id, 'writing_mode', v_existing.writing_mode,
      'plan_id', v_existing.plan_id);
  end if;
  select * into v_existing from public.human_author_enrollments
    where owner_user_id = v_user and cycle_month = v_month
      and request_key = p_request_key;
  if found then
    raise exception 'request_key_already_used_for_another_project';
  end if;

  if p_writing_mode = 'human' then
    select * into v_subscription from public.human_author_subscriptions
      where owner_user_id = v_user for update;
    if not found or v_subscription.status <> 'active'
       or v_subscription.verified_payment_at is null
       or v_subscription.paid_until is null
       or v_subscription.paid_until <= now() then
      raise exception 'verified_paid_human_subscription_required';
    end if;
    v_plan := v_subscription.plan_id;
    v_limit := case v_plan when 'writer3' then 3 else 1 end;
  end if;

  select count(*) into v_used from public.human_author_enrollments
    where owner_user_id = v_user and cycle_month = v_month
      and writing_mode = p_writing_mode;

  if v_used >= v_limit then
    raise exception 'monthly_human_author_project_limit_reached';
  end if;

  insert into public.human_author_enrollments
    (owner_user_id, author_project_id, cycle_month, request_key, plan_id, writing_mode)
  values (v_user, p_author_project_id, v_month, p_request_key, v_plan, p_writing_mode)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'idempotent', false,
    'enrollment_id', v_id, 'plan_id', v_plan, 'writing_mode', p_writing_mode,
    'cycle_month', v_month);
end
$$;

revoke all on function public.human_author_reserve_project(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.human_author_reserve_project(uuid,text,text)
  to authenticated;

comment on table public.human_author_enrollments is
  'Personal author-book workflow allocation; independent of EKODIAN chief-editor monthly publishing line.';
comment on table public.human_author_interview_turns is
  'Private author-supplied responses, not independent evidence of real-world testimony or editorial approval.';
