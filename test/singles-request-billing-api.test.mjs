import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const bank=await readFile(new URL('../supabase/functions/singles-api/bank-transfer.ts',import.meta.url),'utf8');
const terms=await readFile(new URL('../docs/EKODI-SINGLES-TERMS-BILLING.md',import.meta.url),'utf8');
test('initial 500,000 top-up is required once before any additional top-up',()=>{
  assert.match(bank,/initial_credit_already_ordered/);
  assert.match(bank,/initial_credit_required',initial_krw:500000/);
  assert.match(bank,/path==='\/bank\/wallet'&&method==='GET'/);
});

test('terms draft states the decided pricing, acceptance-time charging and refunds',()=>{
  for(const s of ['50,000원 / 30일','500,000원(최초 1회 필수)','수락하는 순간','14일','전액 환불','결혼 상담·알선을 하지 않으며'])assert.ok(terms.includes(s),s);
});
