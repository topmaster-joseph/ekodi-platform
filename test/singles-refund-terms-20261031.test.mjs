import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {routeSinglesSurface} from '../singles-surface.js';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [sql,bank,social,app,worker,contract]=await Promise.all([
 read('supabase/migrations/20261031090000_singles_invoice_refund.sql'),
 read('supabase/functions/singles-api/bank-transfer.ts'),
 read('supabase/functions/singles-api/social.ts'),
 read('sites/ekodi-singles/public/app.js'),
 read('singles-surface.js'),
 read('config/singles-api-db-contract.json'),
]);
const env={SINGLES_PUBLIC_PREVIEW_ENABLED:'true',ASSETS:{fetch:async()=>new Response('')},SINGLES_API_URL:'https://example.supabase.co/functions/v1/singles-api'};

test('H3 refund is recorded only after a human bank transfer, by a verifying operator, never for oneself',()=>{
 assert.match(sql,/check \(status in \('unpaid','paid','void','refund_due','refunded'\)\)/);
 assert.match(sql,/status <> 'refunded' or \(refunded_at is not null and refunded_by is not null/);
 assert.match(sql,/unique index if not exists singles_request_invoices_refund_trace/);
 assert.match(sql,/enabled=true and can_verify=true/);
 assert.match(sql,/operator_self_refund_forbidden/);
 assert.match(sql,/if i\.status<>'refund_due' then raise exception 'invoice_not_refundable'/);
 assert.match(sql,/enable always trigger singles_invoice_refund_due_stamp/);
 assert.match(sql,/revoke all on function public\.singles_invoice_refund_complete\(uuid,uuid,text\) from authenticated;/);
 assert.match(sql,/grant execute on function public\.singles_invoice_refund_complete\(uuid,uuid,text\) to service_role;/);
 assert.doesNotMatch(sql,/singles_bank_orders set status/,'refund never rewrites the original payment record');
 assert.match(contract,/singles_invoice_refund_complete\(uuid,uuid,text\)/);
});

test('refund API requires verification capability, strict body and maps every refusal',()=>{
 const i=bank.indexOf("path==='/bank/admin/refunds'&&method==='GET'");
 assert.ok(i>0);
 assert.match(bank.slice(i,i+300),/role\.can_verify!==true/);
 const j=bank.indexOf('refundId&&method===');
 assert.match(bank.slice(j,j+900),/Object\.keys\(v\)\.some\(k=>k!=='refund_trace'\)/);
 for(const e of ['operator_self_refund_forbidden','invoice_not_refundable','invoice_already_refunded','refund_trace_duplicate'])assert.match(bank,new RegExp(e));
 assert.match(social,/refund_due_at:inv\.refund_due_at\|\|null,refunded_at:inv\.refunded_at\|\|null/);
});

test('worker forwards only the two refund routes and they stay closed without a backend',async()=>{
 assert.match(worker,/if\(path==='\/api\/bank\/admin\/refunds'&&method==='GET'\)/);
 assert.match(worker,/\\\/complete\$\/i\.test\(path\)&&method==='POST'/);
 const closed=await routeSinglesSurface(new Request('https://ekodi.kr/singles/api/bank/admin/refunds'),{ASSETS:env.ASSETS});
 assert.equal(closed.status,503);
 const live={...env,SINGLES_M1_ENABLED:'true',SINGLES_SOCIAL_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_x'};
 const anon=await routeSinglesSurface(new Request('https://ekodi.kr/singles/api/bank/admin/refunds'),live);
 assert.equal(anon.status,401,'signed-in EKODI identity required');
 const bad=await routeSinglesSurface(new Request('https://ekodi.kr/singles/api/bank/admin/refunds/not-a-uuid/complete',{method:'POST'}),live);
 assert.equal(bad.status,404,'only a UUID refund path is forwarded');
});

test('operator and member screens show refund state without sending money automatically',()=>{
 assert.match(app,/async function showRefundsAdmin\(h\)/);
 assert.match(app,/돈은 자동으로 나가지 않습니다/);
 assert.match(app,/await showOwnerProposals\(h\);await showRefundsAdmin\(h\);/);
 assert.match(app,/refunded:'환불 완료'/);
 assert.match(app,/입금하신 계좌로 돌려드립니다/);
 assert.match(app,/계좌번호 입력 금지/);
 const d=new Function(app.match(/function refundDeadline\(iso\)\{[^\n]+\}/)[0]+';return refundDeadline')();
 assert.equal(d('2026-10-30T03:00:00Z'),'2026-11-04','금요일 확정 → 다음 주 수요일(주말 제외 3영업일)');
});

test('동행 이용약관 states naturally that there is no matchmaking and what the acceptance fee means',async()=>{
 const r=await routeSinglesSurface(new Request('https://ekodi.kr/singles/terms'),env);
 assert.equal(r.status,200);
 assert.match(r.headers.get('x-robots-tag')||'',/noindex/);
 const html=await r.text();
 for(const s of ['교제·만남 공동체','결혼 상대를 소개·알선·중개하는 서비스가 아닙니다','짝지어 주지 않으며','성사를 약속하거나 보장하지 않습니다',
  '두 사람의 의사를 서로 확인하고 존중하는 절차','소개하거나 알선한 대가가 아닙니다','결혼 상대 소개·중개 영업',
  '남은 기간은 환불하지 않습니다','3영업일 안에 입금하신 계좌로','15,000원','150,000원','75,000원','213-13-01959'])
  assert.ok(html.includes(s),s);
 assert.doesNotMatch(html,/<script/);
 assert.doesNotMatch(html,/결혼을 (?:주선|성사시켜)|배우자를 찾아/);
 const home=await (await routeSinglesSurface(new Request('https://ekodi.kr/singles'),env)).text();
 assert.match(home,/href="\/singles\/terms">동행 이용약관/);
 const privacy=await (await routeSinglesSurface(new Request('https://ekodi.kr/singles/privacy'),env)).text();
 assert.match(privacy,/소개·알선·중개하지 않는 교제·만남 공동체/);
 assert.match(privacy,/href="\/singles\/terms"/);
 assert.match(app,/function termsLink\(box\)/);
});

test('operator screens no longer surface marriage-brokerage preparation',()=>{
 assert.doesNotMatch(app,/showBrokerageReadiness|결혼중개업 신고|국제결혼중개업/);
});
