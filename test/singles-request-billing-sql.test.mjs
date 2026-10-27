import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sql=await readFile(new URL('../supabase/migrations/20261027140000_singles_request_billing.sql',import.meta.url),'utf8');
const fnBody=n=>sql.slice(sql.indexOf('function public.'+n+'('),sql.indexOf('end $$;',sql.indexOf('function public.'+n+'(')));

test('decided pricing: monthly pass 50,000; initial credit 500,000 = 50 units; top-up 100,000 = 10 units; not on sale',()=>{
  assert.match(sql,/update public\.singles_bank_plans set amount_krw=50000/);
  assert.match(sql,/\('credit_initial','[^']+',500000,1,false,50\)/);
  assert.match(sql,/\('credit_topup','[^']+',100000,1,false,10\)/);
});
test('request reserves only; acceptance charges requester and responder one unit each',()=>{
  const create=fnBody('singles_request_create');
  assert.match(create,/available=available-1,reserved=reserved\+1/);
  const decide=fnBody('singles_request_decide');
  const acc=decide.slice(decide.indexOf("if p_decision='accepted'"),decide.indexOf('else'));
  assert.match(acc,/responder_insufficient_credit/);
  assert.ok(acc.indexOf('responder_insufficient_credit')<acc.indexOf('update public.singles_message_credit_wallets'),'check credit before any debit');
  assert.match(acc,/set available=available-1,updated_at=now\(\) where user_id=p_responder/);
  assert.match(acc,/set reserved=reserved-1,updated_at=now\(\)\s+where user_id=b\.requester_id/);
  assert.match(decide,/reserved=reserved-1,available=available\+1/,'decline releases');
});
test('pending reservations are returned on expiry (14 days) and withdrawal',()=>{
  assert.match(fnBody('singles_request_release_for_user'),/interval '14 days'/);
  assert.match(fnBody('singles_withdraw_member'),/singles_request_release_for_user\(p_user,'withdrawn'\)/);
});
test('billing objects are server-only',()=>{
  assert.match(sql,/revoke all on table public\.singles_request_billing,public\.singles_request_ledger from public,anon,authenticated;/);
  assert.match(sql,/revoke all on function public\.singles_request_create\(uuid,uuid\)/);
});
