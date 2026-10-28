
create schema if not exists ministry_private;
revoke all on schema ministry_private from public, anon, authenticated;
grant usage on schema ministry_private to service_role;

create table if not exists ministry_private.finance_publications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft','approved','revoked')),
  audience text not null default 'members' check (audience = 'members'),
  allowed_sections text[] not null default '{}'::text[],
  source_revision text not null default '',
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_publication_valid_period check (period_start<=period_end),
  constraint finance_publication_valid_sections check (
     allowed_sections <@ array['income','expense','balance','budget']::text[]
     and cardinality(allowed_sections)<=4
  ),
  constraint finance_publication_approval_complete check (
     status<>'approved' or (approved_by is not null and approved_at is not null and source_revision<>'')
  )
);
create unique index if not exists ministry_finance_approved_period_uidx
  on ministry_private.finance_publications(tenant_id,period_start,period_end)
  where status='approved';

create table if not exists ministry_private.finance_publication_blocks (
  id bigint generated always as identity primary key,
  publication_id uuid not null references ministry_private.finance_publications(id) on delete cascade,
  section text not null check(section in ('income','expense','balance','budget')),
  category text not null,
  amount bigint not null check(amount>=0),
  source_count integer not null default 0 check(source_count>=0),
  distinct_contributors integer check(distinct_contributors is null or distinct_contributors>=0),
  approved boolean not null default false,
  unique(publication_id,section,category),
  constraint finance_publication_controlled_category check (
     (section='income' and category in ('offerings','donations','grants','other'))
     or (section='expense' and category in ('worship','missions','education','welfare','programs','operations','other'))
     or (section='balance' and category in ('opening','closing'))
     or (section='budget' and category in ('approved','used'))
  )
);

create table if not exists ministry_private.finance_publication_audit (
  id bigint generated always as identity primary key,
  publication_id uuid not null references ministry_private.finance_publications(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check(action in ('create','edit','approve','revoke','view_export')),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists ministry_finance_publications_tenant_idx
  on ministry_private.finance_publications(tenant_id,status,period_start,period_end);
create index if not exists ministry_finance_publication_audit_tenant_idx
  on ministry_private.finance_publication_audit(tenant_id,created_at desc);

alter table ministry_private.finance_publications enable row level security;
alter table ministry_private.finance_publication_blocks enable row level security;
alter table ministry_private.finance_publication_audit enable row level security;
revoke all on ministry_private.finance_publications,ministry_private.finance_publication_blocks,ministry_private.finance_publication_audit from public, anon, authenticated;
grant all on ministry_private.finance_publications,ministry_private.finance_publication_blocks,ministry_private.finance_publication_audit to service_role;
grant all on all sequences in schema ministry_private to service_role;

create or replace function public.ministry_finance_read_context(
 p_site text,
 p_subject_id uuid,
 p_year integer
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
 v_slug text;
 v_tenant_id uuid;
 v_publication ministry_private.finance_publications%rowtype;
 v_blocks jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then
   raise exception 'service role required' using errcode='42501';
 end if;
 v_slug:=case p_site when 'ekodichurch' then 'ekodi-church'
                     when 'ekodimission' then 'ekodimission'
                     else null end;
 if v_slug is null or p_subject_id is null or p_year<2020 or p_year>2100 or p_year is null then
   return jsonb_build_object('membership',null,'publication',null);
 end if;
 select t.id into v_tenant_id from public.tenants t where t.slug=v_slug and t.status='active' limit 1;
 if v_tenant_id is null or not exists(
   select 1 from public.tenant_members m
   where m.tenant_id=v_tenant_id and m.user_id=p_subject_id and m.status='active'
 ) then
   return jsonb_build_object('membership',null,'publication',null);
 end if;
 select p.* into v_publication
 from ministry_private.finance_publications p
 where p.tenant_id=v_tenant_id and p.status='approved' and p.audience='members'
   and p.approved_at is not null and p.approved_by is not null and p.source_revision<>''
   and p.period_start<=make_date(p_year,1,1)
   and p.period_end>=make_date(p_year,12,31)
 order by p.approved_at desc,p.created_at desc limit 1;
 if v_publication.id is null then
   return jsonb_build_object(
     'membership',jsonb_build_object('tenantId',v_slug,'userId',p_subject_id::text,'status','active','verified',true),
     'publication',null
   );
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
     'section',b.section,'category',b.category,'amount',b.amount,
     'sourceCount',b.source_count,'distinctContributors',b.distinct_contributors,
     'approved',b.approved
   ) order by b.section,b.category),'[]'::jsonb)
 into v_blocks
 from ministry_private.finance_publication_blocks b
 where b.publication_id=v_publication.id and b.approved=true;
 return jsonb_build_object(
   'membership',jsonb_build_object('tenantId',v_slug,'userId',p_subject_id::text,'status','active','verified',true),
   'publication',jsonb_build_object(
      'tenantId',v_slug,'status',v_publication.status,'audience',v_publication.audience,
      'approvedBy',v_publication.approved_by::text,'approvedAt',v_publication.approved_at::text,
      'periodStart',v_publication.period_start::text,'periodEnd',v_publication.period_end::text,
      'allowedSections',v_publication.allowed_sections,'blocks',v_blocks
   )
 );
end;
$$;
revoke all on function public.ministry_finance_read_context(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.ministry_finance_read_context(text,uuid,integer) to service_role;
