import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {routeSinglesSurface} from '../singles-surface.js';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [sql,bank,app,gates]=await Promise.all([read('supabase/migrations/20261104090000_singles_adult_check_requests.sql'),read('supabase/functions/singles-api/bank-transfer.ts'),read('sites/ekodi-singles/public/app.js'),read('docs/EKODI-SINGLES-LAUNCH-GATES.md')]);
const live={SINGLES_PUBLIC_PREVIEW_ENABLED:'true',ASSETS:{fetch:async()=>new Response('')},SINGLES_API_URL:'https://example.supabase.co/functions/v1/singles-api',
 SINGLES_M1_ENABLED:'true',SINGLES_SOCIAL_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_x'};
test('self adult check: no ID copies, contact erased on completion, cancel and withdrawal',()=>{
 assert.match(sql,/constraint singles_adult_check_contact_cleared check \(status='requested' or contact is null\)/);
 assert.match(sql,/update public\.singles_adult_check_requests set status='done',contact=null/);
 assert.match(sql,/operator_self_verification_forbidden/);
 assert.match(sql,/enable always trigger singles_adult_check_on_membership_end/);
 assert.doesNotMatch(sql.split('\n').filter(l=>!l.trim().startsWith('--')).join('\n'),/id_number|resident|birth|주민/i,'no ID number or birth date columns');
 for(const f of ['singles_adult_check_request(uuid,text,text,text)','singles_adult_check_cancel(uuid)','singles_operator_verify_adult(uuid,uuid,text,text)'])
  assert.ok(sql.includes('revoke all on function public.'+f+' from authenticated;'),f);
 assert.match(bank,/select\('method,preferred_time,status,created_at,done_at'\)\.eq\('user_id',userId\)/,'member never reads back the stored contact');
});
test('member request form and operator queue',async()=>{
 assert.match(app,/신분증 사본은 받지 않고 저장하지 않으며, 확인이 끝나면 연락처도 바로 지웁니다/);
 assert.match(app,/else await adultCheckRequest\(box\);/);
 assert.doesNotMatch(app,/운영자\(joseph@ekodi\.kr\)에게 신분증 확인을 요청해 주세요/);
 assert.match(app,/성인 확인 요청 · 연락해서 신분증을 확인한 뒤 처리하세요/);
 const r=await routeSinglesSurface(new Request('https://ekodi.kr/singles/api/bank/adult-check',{method:'POST',headers:{'content-type':'application/json'}}),live);
 assert.equal(r.status,401);
});
test('public launch is recorded as an owner decision with a rollback path',()=>{
 assert.match(gates,/\| G9 \| 공개 개통: `SINGLES_PUBLIC_LAUNCH_ENABLED=true` \| ✅ 2026-11-04 소유자 결정으로 개통/);
 assert.match(gates,/비밀값 삭제 시 즉시 초대 명단만 이용/);
});
test('owner is alerted by mail on a new request; failure never blocks the member; test button is operator-only',async()=>{
 const live2={...live};
 const bearer={authorization:'Bearer '+'x'.repeat(40),'content-type':'application/json',origin:'https://ekodi.kr'};
 const realFetch=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response(JSON.stringify({status:'requested'}),{status:200,headers:{'content-type':'application/json'}});
  const r=await routeSinglesSurface(new Request('https://ekodi.kr/singles/api/bank/adult-check',{method:'POST',headers:bearer}),live2); // 본문 전달은 Workers 런타임 동작이라 여기서는 응답 처리만 검증
  assert.equal(r.status,200);assert.deepEqual(await r.json(),{status:'requested'});
  globalThis.fetch=async()=>new Response(JSON.stringify({error:'operator_capability_required'}),{status:403});
  const denied=await routeSinglesSurface(new Request('https://ekodi.kr/singles/api/bank/admin/alert-test',{method:'POST',headers:bearer,body:'{}'}),live2);
  assert.equal(denied.status,403);
  globalThis.fetch=async()=>new Response(JSON.stringify({orders:[]}),{status:200});
  const noMail=await routeSinglesSurface(new Request('https://ekodi.kr/singles/api/bank/admin/alert-test',{method:'POST',headers:bearer,body:'{}'}),live2);
  assert.equal(noMail.status,503);assert.equal((await noMail.json()).error,'mail_not_configured');
 }finally{globalThis.fetch=realFetch}
 const worker=await read('singles-surface.js');
 assert.match(worker,/export const SINGLES_OWNER_ALERT_TO='joseph@ekodi\.kr'/);
 assert.match(worker,/개인정보 보호를 위해 이 메일에는 연락처를 넣지 않습니다/);
 const block=worker.slice(worker.indexOf("if(sub==='/api/bank/adult-check'&&req.method==='POST'&&result.ok)"));
 assert.doesNotMatch(block.slice(0,700),/data\.contact|contact\+/,'alert mail never includes the contact');
});
test('PortOne public identifiers are configured; the secret never is; operator check stays as a fallback',async()=>{
 const toml=await read('wrangler.site.toml');
 assert.match(toml,/SINGLES_PORTONE_STORE_ID = "store-[0-9a-f-]{36}"/);
 assert.match(toml,/SINGLES_PORTONE_IDENTITY_CHANNEL_KEY = "channel-key-[0-9a-f-]{36}"/);
 assert.doesNotMatch(toml,/PORTONE_API_SECRET\s*=/);
 assert.match(app,/휴대폰 인증이 어려우신가요\? 운영자 확인으로 요청하기/);
 const store=toml.match(/SINGLES_PORTONE_STORE_ID = "([^"]+)"/)[1],channel=toml.match(/SINGLES_PORTONE_IDENTITY_CHANNEL_KEY = "([^"]+)"/)[1];
 const s=await (await routeSinglesSurface(new Request('https://ekodi.kr/singles/api/status'),{...live,SINGLES_PORTONE_STORE_ID:store,SINGLES_PORTONE_IDENTITY_CHANNEL_KEY:channel})).json();
 assert.deepEqual(s.identity_verification,{provider:'portone',store_id:store,channel_key:channel});
});
