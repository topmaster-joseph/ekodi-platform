create table if not exists public.seonam_med_civic_voices (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('question','proposal','experience','factcheck','tip','other')),
  display_name text not null default '',
  contact text not null default '',
  message text not null,
  public_consent boolean not null default false,
  privacy_consent boolean not null default false,
  review_status text not null default 'received' check (review_status in ('received','reviewing','answered','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.seonam_med_civic_voices enable row level security;
revoke all on table public.seonam_med_civic_voices from anon, authenticated;

create or replace function public.seonam_med_submit_voice(
  p_category text,
  p_name text default '',
  p_contact text default '',
  p_message text default '',
  p_public_consent boolean default false,
  p_privacy_consent boolean default false,
  p_website text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_category text := lower(trim(coalesce(p_category,'other')));
  v_message text := trim(coalesce(p_message,''));
begin
  if length(trim(coalesce(p_website,''))) > 0 then
    return jsonb_build_object('ok',true,'message','의견이 접수되었습니다.');
  end if;
  if v_category not in ('question','proposal','experience','factcheck','tip','other') then
    raise exception 'INVALID_CATEGORY';
  end if;
  if length(v_message) < 1 or length(v_message) > 3000 then
    raise exception 'INVALID_MESSAGE';
  end if;
  if not coalesce(p_privacy_consent,false) then
    raise exception 'PRIVACY_CONSENT_REQUIRED';
  end if;

  insert into public.seonam_med_civic_voices(category,display_name,contact,message,public_consent,privacy_consent,review_status)
  values (v_category,left(trim(coalesce(p_name,'')),80),left(trim(coalesce(p_contact,'')),160),v_message,coalesce(p_public_consent,false),true,'received')
  returning id into v_id;

  return jsonb_build_object('ok',true,'submission_id',v_id,'message','의견이 접수되었습니다.');
end;
$$;

revoke all on function public.seonam_med_submit_voice(text,text,text,text,boolean,boolean,text) from public;
grant execute on function public.seonam_med_submit_voice(text,text,text,text,boolean,boolean,text) to anon, authenticated;
