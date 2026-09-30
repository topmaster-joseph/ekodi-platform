create table if not exists public.mission_events (
  event_key text primary key,
  workspace_key text not null default 'ekodimission',
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  venue text not null default '',
  status text not null default 'private_review' check (status in ('private_review','published','closed')),
  applications_open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mission_event_applications (
  id uuid primary key default gen_random_uuid(),
  event_key text not null references public.mission_events(event_key) on delete restrict,
  name text not null,
  phone text not null,
  phone_normalized text not null,
  email text not null default '',
  party_size integer not null default 1 check (party_size between 1 and 20),
  language text not null default 'ko',
  dietary text not null default '',
  note text not null default '',
  photo_consent boolean not null default false,
  privacy_consent boolean not null default false,
  status text not null default 'received' check (status in ('received','confirmed','cancelled','attended')),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_key, phone_normalized)
);

alter table public.mission_events enable row level security;
alter table public.mission_event_applications enable row level security;
revoke all on table public.mission_events from anon, authenticated;
revoke all on table public.mission_event_applications from anon, authenticated;

insert into public.mission_events(event_key,workspace_key,title,starts_at,ends_at,venue,status,applications_open)
values ('260925-chuseok-open-table','ekodimission','2026 에코디 추석 열린식탁','2026-09-25 16:00:00+09','2026-09-25 18:00:00+09','자담치킨&피자마루 · 목포대 후문','private_review',true)
on conflict (event_key) do update set title=excluded.title,starts_at=excluded.starts_at,ends_at=excluded.ends_at,venue=excluded.venue,updated_at=now();

create or replace function public.mission_submit_event_application(
  p_event_key text,
  p_name text,
  p_phone text,
  p_email text default '',
  p_party_size integer default 1,
  p_language text default 'ko',
  p_dietary text default '',
  p_note text default '',
  p_photo_consent boolean default false,
  p_privacy_consent boolean default false,
  p_website text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.mission_events%rowtype;
  v_phone text;
  v_id uuid;
  v_now timestamptz := now();
begin
  if length(trim(coalesce(p_website,''))) > 0 then return jsonb_build_object('ok',true,'message','신청이 접수되었습니다.'); end if;
  if coalesce(p_event_key,'') !~ '^[0-9]{6}-[a-z0-9][a-z0-9-]{2,79}$' then raise exception 'INVALID_EVENT'; end if;
  select * into v_event from public.mission_events where event_key=p_event_key;
  if not found or not v_event.applications_open or v_event.status='closed' then raise exception 'APPLICATION_CLOSED'; end if;
  if length(trim(coalesce(p_name,''))) < 1 or length(trim(coalesce(p_name,''))) > 80 then raise exception 'INVALID_NAME'; end if;
  v_phone := regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g');
  if length(v_phone) < 8 or length(v_phone) > 20 then raise exception 'INVALID_PHONE'; end if;
  if length(trim(coalesce(p_email,''))) > 254 then raise exception 'INVALID_EMAIL'; end if;
  if length(trim(coalesce(p_email,''))) > 0 and trim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_EMAIL'; end if;
  if coalesce(p_party_size,0) < 1 or p_party_size > 20 then raise exception 'INVALID_PARTY_SIZE'; end if;
  if not coalesce(p_privacy_consent,false) then raise exception 'PRIVACY_CONSENT_REQUIRED'; end if;

  insert into public.mission_event_applications(event_key,name,phone,phone_normalized,email,party_size,language,dietary,note,photo_consent,privacy_consent,status,submitted_at,updated_at)
  values (p_event_key,left(trim(p_name),80),left(trim(p_phone),40),v_phone,left(trim(coalesce(p_email,'')),254),p_party_size,left(trim(coalesce(p_language,'ko')),24),left(trim(coalesce(p_dietary,'')),500),left(trim(coalesce(p_note,'')),2000),coalesce(p_photo_consent,false),true,'received',v_now,v_now)
  on conflict (event_key,phone_normalized) do update set name=excluded.name,phone=excluded.phone,email=excluded.email,party_size=excluded.party_size,language=excluded.language,dietary=excluded.dietary,note=excluded.note,photo_consent=excluded.photo_consent,privacy_consent=true,status='received',updated_at=v_now
  returning id into v_id;

  return jsonb_build_object('ok',true,'application_id',v_id,'event_key',p_event_key,'message','신청이 접수되었습니다.');
end;
$$;

revoke all on function public.mission_submit_event_application(text,text,text,text,integer,text,text,text,boolean,boolean,text) from public;
grant execute on function public.mission_submit_event_application(text,text,text,text,integer,text,text,text,boolean,boolean,text) to anon, authenticated;
