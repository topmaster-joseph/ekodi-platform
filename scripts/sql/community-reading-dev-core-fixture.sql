-- Development-only Community core contract for isolated synthetic tests.
-- Not included in production migration paths. No production data replication.
create table if not exists public.community_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '',
 bio text not null default '',
 region text not null default '',
 languages text[] not null default '{}',
 interests text[] not null default '{}',
 skills_offered text[] not null default '{}',
 wants_to_learn text[] not null default '{}',
 visibility text not null default 'members',
 discoverable boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.community_circles (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references auth.users(id),
 slug text not null unique,
 name text not null,
 summary text not null default '',
 purpose text not null default '',
 category text not null default 'general',
 tags text[] not null default '{}',
 mode text not null default 'hybrid' check(mode in ('online','offline','hybrid')),
 location_text text not null default '',
 schedule_text text not null default '',
 capacity integer check (capacity is null or capacity between 2 and 500),
 visibility text not null default 'public' check(visibility in ('public','members','private')),
 join_policy text not null default 'approval' check(join_policy in ('open','approval','invite')),
 status text not null default 'active' check(status in ('draft','active','paused','closed','archived')),
 workspace_tenant_id uuid references public.tenants(id) on delete cascade,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists community_circles_workspace_tenant_idx
 on public.community_circles(workspace_tenant_id,status,created_at desc);
create table if not exists public.community_circle_members (
 circle_id uuid not null references public.community_circles(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'member' check(role in ('owner','leader','member')),
 status text not null default 'pending' check(status in ('pending','active','declined','left','blocked')),
 note text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(circle_id,user_id)
);
create table if not exists public.community_activity (
 id bigint generated always as identity primary key,
 actor_user_id uuid references auth.users(id),
 circle_id uuid references public.community_circles(id),
 activity_type text not null,
 body jsonb not null default '{}',
 created_at timestamptz not null default now()
);
do $$
declare tbl text;
begin
 foreach tbl in array array[
   'community_profiles','community_circles','community_circle_members','community_activity'
 ] loop
  execute format('alter table public.%I enable row level security',tbl);
  execute format('revoke all on table public.%I from public,anon,authenticated',tbl);
  execute format('grant select,insert,update,delete on table public.%I to service_role',tbl);
 end loop;
end
$$;
revoke all on sequence public.community_activity_id_seq from public,anon,authenticated;
grant usage,select on sequence public.community_activity_id_seq to service_role;
