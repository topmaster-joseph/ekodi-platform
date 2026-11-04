import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {routeSinglesSurface} from '../singles-surface.js';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [sql,social,app,contract]=await Promise.all([read('supabase/migrations/20261104010000_singles_paid_events.sql'),read('supabase/functions/singles-api/social.ts'),read('sites/ekodi-singles/public/app.js'),read('config/singles-api-db-contract.json')]);
const env={SINGLES_PUBLIC_PREVIEW_ENABLED:'true',ASSETS:{fetch:async()=>new Response('')}};
test('paid events: seat held while awaiting payment, deadline, refunds recorded, money never moves automatically',()=>{
 const rsvp=sql.slice(sql.indexOf('function public.singles_event_rsvp('),sql.indexOf('function public.singles_event_rsvp_cancel('));
 assert.match(rsvp,/where id=p_event for update/);
 assert.match(rsvp,/status in \('requested','approved','pending_payment'\)/);
 assert.match(rsvp,/least\(now\(\)\+interval '3 days',greatest\(now\(\)\+interval '1 hour',ev\.starts_at-interval '1 hour'\)\)/);
 assert.match(rsvp,/'event_fee',ev\.fee_krw/);
 const cancel=sql.slice(sql.indexOf('function public.singles_event_rsvp_cancel('));
 assert.match(cancel,/ev\.starts_at>now\(\)\+interval '24 hours'/);
 assert.match(sql,/function public\.singles_event_cancel[\s\S]*can_configure=true[\s\S]*'event_cancelled'/);
 assert.match(sql,/elsif r\.plan_code='event_fee' then[\s\S]*'event_unavailable'/);
 assert.match(sql,/e:=public\.singles_event_payment_housekeeping\(\)/);
 for(const f of ['singles_event_cancel(uuid,uuid)','singles_event_payment_housekeeping()','singles_bank_confirm_order(text,uuid,text,text,text)'])
  assert.ok(sql.includes('revoke all on function public.'+f+' from authenticated;'),f);
 assert.doesNotMatch(sql,/update public\.singles_order_refunds set status='refunded'/,'refund completion stays with the operator function');
 assert.match(contract,/singles_event_cancel\(uuid,uuid\)/);
});
test('owner sets fee (0 or 1,000~1,000,000), fee locked once anyone registered, cancel goes through refund function',()=>{
 assert.match(social,/v\.fee_krw<0\|\|v\.fee_krw>1000000\|\|\(v\.fee_krw>0&&v\.fee_krw<1000\)/);
 assert.match(social,/fee_locked_after_registration/);
 assert.match(social,/admin\.rpc\('singles_event_cancel',\{p_owner:userId,p_event:programId\}\)/);
 assert.doesNotMatch(social,/event_fee_verification_not_configured/);
});
test('member sees the fee, deadline and refund rule before applying and before cancelling',()=>{
 assert.match(app,/const EVENT_REFUND_RULE='참가비 환불: 행사 시작 24시간 전까지 취소하면 전액, 그 뒤 취소는 환불되지 않습니다/);
 assert.match(app,/계좌이체해 주세요\. 기한 안에 입금이 확인되지 않으면 자동으로 취소됩니다/);
 assert.match(app,/행사 시작 24시간 이내라 참가비는 환불되지 않습니다/);
 assert.match(app,/field\('참가비\(원, 선택\)',fee\)/);
});
test('terms show the legal basis and the paid-event rules',async()=>{
 const html=await (await routeSinglesSurface(new Request('https://ekodi.kr/singles/terms'),env)).text();
 for(const s of ['제10조 (법적 근거)','결혼중개업의 관리에 관한 법률','관할 기관(무안군)에 서면으로 질의해 회신을 받았습니다','제17조(청약철회)','제23조의3','제9조 (행사·모임 참가비)','행사 시작 24시간 전까지 취소하면 참가비를 전액','법률 검토·무안군 회신 반영'])
  assert.ok(html.includes(s),s);
 assert.doesNotMatch(html,/법률 검토 전 초안/);
});
