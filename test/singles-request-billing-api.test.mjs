import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const bank=await readFile(new URL('../supabase/functions/singles-api/bank-transfer.ts',import.meta.url),'utf8');
const terms=await readFile(new URL('../docs/EKODI-SINGLES-TERMS-BILLING.md',import.meta.url),'utf8');
const migration=await readFile(new URL('../supabase/migrations/20261031010000_singles_postpaid_subscription.sql',import.meta.url),'utf8');
test('2026-10-31: no join fee or prepaid credit; only subscription plans are sold; invoices paid by bank order',()=>{
  assert.match(bank,/const CODES=\['consulting','sub_1d','sub_10d','sub_20d','sub_30d'\]/);
  assert.doesNotMatch(bank,/initial_credit_required|already_paid_member/);
  assert.match(bank,/singles_invoice_open_order/);
  assert.match(bank,/action:'subscribe_order'/,'subscription order is recorded with the Google account');
});
test('migration: subscription prices x1.5, request prices x1.5, credit sales stopped, postpaid invoices, daily automation',()=>{
  for(const s of ["('sub_1d','동행 구독권 1일',15000,1,true)","('sub_10d','동행 구독권 10일',75000,10,true)","('sub_20d','동행 구독권 20일',120000,20,true)","('sub_30d','동행 구독권 1달(30일)',150000,30,true)"])assert.ok(migration.includes(s),s);
  assert.match(migration,/update public\.singles_bank_plans set active=false where code in \('credit_initial','credit_topup'\)/);
  assert.match(migration,/standard_krw=15000,floor_krw=15000,max_discount_pct=0/);
  assert.match(migration,/standard_krw=150000,floor_krw=75000,max_discount_pct=50/);
  assert.match(migration,/interval '7 days'/);
  assert.match(migration,/cron\.schedule\('singles-daily-ops'/);
  assert.match(migration,/owner_decision_required/,'proposals apply only after the owner decides');
});
test('terms draft states the new model, discount framing, invoice after acceptance and refunds',()=>{
  for(const s of ['가입비와 선불 적립금은 받지 않습니다','기본 요금 + 입력·공개 할인','상대 회원이 **수락하면**','7일 안에 두 사람의 결제가 모두 끝나지 않으면','14일','연락처 교환이 성사되기 전','결혼 상담·알선을 하지 않으며','무료회원','15,000원','150,000원'])assert.ok(terms.includes(s),s);
  assert.doesNotMatch(terms,/적게 입력·공개할수록 (?:높|비싸)/);
});
test('owner decision 2026-10-31: no refund after use on mid-term cancellation is disclosed before purchase; statutory 7-day withdrawal kept',async()=>{
  const app=await readFile(new URL('../sites/ekodi-singles/public/app.js',import.meta.url),'utf8');
  assert.match(terms,/중도에 해지하는 경우 남은 기간은 환불하지 않습니다/);
  assert.match(terms,/7일 이내에 구독 기능을 전혀 이용하지 않았다면 전액 환불/);
  assert.match(app,/중도에 해지해도 남은 기간은 환불되지 않습니다/);
});
