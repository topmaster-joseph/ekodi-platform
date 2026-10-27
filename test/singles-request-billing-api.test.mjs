import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const bank=await readFile(new URL('../supabase/functions/singles-api/bank-transfer.ts',import.meta.url),'utf8');
const terms=await readFile(new URL('../docs/EKODI-SINGLES-TERMS-BILLING.md',import.meta.url),'utf8');
const migration=await readFile(new URL('../supabase/migrations/20261028030000_singles_paid_membership.sql',import.meta.url),'utf8');
test('paid membership: join fee once, top-up only for paid members, wallet in KRW',()=>{
  assert.match(bank,/const CODES=\['consulting','credit_initial','credit_topup'\]/);
  assert.match(bank,/join_order_already_open/);assert.match(bank,/already_paid_member/);
  assert.match(bank,/paid_membership_required',join_fee_krw:500000/);
  assert.match(bank,/singles_credit_accounts'\)\.select\('balance_krw,reserved_krw,joined_at'\)/);
  assert.match(bank,/action:'join_order'/,'join order is recorded with the Google account');
});
test('migration: join fee creates an equal KRW credit and paid status; old monthly passes stop selling',()=>{
  assert.match(migration,/amount_krw=500000,credit_krw=500000/);
  assert.match(migration,/update public\.singles_bank_plans set active=false where code in \('community','community_90','community_365'\)/);
  assert.match(migration,/paid_member_since=coalesce\(paid_member_since,now\(\)\)/);
  assert.match(migration,/\('message','메시지 교환 요청·수락',10000,10000,0\)/);
  assert.match(migration,/\('contact','연락처 교환 요청·수락',100000,10000,50\)/);
  assert.match(migration,/operator_self_verification_forbidden/);
  assert.match(migration,/singles_signup_attempts/);
});
test('terms draft states the paid model, discount framing, acceptance charging and refunds',()=>{
  for(const s of ['가입비 500,000원','같은 금액(500,000원)이 적립금','기본 요금 + 입력·공개 할인','수락하는 순간','14일','연락처 교환이 수락되기 전','결혼 상담·알선을 하지 않으며','무료회원'])assert.ok(terms.includes(s),s);
  assert.doesNotMatch(terms,/적게 입력·공개할수록 (?:높|비싸)/);
});
