import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {routeSinglesSurface} from '../singles-surface.js';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [sql,bank,app,worker,contract]=await Promise.all([
 read('supabase/migrations/20261031120000_singles_subscription_withdrawal.sql'),
 read('supabase/functions/singles-api/bank-transfer.ts'),
 read('sites/ekodi-singles/public/app.js'),
 read('singles-surface.js'),
 read('config/singles-api-db-contract.json'),
]);
const live={SINGLES_PUBLIC_PREVIEW_ENABLED:'true',ASSETS:{fetch:async()=>new Response('')},SINGLES_API_URL:'https://example.supabase.co/functions/v1/singles-api',
 SINGLES_M1_ENABLED:'true',SINGLES_SOCIAL_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_x'};

test('withdrawal is allowed only within 7 days, unused, latest subscription, once',()=>{
 assert.match(sql,/now\(\)>o\.verified_at\+interval '7 days'/);
 for(const t of ['singles_paid_requests where requester_id=p_user','singles_paid_requests where responder_id=p_user','singles_messages where sender_id=p_user','singles_event_rsvps where user_id=p_user'])
  assert.ok(sql.includes(t),t);
 assert.match(sql,/g\.last_order_reference<>o\.reference/);
 assert.match(sql,/already_requested/);
 assert.match(sql,/reference text primary key references public\.singles_bank_orders\(reference\)/);
});
test('withdrawal revokes the period atomically and money is only recorded after a human transfer',()=>{
 const w=sql.slice(sql.indexOf('function public.singles_subscription_withdraw('));
 assert.ok(w.indexOf('for update')<w.indexOf('singles_subscription_withdrawal_eval'),'locks before re-check');
 assert.match(w,/expires_at=greatest\(now\(\),expires_at-make_interval\(days=>o\.duration_days\)\)/);
 assert.match(sql,/function public\.singles_order_refund_complete[\s\S]*can_verify=true[\s\S]*operator_self_refund_forbidden/);
 assert.match(sql,/exists\(select 1 from public\.singles_order_refunds where refund_trace=t\)\s*or exists\(select 1 from public\.singles_request_invoices where refund_trace=t\)/);
 for(const f of ['singles_subscription_withdrawal_eval(uuid,text)','singles_subscription_withdraw(uuid,text)','singles_order_refund_complete(uuid,text,text)']){
  assert.ok(sql.includes('revoke all on function public.'+f+' from authenticated;'),f);
  assert.ok(sql.includes('grant execute on function public.'+f+' to service_role;'),f);
  assert.ok(contract.includes(f),f);
 }
 assert.match(sql,/alter table public\.singles_order_refunds enable row level security/);
});
test('API requires explicit confirmation and reports why a withdrawal is refused',()=>{
 assert.match(bank,/v\.confirm!==true\)\s*return reply\(req,\{error:'withdrawal_confirmation_required'\},400\)/);
 assert.match(bank,/error:'withdrawal_not_allowed',reason:why\},409/);
 assert.match(bank,/kind:'subscription_withdrawal'/);
 const i=bank.indexOf('if(orderRefundRef&&method===');
 assert.match(bank.slice(i,i+300),/role\.can_verify!==true/);
});
test('worker forwards only exact withdrawal and order-refund paths',async()=>{
 const ref='EDH-'+'A'.repeat(32);
 assert.match(worker,/\(report\|acknowledge\|withdraw\)\$/);
 const anon=await routeSinglesSurface(new Request('https://ekodi.kr/singles/api/bank/orders/'+ref+'/withdraw',{method:'POST'}),live);
 assert.equal(anon.status,401);
 const bad=await routeSinglesSurface(new Request('https://ekodi.kr/singles/api/bank/orders/EDH-x/withdraw',{method:'POST'}),live);
 assert.equal(bad.status,404);
 const op=await routeSinglesSurface(new Request('https://ekodi.kr/singles/api/bank/admin/refunds/order/'+ref+'/complete',{method:'POST'}),live);
 assert.equal(op.status,401);
});
test('member screen offers withdrawal with confirmation; operator queue labels it',async()=>{
 assert.match(app,/async function showWithdrawals\(h\)/);
 assert.match(app,/청약철회 신청\(전액 환불\)/);
 assert.match(app,/if\(!confirm\(money\(o\.amount_krw\)\+' 구독권을 청약철회합니까\?/);
 assert.match(app,/await showWithdrawals\(h\);\}/);
 assert.match(app,/\[구독권 청약철회\] /);
 assert.match(app,/'\/bank\/admin\/refunds\/'\+\(r\.kind==='subscription_withdrawal'\?'order\/':''\)/);
 const html=await (await routeSinglesSurface(new Request('https://ekodi.kr/singles/terms'),live)).text();
 assert.ok(html.includes('요청 보내기·수락·거절·메시지·행사 신청)을 한 번도 이용하지 않았다면'));
 assert.ok(html.includes('결혼 상대를 소개·알선·중개하는 서비스가 아닙니다'));
});
