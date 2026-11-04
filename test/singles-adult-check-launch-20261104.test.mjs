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
