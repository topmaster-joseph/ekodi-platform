-- Consent receipts record WHICH optional consents were given, not only that an
-- action happened. Religion/faith data is sensitive information (PIPA Art. 23), so
-- the separate consent must be provable per receipt. Columns are nullable so the
-- currently deployed singles-api (which does not send them yet) keeps working;
-- receipts written before this migration stay NULL (= not recorded).
alter table public.singles_consent_receipts
 add column if not exists religion_consent boolean,
 add column if not exists marriage_opt_in boolean;
alter table public.singles_consent_receipts drop constraint if exists singles_consent_receipts_marriage_needs_religion;
alter table public.singles_consent_receipts add constraint singles_consent_receipts_marriage_needs_religion
 check (marriage_opt_in is not true or religion_consent is true);

-- Withdrawal receipts now state explicitly that no optional consent remains.
create or replace function public.singles_withdraw_member(p_user uuid,p_version text)
 returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare closed_interests int; cancelled_rsvps int;
begin
 if p_user is null or p_version is null or char_length(p_version)>80
 then raise exception 'invalid_withdrawal' using errcode='22023'; end if;
 update public.singles_memberships set status='withdrawn',discoverable=false,marriage_opt_in=false,
   religion_consent=false,base_consent=false,withdrawn_at=now(),updated_at=now()
  where user_id=p_user;
 if not found then raise exception 'member_not_found' using errcode='P0002'; end if;
 update public.singles_interests set status='withdrawn',updated_at=now()
  where (from_user_id=p_user or to_user_id=p_user) and status in ('pending','accepted');
 get diagnostics closed_interests=row_count;
 update public.singles_event_rsvps set status='cancelled'
  where user_id=p_user and status in ('requested','approved');
 get diagnostics cancelled_rsvps=row_count;
 insert into public.singles_consent_receipts(user_id,action,consent_version,religion_consent,marriage_opt_in)
   values(p_user,'withdrawn',p_version,false,false);
 return jsonb_build_object('closed_interests',closed_interests,'cancelled_rsvps',cancelled_rsvps);
end $$;
revoke all on function public.singles_withdraw_member(uuid,text) from public,anon,authenticated;
grant execute on function public.singles_withdraw_member(uuid,text) to service_role;
