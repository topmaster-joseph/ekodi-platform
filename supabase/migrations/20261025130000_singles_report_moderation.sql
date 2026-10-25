-- Report moderation for EKODI 동행: a separate, least-privilege reviewer role,
-- reviewer fields on reports, an append-only audit trail, and one atomic review
-- function. Reviewers cannot act on reports they filed or that target them.
create table if not exists public.singles_report_operators(
 user_id uuid primary key,
 enabled boolean not null default false,
 can_review boolean not null default false,
 created_at timestamptz not null default now()
);
alter table public.singles_reports
 add column if not exists reviewed_at timestamptz,
 add column if not exists reviewed_by uuid,
 add column if not exists resolution_note text check (resolution_note is null or char_length(resolution_note)<=500);
create table if not exists public.singles_report_audit(
 id bigint generated always as identity primary key,
 report_id uuid not null references public.singles_reports(id) on delete cascade,
 actor_id uuid not null,
 from_status text not null,
 to_status text not null,
 note text check (note is null or char_length(note)<=500),
 created_at timestamptz not null default now()
);
create index if not exists singles_reports_status_created on public.singles_reports(status,created_at);
alter table public.singles_report_operators enable row level security;
alter table public.singles_report_audit enable row level security;
revoke all on table public.singles_report_operators,public.singles_report_audit from public,anon,authenticated;
grant select on table public.singles_report_operators to service_role;
grant select,insert on table public.singles_report_audit to service_role;

create or replace function public.singles_report_review(p_report uuid,p_operator uuid,p_status text,p_note text default null)
 returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.singles_reports%rowtype; note text:=nullif(trim(coalesce(p_note,'')),'');
begin
 if not exists(select 1 from public.singles_report_operators where user_id=p_operator and enabled=true and can_review=true)
 then raise exception 'operator_not_authorized' using errcode='42501'; end if;
 if p_status not in ('under_review','resolved','dismissed') or char_length(coalesce(note,''))>500
 then raise exception 'invalid_review' using errcode='22023'; end if;
 if p_status in ('resolved','dismissed') and char_length(coalesce(note,''))<2
 then raise exception 'resolution_note_required' using errcode='22023'; end if;
 select * into r from public.singles_reports where id=p_report for update;
 if not found then raise exception 'report_not_found' using errcode='P0002'; end if;
 if p_operator in (r.reporter_id,r.target_id) then raise exception 'operator_conflict_of_interest' using errcode='42501'; end if;
 if not (r.status='open' or (r.status='under_review' and p_status in ('resolved','dismissed')))
 then raise exception 'report_not_reviewable' using errcode='23514'; end if;
 update public.singles_reports set status=p_status,reviewed_at=now(),reviewed_by=p_operator,
   resolution_note=coalesce(note,resolution_note) where id=p_report;
 insert into public.singles_report_audit(report_id,actor_id,from_status,to_status,note)
   values(p_report,p_operator,r.status,p_status,note);
 return p_status;
end $$;
revoke all on function public.singles_report_review(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.singles_report_review(uuid,uuid,text,text) to service_role;
