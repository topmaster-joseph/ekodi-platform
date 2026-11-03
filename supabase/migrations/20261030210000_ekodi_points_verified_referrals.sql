-- EKODI low-value referral completion rewards.
-- Sending/opening a link is never reward evidence. The claimant must be a
-- different, *new* canonical Person whose confirmed login was registered
-- after this server-issued token. Disabled by default at site/rule level.
create table if not exists public.ekodi_point_referral_invites (
  invite_code uuid primary key default gen_random_uuid(),
  site_id text not null references public.ekodi_point_sites(site_id),
  inviter_person_id uuid not null references public.people(id),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '14 days'),
  check (expires_at>issued_at)
);
create index if not exists ekodi_point_referral_invites_day_idx
  on public.ekodi_point_referral_invites(site_id,inviter_person_id,issued_at);

create table if not exists public.ekodi_point_referral_rewards (
  site_id text not null references public.ekodi_point_sites(site_id),
  referred_person_id uuid not null references public.people(id),
  inviter_person_id uuid not null references public.people(id),
  invite_code uuid not null references public.ekodi_point_referral_invites(invite_code),
  credited_at timestamptz not null default now(),
  points integer not null check(points between 1 and 5),
  primary key (site_id,referred_person_id),
  check(inviter_person_id<>referred_person_id)
);
alter table public.ekodi_point_referral_invites enable row level security;
alter table public.ekodi_point_referral_rewards enable row level security;
revoke all on table public.ekodi_point_referral_invites,
  public.ekodi_point_referral_rewards from public, anon, authenticated, service_role;
grant select on table public.ekodi_point_referral_invites,
  public.ekodi_point_referral_rewards to service_role;

create or replace function public.ekodi_points_issue_share_invite(p_site text)
returns jsonb
language plpgsql security definer
set search_path=pg_catalog, public
as $$
declare
  v_auth uuid:=auth.uid();
  v_inviter uuid;
  v_rule public.ekodi_point_rules%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_count integer;
  v_code uuid;
begin
  if v_auth is null then raise exception 'REFERRAL_AUTH_REQUIRED';end if;
  if p_site is null or p_site !~ '^[a-z0-9_-]{2,64}$' then
    raise exception 'INVALID_REFERRAL_SITE';
  end if;
  v_inviter:=ekodi_points_private.resolve_person_for_auth(v_auth);
  if v_inviter is null then raise exception 'REFERRAL_IDENTITY_NOT_LINKED';end if;
  if not exists(select 1 from public.ekodi_point_sites
    where site_id=p_site and enabled) then raise exception 'REFERRAL_SITE_DISABLED';end if;
  select * into v_rule from public.ekodi_point_rules
    where site_id=p_site and rule_id='referral' and enabled;
  if not found then raise exception 'REFERRAL_RULE_DISABLED';end if;
  if v_rule.points not between 1 and 5
     or v_rule.daily_cap>25 or v_rule.daily_events>5 then
    raise exception 'REFERRAL_RULE_RISK_LIMIT';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('referral-issue:'||p_site||':'||v_inviter::text,0));
  v_start:=((now() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul');
  v_end:=v_start+interval '1 day';
  select count(*) into v_count from public.ekodi_point_referral_invites
    where site_id=p_site and inviter_person_id=v_inviter
      and issued_at>=v_start and issued_at<v_end;
  if v_count>=3 then raise exception 'REFERRAL_INVITE_DAILY_LIMIT';end if;
  insert into public.ekodi_point_referral_invites(site_id,inviter_person_id)
    values(p_site,v_inviter) returning invite_code into v_code;
  return jsonb_build_object('invite_code',v_code,'site_id',p_site,
    'rewarded',false,'reason','SHARE_LINK_ISSUED_NOT_CONFIRMED');
end;
$$;
revoke all on function public.ekodi_points_issue_share_invite(text)
 from public, anon, authenticated;
grant execute on function public.ekodi_points_issue_share_invite(text)
 to authenticated;

create or replace function public.ekodi_points_confirm_shared_signup(p_code uuid)
returns jsonb
language plpgsql security definer
set search_path=pg_catalog, public
as $$
declare
  v_auth uuid:=auth.uid();
  v_person uuid;
  v_invite public.ekodi_point_referral_invites%rowtype;
  v_rule public.ekodi_point_rules%rowtype;
  v_created timestamptz;
  v_verified boolean;
  v_existing uuid;
  v_result jsonb;
  v_key text;
begin
  if v_auth is null then raise exception 'REFERRAL_AUTH_REQUIRED';end if;
  if p_code is null then raise exception 'INVALID_REFERRAL_CODE';end if;
  v_person:=ekodi_points_private.resolve_person_for_auth(v_auth);
  if v_person is null then raise exception 'REFERRAL_IDENTITY_NOT_LINKED';end if;
  select i.* into v_invite from public.ekodi_point_referral_invites i
    where i.invite_code=p_code for update;
  if not found then raise exception 'REFERRAL_INVITE_NOT_FOUND';end if;
  if now()>v_invite.expires_at then raise exception 'REFERRAL_INVITE_EXPIRED';end if;
  if v_person=v_invite.inviter_person_id then raise exception 'REFERRAL_SELF_FORBIDDEN';end if;

  -- Link clicks and share sheet opens do not qualify. An independently
  -- confirmed auth user and genuinely new EKODI Person are required.
  select (u.confirmed_at is not null or u.email_confirmed_at is not null
          or u.phone_confirmed_at is not null) into v_verified
    from auth.users u where u.id=v_auth;
  if v_verified is distinct from true then raise exception 'REFERRAL_LOGIN_UNCONFIRMED';end if;
  select pe.created_at into v_created from public.people pe
    where pe.id=v_person and pe.status='active';
  if v_created is null or v_created<v_invite.issued_at
     or v_created>now()
     or v_created<now()-interval '7 days' then
    raise exception 'REFERRAL_NOT_NEW_MEMBER';
  end if;
  if not exists(select 1 from public.ekodi_point_sites
     where site_id=v_invite.site_id and enabled) then
    raise exception 'REFERRAL_SITE_DISABLED';
  end if;
  select * into v_rule from public.ekodi_point_rules
    where site_id=v_invite.site_id and rule_id='referral' and enabled;
  if not found then raise exception 'REFERRAL_RULE_DISABLED';end if;
  if v_rule.points not between 1 and 5
     or v_rule.daily_cap>25 or v_rule.daily_events>5 then
    raise exception 'REFERRAL_RULE_RISK_LIMIT';
  end if;
  -- Every referred canonical Person may credit one inviter per site,
  -- even when different login methods or invitation codes are attempted.
  perform pg_advisory_xact_lock(hashtextextended(
    'referral-claim:'||v_invite.site_id||':'||v_person::text,0));
  select inviter_person_id into v_existing from public.ekodi_point_referral_rewards
    where site_id=v_invite.site_id and referred_person_id=v_person;
  if v_existing is not null then
    return jsonb_build_object('confirmed',false,'reason','ALREADY_CREDITED');
  end if;
  v_key:='referral:'||v_invite.site_id||':'||v_person::text;
  v_result:=ekodi_points_private.award_activity(
    v_invite.site_id,v_invite.inviter_person_id,'referral',v_key,
    jsonb_build_object('source','verified_new_member',
      'share_attempt_is_not_evidence',true,
      'invite_code',v_invite.invite_code,
      'referred_person_id',v_person));
  if v_result->>'awarded'<>'true' then
    -- Do not mark a referral as paid when cap or idempotency blocks it.
    return jsonb_build_object('confirmed',false,
      'reason',coalesce(v_result->>'reason','NOT_AWARDED'));
  end if;
  insert into public.ekodi_point_referral_rewards
    (site_id,referred_person_id,inviter_person_id,invite_code,points)
    values(v_invite.site_id,v_person,v_invite.inviter_person_id,
           v_invite.invite_code,v_rule.points);
  -- Referred member never receives the inviter's private wallet balance.
  return jsonb_build_object('confirmed',true,'inviter_rewarded',true,
    'reason','VERIFIED_NEW_MEMBER');
end;
$$;
revoke all on function public.ekodi_points_confirm_shared_signup(uuid)
  from public, anon, authenticated;
grant execute on function public.ekodi_points_confirm_shared_signup(uuid)
  to authenticated;
