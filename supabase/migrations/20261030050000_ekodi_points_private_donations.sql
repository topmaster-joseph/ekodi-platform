-- Donation pledges are point allocations, NOT cash donations or tax receipts.
-- Trusted backend verifies campaign ownership, user identity, consent and terms.
create table if not exists public.ekodi_point_donation_campaigns (
  campaign_id uuid primary key default gen_random_uuid(),
  site_id text not null references public.ekodi_point_sites(site_id),
  title text not null check(length(trim(title)) between 3 and 160),
  recipient_name text not null check(length(trim(recipient_name)) between 2 and 160),
  enabled boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  check(ends_at is null or starts_at is null or ends_at>starts_at)
);
create table if not exists public.ekodi_point_donations (
  donation_id bigint generated always as identity primary key,
  campaign_id uuid not null references public.ekodi_point_donation_campaigns(campaign_id),
  site_id text not null references public.ekodi_point_sites(site_id),
  user_id uuid not null references public.people(id),
  points integer not null check(points between 1 and 100000),
  event_key text not null,
  created_at timestamptz not null default now(),
  unique(site_id,user_id,event_key)
);
create index if not exists ekodi_point_donations_campaign_idx
  on public.ekodi_point_donations(campaign_id,created_at);
alter table public.ekodi_point_donation_campaigns enable row level security;
alter table public.ekodi_point_donations enable row level security;
revoke all on table public.ekodi_point_donation_campaigns,
  public.ekodi_point_donations
  from public, anon, authenticated, service_role;
grant select on table public.ekodi_point_donation_campaigns,
  public.ekodi_point_donations to service_role;
create or replace function ekodi_points_private.donate_points(
  p_campaign uuid, p_user uuid, p_points integer, p_event_key text
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_campaign public.ekodi_point_donation_campaigns%rowtype;
  v_balance bigint;
  v_donation_id bigint;
begin
  if p_campaign is null or p_user is null or p_points is null
     or p_points not between 1 and 100000
     or p_event_key is null or length(p_event_key) not between 8 and 200 then
    raise exception 'INVALID_POINT_DONATION';
  end if;
  select * into v_campaign from public.ekodi_point_donation_campaigns
    where campaign_id=p_campaign and enabled
      and (starts_at is null or starts_at<=now())
      and (ends_at is null or ends_at>now());
  if not found then raise exception 'DONATION_CAMPAIGN_INACTIVE'; end if;
  if not exists(select 1 from public.ekodi_point_sites
                where site_id=v_campaign.site_id and enabled) then
    raise exception 'POINT_SITE_DISABLED';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(v_campaign.site_id || ':' || p_user::text,0));
  if exists(select 1 from public.ekodi_point_ledger
    where site_id=v_campaign.site_id and user_id=p_user and event_key=p_event_key) then
    return jsonb_build_object('donated',false,'reason','DUPLICATE');
  end if;
  update public.ekodi_point_wallets
    set balance=balance-p_points,updated_at=now()
    where site_id=v_campaign.site_id and user_id=p_user and balance>=p_points
    returning balance into v_balance;
  if not found then
    return jsonb_build_object('donated',false,'reason','INSUFFICIENT_BALANCE');
  end if;
  insert into public.ekodi_point_ledger
    (site_id,user_id,amount,event_kind,event_key,metadata)
    values(v_campaign.site_id,p_user,-p_points,'donation',p_event_key,
      jsonb_build_object('campaign_id',p_campaign))
    returning id into v_donation_id;
  insert into public.ekodi_point_donations
    (campaign_id,site_id,user_id,points,event_key)
    values(p_campaign,v_campaign.site_id,p_user,p_points,p_event_key);
  return jsonb_build_object('donated',true,'points',p_points,
    'balance',v_balance,'ledger_id',v_donation_id);
end;
$$;
revoke all on function ekodi_points_private.donate_points(uuid,uuid,integer,text)
  from public,anon,authenticated;
grant execute on function ekodi_points_private.donate_points(uuid,uuid,integer,text)
  to service_role;
-- No automatic real-money payout, receipt issuance, or accounting claim.
