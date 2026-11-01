-- EKODI referral shared-email guard (#6739, P0 follow-up).
-- 20261031000000 denied a shared identity email only when the OTHER Person's
-- identity was linked BEFORE the invite (or belonged to the inviter). Two
-- Persons created after the invite with the same mailbox (Kakao then Google,
-- for example) could each credit the inviter. Now any shared identity email
-- with a different Person denies the reward. Deny-only, never a merge.
-- Forward-only: replaces the function body, schema and grants unchanged.
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
  v_auth_created timestamptz;
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

  select (u.confirmed_at is not null or u.email_confirmed_at is not null
          or u.phone_confirmed_at is not null), u.created_at
    into v_verified, v_auth_created
    from auth.users u where u.id=v_auth;
  if v_verified is distinct from true then raise exception 'REFERRAL_LOGIN_UNCONFIRMED';end if;

  select pe.created_at into v_created from public.people pe
    where pe.id=v_person and pe.status='active';
  if v_created is null or v_created<v_invite.issued_at
     or v_created>now()
     or v_created<now()-interval '7 days' then
    raise exception 'REFERRAL_NOT_NEW_MEMBER';
  end if;
  -- The authenticating account itself must be created after the invite.
  if v_auth_created is null or v_auth_created<v_invite.issued_at then
    raise exception 'REFERRAL_NOT_NEW_MEMBER';
  end if;
  -- Every login identity (any status) of this Person, and the auth account
  -- behind it, must be newer than the invite: no relinked legacy accounts.
  if exists(
    select 1 from public.login_identities li
      join auth.users au on au.id=li.auth_user_id
     where li.person_id=v_person
       and (li.linked_at<v_invite.issued_at or au.created_at<v_invite.issued_at)
  ) then
    raise exception 'REFERRAL_NOT_NEW_MEMBER';
  end if;
  -- Any identity email this Person shares with a DIFFERENT Person (linked at
  -- any time, before or after the invite, any status) means the same mailbox
  -- already exists as another EKODI member: e.g. Kakao signup credited first,
  -- then a Google signup with the same address as a second "new" Person.
  -- Deny only; email never merges identities.
  if exists(
    select 1 from public.login_identities mine
      join public.login_identities other
        on lower(btrim(other.email))=lower(btrim(mine.email))
       and other.person_id<>v_person
     where mine.person_id=v_person
       and nullif(btrim(mine.email),'') is not null
  ) then
    raise exception 'REFERRAL_EXISTING_MEMBER';
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
  -- One inviter credit per referred canonical Person per site, across codes
  -- and login methods; concurrent claims serialize on the referred Person.
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
    return jsonb_build_object('confirmed',false,
      'reason',coalesce(v_result->>'reason','NOT_AWARDED'));
  end if;
  insert into public.ekodi_point_referral_rewards
    (site_id,referred_person_id,inviter_person_id,invite_code,points)
    values(v_invite.site_id,v_person,v_invite.inviter_person_id,
           v_invite.invite_code,v_rule.points);
  -- Referred member never receives the inviter's identity or wallet balance.
  return jsonb_build_object('confirmed',true,'inviter_rewarded',true,
    'reason','VERIFIED_NEW_MEMBER');
end;
$$;
revoke all on function public.ekodi_points_confirm_shared_signup(uuid)
  from public, anon, authenticated;
grant execute on function public.ekodi_points_confirm_shared_signup(uuid)
  to authenticated;
