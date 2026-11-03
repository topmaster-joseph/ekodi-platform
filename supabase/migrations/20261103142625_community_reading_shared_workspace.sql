-- EKODI Community / Reading & Dialogue stage 2B.
-- Server-only, workspace-isolated member records. No direct browser grants.
-- Production is applied ONLY by protected EKODI Orchestrator schema lane after DEV verification.
do $$
begin
  if to_regclass('public.community_circles') is null
    or to_regclass('public.community_circle_members') is null
    or to_regclass('public.tenants') is null then
    raise exception 'reading_requires_community_core';
  end if;
end
$$;

create table if not exists public.community_reading_meetings (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.community_circles(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  title text not null check (char_length(title) between 2 and 160),
  book_title text not null default '' check (char_length(book_title) <= 160),
  summary text not null default '' check (char_length(summary) <= 1000),
  starts_at timestamptz,
  status text not null default 'planned' check (status in ('planned','done','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,circle_id)
);
create index if not exists community_reading_meetings_circle_idx
  on public.community_reading_meetings(circle_id,created_at desc);

create table if not exists public.community_reading_entries (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.community_circles(id) on delete cascade,
  meeting_id uuid not null,
  parent_id uuid,
  author_user_id uuid not null references auth.users(id),
  kind text not null check (kind in ('question','reflection','action','reply')),
  scope text not null default 'private' check (scope in ('private','circle')),
  content text not null check (char_length(content) <= 2500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id,circle_id,meeting_id),
  constraint reading_entry_meeting_fk foreign key (meeting_id,circle_id)
    references public.community_reading_meetings(id,circle_id) on delete cascade,
  constraint reading_entry_parent_fk foreign key (parent_id,circle_id,meeting_id)
    references public.community_reading_entries(id,circle_id,meeting_id) on delete cascade
);
create index if not exists community_reading_entries_meeting_idx
  on public.community_reading_entries(circle_id,meeting_id,created_at) where deleted_at is null;
create index if not exists community_reading_entries_private_idx
  on public.community_reading_entries(author_user_id,circle_id,meeting_id,created_at) where scope='private' and deleted_at is null;

create table if not exists public.community_reading_attendance (
  meeting_id uuid not null,
  circle_id uuid not null references public.community_circles(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  status text not null check (status in ('present','absent','excused')),
  set_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key(meeting_id,user_id),
  constraint reading_attendance_meeting_fk foreign key (meeting_id,circle_id)
    references public.community_reading_meetings(id,circle_id) on delete cascade
);
create index if not exists community_reading_attendance_circle_idx
  on public.community_reading_attendance(circle_id,meeting_id);

create table if not exists public.community_reading_audit (
  id bigint generated always as identity primary key,
  circle_id uuid not null references public.community_circles(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  action text not null check (char_length(action) between 3 and 70),
  target_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists community_reading_audit_circle_idx
  on public.community_reading_audit(circle_id,created_at desc);

create index if not exists community_reading_meetings_created_by_idx
  on public.community_reading_meetings(created_by,created_at desc);
create index if not exists community_reading_entries_meeting_fk_idx
  on public.community_reading_entries(meeting_id,circle_id);
create index if not exists community_reading_entries_parent_fk_idx
  on public.community_reading_entries(parent_id,circle_id,meeting_id);
create index if not exists community_reading_attendance_meeting_fk_idx
  on public.community_reading_attendance(meeting_id,circle_id);
create index if not exists community_reading_attendance_user_idx
  on public.community_reading_attendance(user_id,meeting_id);
create index if not exists community_reading_attendance_set_by_idx
  on public.community_reading_attendance(set_by,updated_at desc);
create index if not exists community_reading_audit_actor_idx
  on public.community_reading_audit(actor_user_id,created_at desc);

-- All reading tables require service-validated access. The Edge Function checks
-- membership, owner/leader role and workspace tenant on each request.
alter table public.community_reading_meetings enable row level security;
revoke all on table public.community_reading_meetings from public,anon,authenticated;
grant select,insert,update,delete on table public.community_reading_meetings to service_role;
alter table public.community_reading_entries enable row level security;
revoke all on table public.community_reading_entries from public,anon,authenticated;
grant select,insert,update,delete on table public.community_reading_entries to service_role;
alter table public.community_reading_attendance enable row level security;
revoke all on table public.community_reading_attendance from public,anon,authenticated;
grant select,insert,update,delete on table public.community_reading_attendance to service_role;
alter table public.community_reading_audit enable row level security;
revoke all on table public.community_reading_audit from public,anon,authenticated;
grant select,insert,update,delete on table public.community_reading_audit to service_role;

revoke all on sequence public.community_reading_audit_id_seq from public,anon,authenticated;
grant usage,select on sequence public.community_reading_audit_id_seq to service_role;

-- The only privileged state transition: atomic capacity-safe member review.
-- SECURITY INVOKER, service-role-only EXECUTE; no RLS bypass function in public.
create or replace function public.community_reading_review_member(
  p_circle_id uuid, p_actor_id uuid, p_target_id uuid, p_decision text
) returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  c record;
  actor record;
  target record;
  active_count integer;
  new_status text;
begin
  if p_decision not in ('approve','decline') or p_actor_id=p_target_id then
    return jsonb_build_object('ok',false,'error','invalid_decision');
  end if;
  select id,owner_user_id,workspace_tenant_id,capacity,status into c
    from public.community_circles where id=p_circle_id for update;
  if not found or c.status <> 'active' then
    return jsonb_build_object('ok',false,'error','circle_not_found');
  end if;
  select role,status into actor from public.community_circle_members
    where circle_id=p_circle_id and user_id=p_actor_id;
  if not found or actor.status <> 'active'
     or not ((actor.role='owner' and c.owner_user_id=p_actor_id) or actor.role='leader') then
    return jsonb_build_object('ok',false,'error','manager_required');
  end if;
  if c.workspace_tenant_id is not null and not exists(
    select 1 from public.tenant_members where tenant_id=c.workspace_tenant_id
      and user_id=p_actor_id and status='active') then
    return jsonb_build_object('ok',false,'error','workspace_membership_required');
  end if;
  select role,status into target from public.community_circle_members
    where circle_id=p_circle_id and user_id=p_target_id;
  if not found or target.role <> 'member' or target.status <> 'pending' then
    return jsonb_build_object('ok',false,'error','not_pending');
  end if;
  if c.workspace_tenant_id is not null and not exists(
    select 1 from public.tenant_members where tenant_id=c.workspace_tenant_id
      and user_id=p_target_id and status='active') then
    return jsonb_build_object('ok',false,'error','workspace_membership_required');
  end if;
  if p_decision='approve' then
    select count(*) into active_count from public.community_circle_members
      where circle_id=p_circle_id and status='active';
    if c.capacity is not null and active_count >= c.capacity then
      return jsonb_build_object('ok',false,'error','circle_full');
    end if;
  end if;
  new_status := case when p_decision='approve' then 'active' else 'declined' end;
  update public.community_circle_members set status=new_status,updated_at=now()
    where circle_id=p_circle_id and user_id=p_target_id and role='member' and status='pending';
  insert into public.community_reading_audit(circle_id,actor_user_id,action,target_id)
    values(p_circle_id,p_actor_id,'membership.' || new_status,p_target_id);
  return jsonb_build_object('ok',true,'status',new_status);
end
$$;
revoke all on function public.community_reading_review_member(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.community_reading_review_member(uuid,uuid,uuid,text) to service_role;

comment on table public.community_reading_entries is
  'Private by default; circle visibility only after explicit opt-in. API filters by active membership and tenant.';
comment on table public.community_reading_attendance is
  'Only circle leaders can record attendance. Members can read their own record.';
