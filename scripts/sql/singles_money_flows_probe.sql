-- SINGLES-FLOW-001. 에코디 동행 결제·환불·청약철회·행사 흐름 회귀 검증.
-- 임시 CI 데이터베이스 전용. 전체가 하나의 rollback 트랜잭션 안에서 실행되며 합성 UUID와 .invalid 계정만 쓴다.
-- 실제 회원·주문·계좌 정보를 넣거나 바꾸지 않는다. 하나라도 어긋나면 'FAIL ...' 예외로 CI가 멈춘다.
begin;
-- 후불 구독·요청·수락·청구서·자동정리·소유자 승인(9종)
do $$
declare op uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
 r jsonb; rid uuid; ref text; ref2 text; st text; n int; pid uuid;
begin
 set local session_replication_role=replica;
 insert into public.singles_memberships(user_id,person_id,status,age_19_confirmed,base_consent,adult_verified_at) values
  (a,gen_random_uuid(),'active',true,true,now()),(b,gen_random_uuid(),'active',true,true,now()),(c,gen_random_uuid(),'active',true,true,now()),(op,gen_random_uuid(),'active',true,true,now());
 insert into public.singles_bank_operators(user_id,enabled,can_verify,can_configure) values(op,true,true,true)
  on conflict(user_id) do update set enabled=true,can_verify=true,can_configure=true;
 insert into public.singles_bank_settings(id,bank_name,account_number,account_holder,active) values(1,'케이뱅크','000-000-000000','동행검증',true)
  on conflict(id) do update set active=true,bank_name='검증은행',account_number='000-000-000000',account_holder='동행검증';
 -- 1 구독권 결제 → 유료회원(구독), 가입비 없음
 if public.singles_is_paid_member(a) then raise exception 'FAIL paid before'; end if;
 insert into public.singles_bank_orders(reference,user_id,plan_code,amount_krw,duration_days,bank_name,account_number,account_holder,status,reported_paid_at) values
  ('EDH-'||upper(replace(gen_random_uuid()::text,'-','')),a,'sub_10d',75000,10,'검증은행','000000','검증','reported_paid',now()),
  ('EDH-'||upper(replace(gen_random_uuid()::text,'-','')),b,'sub_1d',15000,1,'검증은행','000000','검증','reported_paid',now());
 perform public.singles_bank_confirm_order((select reference from public.singles_bank_orders where user_id=a),op,'verified','KB-1001');
 perform public.singles_bank_confirm_order((select reference from public.singles_bank_orders where user_id=b),op,'verified','KB-1002');
 if not public.singles_is_paid_member(a) or not public.singles_is_paid_member(b) then raise exception 'FAIL subscribed'; end if;
 if (select expires_at from public.singles_bank_grants where user_id=a and plan_code='subscription')<now()+interval '9 days' then raise exception 'FAIL 10d'; end if;
 if public.singles_is_paid_member(c) then raise exception 'FAIL c paid'; end if;
 -- 2 가격 1.5배
 if public.singles_price_quote(a,'message')<>15000 or public.singles_price_quote(a,'contact')<>150000 then raise exception 'FAIL price %/%',public.singles_price_quote(a,'message'),public.singles_price_quote(a,'contact'); end if;
 insert into public.singles_profiles(user_id,display_name,broad_region,intro,details,visibility) values
  (b,'비비','서울','안녕',jsonb_build_object('real_name','김','gender','여성','age_band','30대 초반','occupation','교사','education','대학교','hobbies','독서','looking_for','산책'),
   jsonb_build_object('broad_region',true,'intro',true,'real_name',true,'gender',true,'age_band',true,'occupation',true,'education',true,'hobbies',true,'looking_for',true));
 if public.singles_price_quote(b,'contact')<>75000 then raise exception 'FAIL disc %',public.singles_price_quote(b,'contact'); end if;
 -- 3 무료(구독 없음) 회원 c는 요청 불가 / c에게 요청 불가
 begin perform public.singles_postpaid_request_create(c,a,'message'); raise exception 'FAIL free'; exception when insufficient_privilege then null; end;
 begin perform public.singles_postpaid_request_create(a,c,'message'); raise exception 'FAIL to free'; exception when no_data_found then null; end;
 -- 4 요청 → 아무 것도 차감·보류 없음 → 수락 → 청구서 2장
 r:=public.singles_postpaid_request_create(a,b,'contact'); rid:=(r->>'request_id')::uuid;
 if (r->>'fee_krw')::int<>150000 then raise exception 'FAIL fee'; end if;
 begin perform public.singles_postpaid_request_create(a,b,'contact'); raise exception 'FAIL dup'; exception when unique_violation then null; end;
 r:=public.singles_postpaid_request_decide(b,rid,'accepted');
 if r->>'status'<>'awaiting_payment' or (r->>'fee_krw')::int<>75000 then raise exception 'FAIL accept %',r; end if;
 if (select count(*) from public.singles_request_invoices where request_id=rid and status='unpaid')<>2 then raise exception 'FAIL invoices'; end if;
 if exists(select 1 from public.singles_contact_unlocks where request_id=rid) then raise exception 'FAIL unlock early'; end if;
 -- 5 청구서 결제 주문(재요청 시 같은 주문), 한쪽 결제만으론 연결 안 됨
 ref:=public.singles_invoice_open_order(a,(select id from public.singles_request_invoices where request_id=rid and role='requester'));
 if public.singles_invoice_open_order(a,(select id from public.singles_request_invoices where request_id=rid and role='requester'))<>ref then raise exception 'FAIL same order'; end if;
 begin perform public.singles_invoice_open_order(b,(select id from public.singles_request_invoices where request_id=rid and role='requester')); raise exception 'FAIL other inv'; exception when no_data_found then null; end;
 if (select amount_krw from public.singles_bank_orders where reference=ref)<>150000 then raise exception 'FAIL order amt'; end if;
 update public.singles_bank_orders set status='reported_paid',reported_paid_at=now() where reference=ref;
 perform public.singles_bank_confirm_order(ref,op,'verified','KB-2001');
 if (select status from public.singles_paid_requests where id=rid)<>'awaiting_payment' then raise exception 'FAIL half'; end if;
 ref2:=public.singles_invoice_open_order(b,(select id from public.singles_request_invoices where request_id=rid and role='responder'));
 update public.singles_bank_orders set status='reported_paid',reported_paid_at=now() where reference=ref2;
 perform public.singles_bank_confirm_order(ref2,op,'verified','KB-2002');
 if (select status from public.singles_paid_requests where id=rid)<>'connected' then raise exception 'FAIL connect'; end if;
 if not exists(select 1 from public.singles_contact_unlocks where request_id=rid) then raise exception 'FAIL unlock'; end if;
 if not exists(select 1 from public.singles_interests where status='accepted' and (from_user_id=a or to_user_id=a)) then raise exception 'FAIL interest'; end if;
 -- 6 미결제 7일 → 취소, 결제된 쪽 환불 대상
 delete from public.singles_contact_unlocks where request_id=rid; delete from public.singles_interests where from_user_id in (a,b) or to_user_id in (a,b);
 r:=public.singles_postpaid_request_create(b,a,'message'); rid:=(r->>'request_id')::uuid;
 perform public.singles_postpaid_request_decide(a,rid,'accepted');
 ref:=public.singles_invoice_open_order(b,(select id from public.singles_request_invoices where request_id=rid and role='requester'));
 update public.singles_bank_orders set status='reported_paid',reported_paid_at=now() where reference=ref;
 perform public.singles_bank_confirm_order(ref,op,'verified','KB-3001');
 update public.singles_request_invoices set due_at=now()-interval '1 minute' where request_id=rid;
 r:=public.singles_daily_ops();
 if (r->'housekeeping'->>'lapsed')::int<1 then raise exception 'FAIL lapse %',r; end if;
 if (select status from public.singles_paid_requests where id=rid)<>'lapsed' then raise exception 'FAIL lapsed'; end if;
 if (select status from public.singles_request_invoices where request_id=rid and role='requester')<>'refund_due' then raise exception 'FAIL refund_due'; end if;
 if (select status from public.singles_request_invoices where request_id=rid and role='responder')<>'void' then raise exception 'FAIL void'; end if;
 -- 7 거절은 무료, 청구서 없음
 r:=public.singles_postpaid_request_create(a,b,'message'); rid:=(r->>'request_id')::uuid;
 perform public.singles_postpaid_request_decide(b,rid,'declined');
 if exists(select 1 from public.singles_request_invoices where request_id=rid) then raise exception 'FAIL decline inv'; end if;
 -- 8 운영 제안: 낮은 수락률 → 가격 제안, 소유자만 승인, 승인 시 적용
 insert into public.singles_paid_requests(requester_id,responder_id,kind,requester_fee_krw,billing_mode,status,decided_at)
  select a,b,'contact',150000,'postpaid','declined',now() from generate_series(1,12);
 perform public.singles_ops_review();
 select id into pid from public.singles_ops_proposals where rule='low_acceptance' and status='proposed';
 if pid is null then raise exception 'FAIL no proposal'; end if;
 perform public.singles_ops_review();
 if (select count(*) from public.singles_ops_proposals where rule='low_acceptance' and status='proposed')<>1 then raise exception 'FAIL dup proposal'; end if;
 begin perform public.singles_ops_decide(a,pid,'approved'); raise exception 'FAIL nonowner'; exception when insufficient_privilege then null; end;
 if public.singles_ops_decide(op,pid,'approved')<>'applied' then raise exception 'FAIL apply'; end if;
 if (select max_discount_pct from public.singles_price_rules where kind='contact')<>60 then raise exception 'FAIL applied value'; end if;
 -- 9 탈퇴 시 대기 요청 정리
 r:=public.singles_postpaid_request_create(a,b,'message'); rid:=(r->>'request_id')::uuid;
 perform public.singles_withdraw_member(b,'v');
 if (select status from public.singles_paid_requests where id=rid)<>'withdrawn' then raise exception 'FAIL withdraw'; end if;
 raise notice 'SINGLES-FLOW PASS: all_ok';
end $$;

-- H3 청구서 환불 송금 기록(10종)
do $$
declare op uuid:=gen_random_uuid(); op2 uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
 r jsonb; rid uuid; ref text; inv uuid;
begin
 set local session_replication_role=replica;
 insert into public.singles_memberships(user_id,person_id,status,age_19_confirmed,base_consent,adult_verified_at) values
  (a,gen_random_uuid(),'active',true,true,now()),(b,gen_random_uuid(),'active',true,true,now()),(op,gen_random_uuid(),'active',true,true,now()),(op2,gen_random_uuid(),'active',true,true,now());
 insert into public.singles_bank_operators(user_id,enabled,can_verify,can_configure) values(op,true,true,true),(op2,true,false,false)
  on conflict(user_id) do update set enabled=excluded.enabled,can_verify=excluded.can_verify,can_configure=excluded.can_configure;
 insert into public.singles_bank_settings(id,bank_name,account_number,account_holder,active) values(1,'케이뱅크','000-000-000000','동행검증',true)
  on conflict(id) do update set active=true;
 insert into public.singles_bank_orders(reference,user_id,plan_code,amount_krw,duration_days,bank_name,account_number,account_holder,status,reported_paid_at) values
  ('EDH-'||upper(replace(gen_random_uuid()::text,'-','')),a,'sub_1d',15000,1,'검증은행','000000','검증','reported_paid',now()),
  ('EDH-'||upper(replace(gen_random_uuid()::text,'-','')),b,'sub_1d',15000,1,'검증은행','000000','검증','reported_paid',now());
 perform public.singles_bank_confirm_order(o.reference,op,'verified','KB-'||left(o.reference,12)) from public.singles_bank_orders o where o.user_id in (a,b);
 -- 수락 → 요청자만 결제 → 7일 경과 → 환불 대상
 r:=public.singles_postpaid_request_create(a,b,'message'); rid:=(r->>'request_id')::uuid;
 perform public.singles_postpaid_request_decide(b,rid,'accepted');
 select id into inv from public.singles_request_invoices where request_id=rid and role='requester';
 ref:=public.singles_invoice_open_order(a,inv);
 update public.singles_bank_orders set status='reported_paid',reported_paid_at=now() where reference=ref;
 perform public.singles_bank_confirm_order(ref,op,'verified','KB-PAY-0001');
 update public.singles_request_invoices set due_at=now()-interval '1 minute' where request_id=rid;
 perform public.singles_daily_ops();
 if (select status from public.singles_request_invoices where id=inv)<>'refund_due' then raise exception 'FAIL due'; end if;
 if (select refund_due_at from public.singles_request_invoices where id=inv) is null then raise exception 'FAIL stamp'; end if;
 -- 권한 없는 운영자·본인·거래번호 누락은 거부
 begin perform public.singles_invoice_refund_complete(op2,inv,'KB-RF-0001'); raise exception 'FAIL noverify'; exception when insufficient_privilege then null; end;
 begin perform public.singles_invoice_refund_complete(a,inv,'KB-RF-0001'); raise exception 'FAIL member'; exception when insufficient_privilege then null; end;
 begin perform public.singles_invoice_refund_complete(op,inv,'  '); raise exception 'FAIL trace'; exception when invalid_parameter_value then null; end;
 -- 미결제(void) 청구서는 환불 불가
 begin perform public.singles_invoice_refund_complete(op,(select id from public.singles_request_invoices where request_id=rid and role='responder'),'KB-RF-0009'); raise exception 'FAIL void'; exception when invalid_parameter_value then null; end;
 -- 정상 처리 + 재처리(같은 번호)는 결과만, 다른 번호는 거부
 r:=public.singles_invoice_refund_complete(op,inv,'KB-RF-0001');
 if r->>'status'<>'refunded' or (r->>'already')::boolean then raise exception 'FAIL ok %',r; end if;
 r:=public.singles_invoice_refund_complete(op,inv,'KB-RF-0001'); if not (r->>'already')::boolean then raise exception 'FAIL idem'; end if;
 begin perform public.singles_invoice_refund_complete(op,inv,'KB-RF-0002'); raise exception 'FAIL re'; exception when unique_violation then null; end;
 if (select status from public.singles_paid_requests where id=rid)<>'lapsed' then raise exception 'FAIL req'; end if;
 -- 직접 수정으로 거래번호 없이 환불완료 처리 불가
 begin update public.singles_request_invoices set status='refunded',refund_trace=null where request_id=rid and role='responder'; raise exception 'FAIL direct'; exception when check_violation then null; end;
 -- 운영자 자신의 청구서는 처리 불가
 update public.singles_request_invoices set user_id=op,status='refund_due' where request_id=rid and role='responder';
 begin perform public.singles_invoice_refund_complete(op,(select id from public.singles_request_invoices where request_id=rid and role='responder'),'KB-RF-0003'); raise exception 'FAIL self'; exception when insufficient_privilege then null; end;
 raise notice 'SINGLES-FLOW PASS: refund_ok';
end $$;

-- H6 구독권 청약철회(14종)
do $$
declare op uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
 r jsonb; ra text; ra2 text; rb text; rc text; rid uuid; e jsonb;
 mk text:='EDH-'; 
begin
 set local session_replication_role=replica;
 insert into public.singles_memberships(user_id,person_id,status,age_19_confirmed,base_consent,adult_verified_at) values
  (a,gen_random_uuid(),'active',true,true,now()),(b,gen_random_uuid(),'active',true,true,now()),(c,gen_random_uuid(),'active',true,true,now()),(op,gen_random_uuid(),'active',true,true,now());
 insert into public.singles_bank_operators(user_id,enabled,can_verify,can_configure) values(op,true,true,true)
  on conflict(user_id) do update set enabled=true,can_verify=true;
 ra:=mk||upper(replace(gen_random_uuid()::text,'-',''));rb:=mk||upper(replace(gen_random_uuid()::text,'-',''));rc:=mk||upper(replace(gen_random_uuid()::text,'-',''));
 insert into public.singles_bank_orders(reference,user_id,plan_code,amount_krw,duration_days,bank_name,account_number,account_holder,status,reported_paid_at) values
  (ra,a,'sub_10d',75000,10,'검증은행','000000','검증','reported_paid',now()),(rb,b,'sub_1d',15000,1,'검증은행','000000','검증','reported_paid',now()),(rc,c,'sub_10d',75000,10,'검증은행','000000','검증','reported_paid',now());
 perform public.singles_bank_confirm_order(ra,op,'verified','KB-A-0001');
 perform public.singles_bank_confirm_order(rb,op,'verified','KB-B-0001');
 perform public.singles_bank_confirm_order(rc,op,'verified','KB-C-0001');
 -- a: 미사용 → 철회 가능
 e:=public.singles_subscription_withdrawal_eval(a,ra); if not (e->>'eligible')::boolean then raise exception 'FAIL a eligible %',e; end if;
 -- b: 요청 보냄(사용) → 불가
 r:=public.singles_postpaid_request_create(b,c,'message');
 if public.singles_subscription_withdrawal_eval(b,rb)->>'reason'<>'already_used' then raise exception 'FAIL b used'; end if;
 -- c: 요청을 받기만 함(미사용) → 가능, 거절하면 사용
 if not (public.singles_subscription_withdrawal_eval(c,rc)->>'eligible')::boolean then raise exception 'FAIL c recv'; end if;
 perform public.singles_postpaid_request_decide(c,(r->>'request_id')::uuid,'declined');
 if public.singles_subscription_withdrawal_eval(c,rc)->>'reason'<>'already_used' then raise exception 'FAIL c decided'; end if;
 -- 남의 주문 철회 불가
 begin perform public.singles_subscription_withdraw(b,ra); raise exception 'FAIL other'; exception when no_data_found then null; end;
 begin perform public.singles_subscription_withdraw(b,rb); raise exception 'FAIL used withdraw'; exception when invalid_parameter_value then null; end;
 -- a 연장 구매 후: 이전 주문은 불가, 최신만 가능
 ra2:=mk||upper(replace(gen_random_uuid()::text,'-',''));
 insert into public.singles_bank_orders(reference,user_id,plan_code,amount_krw,duration_days,bank_name,account_number,account_holder,status,reported_paid_at) values(ra2,a,'sub_1d',15000,1,'검증은행','000000','검증','reported_paid',now());
 perform public.singles_bank_confirm_order(ra2,op,'verified','KB-A-0002');
 if public.singles_subscription_withdrawal_eval(a,ra)->>'reason'<>'newer_subscription_exists' then raise exception 'FAIL newer'; end if;
 r:=public.singles_subscription_withdraw(a,ra2);
 if (r->>'amount_krw')::int<>15000 then raise exception 'FAIL amt'; end if;
 if (select expires_at from public.singles_bank_grants where user_id=a and plan_code='subscription') > now()+interval '10 days' then raise exception 'FAIL revoke'; end if;
 if not public.singles_is_paid_member(a) then raise exception 'FAIL still 10d'; end if;
 begin perform public.singles_subscription_withdraw(a,ra2); raise exception 'FAIL twice'; exception when invalid_parameter_value then null; end;
 -- 7일 경과는 불가
 update public.singles_bank_orders set verified_at=now()-interval '8 days' where reference=rc;
 delete from public.singles_paid_requests where requester_id=b;
 if public.singles_subscription_withdrawal_eval(c,rc)->>'reason'<>'withdrawal_period_over' then raise exception 'FAIL 7d %',public.singles_subscription_withdrawal_eval(c,rc); end if;
 -- 1일권 a의 원래 10일권: 연장분 철회 뒤에는 다시 최신이 아님(last_order_reference=ra2) → 불가
 if public.singles_subscription_withdrawal_eval(a,ra)->>'reason'<>'newer_subscription_exists' then raise exception 'FAIL after'; end if;
 -- 운영자 송금 기록
 begin perform public.singles_order_refund_complete(a,ra2,'KB-RF-1'||'000'); raise exception 'FAIL member op'; exception when insufficient_privilege then null; end;
 r:=public.singles_order_refund_complete(op,ra2,'KB-RF-1000');
 if r->>'status'<>'refunded' then raise exception 'FAIL done'; end if;
 if not (public.singles_order_refund_complete(op,ra2,'KB-RF-1000')->>'already')::boolean then raise exception 'FAIL idem'; end if;
 -- 1일권만 산 회원 철회 → 유료회원 해제
 delete from public.singles_paid_requests where responder_id=c or requester_id=c;
 update public.singles_bank_orders set verified_at=now() where reference=rc;
 r:=public.singles_subscription_withdraw(c,rc);
 if public.singles_is_paid_member(c) then raise exception 'FAIL c still paid'; end if;
 -- 거래번호는 두 종류 환불 사이에서도 중복 불가
 begin perform public.singles_order_refund_complete(op,rc,'KB-RF-1000'); raise exception 'FAIL dup'; exception when unique_violation then null; end;
 raise notice 'SINGLES-FLOW PASS: withdraw_ok';
end $$;

-- 행사·모임 정원·초대 상한(12종)
do $$
declare op uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); ev uuid; gr uuid; r jsonb; i int;
begin
 set local session_replication_role=replica;
 insert into auth.users(id,email) values(op,'owner@singles-ci.invalid'),(a,'a@singles-ci.invalid'),(b,'B@singles-ci.invalid'),(c,'c@singles-ci.invalid');
 insert into public.singles_memberships(user_id,person_id,status,age_19_confirmed,base_consent,adult_verified_at) values
  (a,gen_random_uuid(),'active',true,true,now()),(b,gen_random_uuid(),'active',true,true,now()),(c,gen_random_uuid(),'active',true,true,now());
 insert into public.singles_bank_operators(user_id,enabled,can_verify,can_configure) values(op,true,true,true),(a,true,true,false)
  on conflict(user_id) do update set enabled=excluded.enabled,can_configure=excluded.can_configure;
 -- 초대: 소유자만, 대소문자 무시, 상한
 begin perform public.singles_invite_add(a,'b@singles-ci.invalid',''); raise exception 'FAIL nonowner'; exception when insufficient_privilege then null; end;
 begin perform public.singles_invite_add(op,'none@singles-ci.invalid',''); raise exception 'FAIL noacct'; exception when no_data_found then null; end;
 begin perform public.singles_invite_add(op,'bad',''); raise exception 'FAIL bad'; exception when invalid_parameter_value then null; end;
 update public.singles_launch_stage set invite_cap=(select count(*) from public.singles_pilot_users where kind='invite')+1;
 r:=public.singles_invite_add(op,' b@singles-ci.INVALID ','교회 청년'); if r->>'status'<>'invited' then raise exception 'FAIL inv %',r; end if;
 if (public.singles_invite_add(op,'b@singles-ci.invalid',''))->>'status'<>'already_invited' then raise exception 'FAIL dup'; end if;
 begin perform public.singles_invite_add(op,'c@singles-ci.invalid',''); raise exception 'FAIL cap'; exception when check_violation then null; end;
 perform public.singles_invite_remove(op,b);
 r:=public.singles_invite_add(op,'c@singles-ci.invalid',''); if r->>'status'<>'invited' then raise exception 'FAIL after remove'; end if;
 -- 행사: 정원 2
 insert into public.singles_events(host_user_id,title,summary,region,starts_at,capacity,state,kind) values(op,'가을 산책 모임','',
  '전남광주',now()+interval '3 days',2,'published','event') returning id into ev;
 insert into public.singles_events(host_user_id,title,summary,region,starts_at,capacity,state,kind,schedule_note) values(op,'토요 말씀 나눔','',
  '전남광주',now()-interval '30 days',null,'published','group','매주 토요일 오후 3시') returning id into gr;
 r:=public.singles_event_rsvp(a,ev); r:=public.singles_event_rsvp(b,ev);
 if (public.singles_event_rsvp(a,ev)->>'already')::boolean is not true then raise exception 'FAIL idem'; end if;
 begin perform public.singles_event_rsvp(c,ev); raise exception 'FAIL full'; exception when check_violation then null; end;
 perform public.singles_event_rsvp_cancel(b,ev);
 r:=public.singles_event_rsvp(c,ev); if r->>'status'<>'requested' then raise exception 'FAIL after cancel'; end if;
 -- 모임은 시작일이 지나도 신청 가능, 정원 없음
 r:=public.singles_event_rsvp(c,gr); if r->>'status'<>'requested' then raise exception 'FAIL group'; end if;
 -- 지난 행사 거부(유료 행사는 아래 별도 시나리오)
 update public.singles_events set starts_at=now()-interval '1 hour' where id=ev;
 begin perform public.singles_event_rsvp(b,ev); raise exception 'FAIL past'; exception when no_data_found then null; end;
 raise notice 'SINGLES-FLOW PASS: events_ok';
end $$;

-- 유료 행사·모임: 자리 확보·주문·입금 확인·기한 만료·24시간 전 취소 환불·행사 취소 환불·늦은 입금 환불(12종)
do $$
declare op uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
 ev uuid; ev2 uuid; r jsonb; ref text; refb text;
begin
 set local session_replication_role=replica;
 insert into public.singles_memberships(user_id,person_id,status,age_19_confirmed,base_consent,adult_verified_at) values
  (a,gen_random_uuid(),'active',true,true,now()),(b,gen_random_uuid(),'active',true,true,now()),(c,gen_random_uuid(),'active',true,true,now());
 insert into public.singles_bank_operators(user_id,enabled,can_verify,can_configure) values(op,true,true,true)
  on conflict(user_id) do update set enabled=true,can_verify=true,can_configure=true;
 insert into public.singles_bank_settings(id,bank_name,account_number,account_holder,active) values(1,'검증은행','000-000-000000','동행검증',true)
  on conflict(id) do update set active=true,bank_name='검증은행',account_number='000-000-000000',account_holder='동행검증';
 insert into public.singles_events(host_user_id,title,region,starts_at,capacity,state,kind,fee_krw) values(op,'유료 행사','전남광주',now()+interval '5 days',2,'published','event',20000) returning id into ev;
 -- a: 신청 → 결제 대기 + 주문 2만원, 다시 눌러도 같은 주문
 r:=public.singles_event_rsvp(a,ev); ref:=r->>'order_reference';
 if r->>'status'<>'pending_payment' or (select amount_krw from public.singles_bank_orders where reference=ref)<>20000 then raise exception 'FAIL a %',r; end if;
 if public.singles_event_rsvp(a,ev)->>'order_reference'<>ref then raise exception 'FAIL same order'; end if;
 -- b 신청 → 정원 2 다 참(결제 대기도 자리 차지), c 거부
 r:=public.singles_event_rsvp(b,ev); refb:=r->>'order_reference';
 begin perform public.singles_event_rsvp(c,ev); raise exception 'FAIL full'; exception when check_violation then null; end;
 -- a 입금 신고 → 운영자 확인 → 신청 완료
 update public.singles_bank_orders set status='reported_paid',reported_paid_at=now() where reference=ref;
 perform public.singles_bank_confirm_order(ref,op,'verified','EV-PAY-0001');
 if (select status||'/'||(paid_at is not null)::text from public.singles_event_rsvps where order_reference=ref)<>'requested/true' then raise exception 'FAIL paid'; end if;
 -- b 결제 기한 지남 → 자동 취소, 자리 반환, 주문 취소
 update public.singles_event_rsvps set pay_due_at=now()-interval '1 minute' where order_reference=refb;
 r:=public.singles_daily_ops(); if (r->>'event_payments_expired')::int<1 then raise exception 'FAIL expire %',r; end if;
 if (select status from public.singles_bank_orders where reference=refb)<>'cancelled' then raise exception 'FAIL order cancel'; end if;
 r:=public.singles_event_rsvp(c,ev); if r->>'status'<>'pending_payment' then raise exception 'FAIL seat back'; end if;
 -- a 24시간 전 취소 → 전액 환불 대상
 r:=public.singles_event_rsvp_cancel(a,ev); if (r->>'refund_krw')::int<>20000 then raise exception 'FAIL refund %',r; end if;
 if not exists(select 1 from public.singles_order_refunds where reference=ref and reason='event_cancel' and amount_krw=20000) then raise exception 'FAIL refund row'; end if;
 -- 운영자 행사 취소 → c(결제 완료) 전액 환불, 결제 대기 주문 취소
 refb:=(select order_reference from public.singles_event_rsvps where event_id=ev and user_id=c);
 update public.singles_bank_orders set status='reported_paid',reported_paid_at=now() where reference=refb;
 perform public.singles_bank_confirm_order(refb,op,'verified','EV-PAY-0002');
 begin perform public.singles_event_cancel(a,ev); raise exception 'FAIL nonowner'; exception when insufficient_privilege then null; end;
 r:=public.singles_event_cancel(op,ev); if (r->>'refunds')::int<>1 or (r->>'refund_krw')::int<>20000 then raise exception 'FAIL cancel %',r; end if;
 -- 24시간 이내 취소는 환불 없음
 insert into public.singles_events(host_user_id,title,region,starts_at,state,kind,fee_krw) values(op,'임박 행사','서울',now()+interval '10 hours','published','event',10000) returning id into ev2;
 r:=public.singles_event_rsvp(b,ev2); ref:=r->>'order_reference';
 update public.singles_bank_orders set status='reported_paid',reported_paid_at=now() where reference=ref;
 perform public.singles_bank_confirm_order(ref,op,'verified','EV-PAY-0003');
 r:=public.singles_event_rsvp_cancel(b,ev2); if (r->>'refund_krw')::int<>0 then raise exception 'FAIL late refund'; end if;
 -- 만료 뒤 들어온 입금 → 전액 환불 대상
 r:=public.singles_event_rsvp(a,ev2); ref:=r->>'order_reference';
 update public.singles_event_rsvps set pay_due_at=now()-interval '1 minute' where order_reference=ref; perform public.singles_event_payment_housekeeping();
 update public.singles_bank_orders set status='reported_paid',reported_paid_at=now() where reference=ref;
 perform public.singles_bank_confirm_order(ref,op,'verified','EV-PAY-0004');
 if not exists(select 1 from public.singles_order_refunds where reference=ref and reason='event_unavailable') then raise exception 'FAIL late pay refund'; end if;
 -- 환불 송금 기록은 기존 운영자 기능으로
 r:=public.singles_order_refund_complete(op,ref,'EV-RF-0001'); if r->>'status'<>'refunded' then raise exception 'FAIL refund complete'; end if;
 raise notice 'SINGLES-FLOW PASS: paid_events_ok';
end $$;
rollback;
