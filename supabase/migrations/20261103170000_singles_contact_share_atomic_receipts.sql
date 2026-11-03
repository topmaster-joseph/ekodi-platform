-- EKODI Singles: one-to-one contact sharing requires an atomic, independent consent receipt.
-- Security additive only: public paid enrollment and identity-provider rollout remain unchanged.
-- The receipt carries no phone number, e-mail address, IP, or unneeded profile details.
create table if not exists public.singles_contact_share_receipts(
 id uuid primary key default gen_random_uuid(),
 message_id uuid not null unique references public.singles_messages(id) on delete cascade,
 interest_id uuid not null references public.singles_interests(id) on delete cascade,
 request_id uuid not null references public.singles_paid_requests(id) on delete cascade,
 sender_id uuid not null references public.singles_memberships(user_id) on delete cascade,
 recipient_id uuid not null references public.singles_memberships(user_id) on delete cascade,
 consent_version text not null check (consent_version='singles-contact-v1-20261103'),
 purpose text not null default 'member-initiated-one-to-one-contact-exchange'
  check (purpose='member-initiated-one-to-one-contact-exchange'),
 consented_at timestamptz not null default now(),
 check(sender_id<>recipient_id)
);
create index if not exists singles_contact_share_receipts_interest
 on public.singles_contact_share_receipts(interest_id,consented_at desc);
comment on table public.singles_contact_share_receipts is
 'Append-only proof of explicit one-to-one contact consent; no raw contact. Account/thread erasure cascades through linked source records.';
alter table public.singles_contact_share_receipts enable row level security;
revoke all on table public.singles_contact_share_receipts from public,anon,authenticated,service_role;
grant select,insert on table public.singles_contact_share_receipts to service_role;

-- Service-role-only transactional boundary. Neither a message nor a receipt exists
-- when one of the verified membership, current pairing, payment, or consent checks fails.
-- A row lock on both invoices serializes contact release with any concurrent refund.
create or replace function public.singles_contact_share_record(
 p_interest uuid,p_sender uuid,p_contact text,p_consent_version text
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 v_interest public.singles_interests%rowtype;
 v_request public.singles_paid_requests%rowtype;
 v_invoice public.singles_request_invoices%rowtype;
 v_recipient uuid;
 v_request_id uuid;
 v_contact text:=btrim(coalesce(p_contact,''));
 v_message_id uuid;
 seen_requester boolean:=false;
 seen_responder boolean:=false;
 count_invoices integer:=0;
begin
 if p_consent_version is distinct from 'singles-contact-v1-20261103' then
  raise exception 'contact_share_consent_required' using errcode='22023';
 end if;
 if char_length(v_contact) not between 5 and 100 or not (
   v_contact ~ '^([+]?82[-. ]?)?0?1[016789][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}$'
   or v_contact ~* '^[^[:space:]@]{1,64}@[A-Za-z0-9.-]+[.][A-Za-z]{2,}$'
 ) then raise exception 'invalid_contact' using errcode='22023'; end if;
 select * into v_interest from public.singles_interests where id=p_interest for update;
 if not found or v_interest.status<>'accepted' or
  p_sender not in (v_interest.from_user_id,v_interest.to_user_id) then
  raise exception 'mutual_consent_required' using errcode='42501';
 end if;
 v_recipient:=case when v_interest.from_user_id=p_sender
  then v_interest.to_user_id else v_interest.from_user_id end;
 if not exists(select 1 from public.singles_memberships
   where user_id=p_sender and status='active' and base_consent=true
    and age_19_confirmed=true and adult_verified_at is not null)
 or not exists(select 1 from public.singles_memberships
   where user_id=v_recipient and status='active' and base_consent=true
    and age_19_confirmed=true and adult_verified_at is not null) then
  raise exception 'member_unavailable' using errcode='42501';
 end if;
 if exists(select 1 from public.singles_blocks
  where (blocker_id=p_sender and blocked_id=v_recipient)
     or (blocker_id=v_recipient and blocked_id=p_sender)) then
  raise exception 'blocked' using errcode='42501';
 end if;
 select request_id into v_request_id from public.singles_contact_unlocks
  where user_low=least(p_sender,v_recipient)
    and user_high=greatest(p_sender,v_recipient) for update;
 if v_request_id is null then
  raise exception 'contact_exchange_not_completed' using errcode='42501';
 end if;
 select * into v_request from public.singles_paid_requests
  where id=v_request_id for update;
 if not found or v_request.status<>'connected' or v_request.kind<>'contact'
  or v_request.billing_mode<>'postpaid' or v_request.interest_id is distinct from p_interest
  or not (
    (v_request.requester_id=p_sender and v_request.responder_id=v_recipient)
    or (v_request.responder_id=p_sender and v_request.requester_id=v_recipient)
  ) then
  raise exception 'contact_exchange_not_completed' using errcode='42501';
 end if;
 for v_invoice in select * from public.singles_request_invoices
   where request_id=v_request_id order by role for update loop
  count_invoices:=count_invoices+1;
  if v_invoice.status<>'paid' or v_invoice.refund_due_at is not null
     or v_invoice.refunded_at is not null then
   raise exception 'contact_exchange_not_completed' using errcode='42501';
  end if;
  if v_invoice.role='requester' and v_invoice.user_id=v_request.requester_id then
   seen_requester:=true;
  elsif v_invoice.role='responder' and v_invoice.user_id=v_request.responder_id then
   seen_responder:=true;
  else
   raise exception 'contact_exchange_not_completed' using errcode='42501';
  end if;
 end loop;
 if count_invoices<>2 or not seen_requester or not seen_responder then
  raise exception 'contact_exchange_not_completed' using errcode='42501';
 end if;
 insert into public.singles_messages(interest_id,sender_id,body)
  values(p_interest,p_sender,'[내 연락처] '||v_contact) returning id into v_message_id;
 insert into public.singles_contact_share_receipts(
  message_id,interest_id,request_id,sender_id,recipient_id,consent_version
 ) values(v_message_id,p_interest,v_request_id,p_sender,v_recipient,p_consent_version);
 return v_message_id;
end $$;
revoke all on function public.singles_contact_share_record(uuid,uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.singles_contact_share_record(uuid,uuid,text,text) to service_role;
