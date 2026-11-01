import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {routeSinglesSurface} from '../singles-surface.js';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const edge=await read('supabase/functions/singles-api/index.ts');
const app=await read('sites/ekodi-singles/public/app.js');
test('pilot gate: before public launch only pilot users and operators reach member features',()=>{
  assert.match(edge,/Deno\.env\.get\("SINGLES_PUBLIC_LAUNCH_ENABLED"\) !== "true"/);
  assert.match(edge,/singles_pilot_users/);
  assert.match(edge,/return reply\(req, \{ error: "pilot_only" \}, 403\)/);
});
test('signup attempts are recorded with time and Google account before enrollment is written',()=>{
  assert.match(edge,/singles_signup_attempts/);
  assert.match(edge,/email = typeof data\.user\.email === "string"/);
  const enroll=edge.indexOf('await logAttempt("enroll");'),upsert=edge.indexOf('.upsert(row, { onConflict: "user_id" })');
  assert.ok(enroll>0&&enroll<upsert,'attempt logged before the membership write (fail-closed)');
  assert.match(edge,/logAttempt\("enroll_failed", code\)/);
  assert.match(edge,/await logAttempt\("withdraw"\)/);
});
test('worker allowlists only the new paid-model endpoints',async()=>{
  const env={SINGLES_M1_ENABLED:'true',SINGLES_SOCIAL_ENABLED:'true',SINGLES_API_URL:'https://x.supabase.co/functions/v1/singles-api',SUPABASE_URL:'https://x.supabase.co',SUPABASE_PUBLISHABLE_KEY:'k',ASSETS:{fetch:()=>new Response('')}};
  for(const [path,method,expect] of [['/singles/api/pricing','GET',401],['/singles/api/passes/pass_10d','POST',401],['/singles/api/passes/pass_7d','POST',404],
    ['/singles/api/bank/admin/members','GET',401],['/singles/api/bank/admin/members/11111111-1111-4111-8111-111111111111/adult-verify','POST',401]]){
    const r=await routeSinglesSurface(new Request('https://ekodi.kr'+path,{method,headers:{'content-type':'application/json'}}),env);
    assert.equal(r.status,expect,path);
  }
});
test('free members see only the guide; paid-only menus stay hidden until paid',async()=>{
  const html=await (await routeSinglesSurface(new Request('https://ekodi.kr/singles/'),{ASSETS:{fetch:()=>new Response('')}})).text();
  for(const t of ['동행 찾기','메시지','내 프로필'])assert.match(html,new RegExp('data-paid-nav hidden>'+t+'</a>'));
  assert.match(app,/link\.hidden=link\.hasAttribute\('data-paid-nav'\)&&paidOnlyHidden/);
  assert.match(app,/if\(state\.paidModel&&!state\.paid\)\{showGuide\(h\);return\}/,'free members get no profile form');
  assert.match(app,/무료회원: 서비스 안내만 볼 수 있습니다/);
  // 2026-10-31: 가입비·적립금 없음, 구독권 구매로 유료회원, 수락 후 청구서.
  assert.match(app,/가입비 없이 기간제 구독권\(1일·10일·20일·1달\)을 구매하면/);
  assert.match(app,/api\('\/bank\/orders',\{method:'POST',body:\{plan_code:plan\.code\}\}\)/);
  assert.match(app,/api\('\/bank\/invoices\/'\+inv\.id\+'\/order'/);
  assert.doesNotMatch(app,/plan_code:'credit_initial'/);
  assert.match(app,/\['message','메시지 교환 요청'\],\['contact','연락처 교환 요청'\]/);
});
test('postpaid invoices and owner proposals are reachable only through authenticated, allowlisted routes',async()=>{
  const env={SINGLES_M1_ENABLED:'true',SINGLES_SOCIAL_ENABLED:'true',SINGLES_API_URL:'https://x.supabase.co/functions/v1/singles-api',SUPABASE_URL:'https://x.supabase.co',SUPABASE_PUBLISHABLE_KEY:'k',ASSETS:{fetch:()=>new Response('')}};
  const id='11111111-1111-4111-8111-111111111111';
  for(const [path,method,expect] of [['/singles/api/bank/invoices/'+id+'/order','POST',401],['/singles/api/bank/admin/proposals','GET',401],
    ['/singles/api/bank/admin/proposals/'+id+'/decide','POST',401],['/singles/api/bank/admin/ops/review','POST',401],['/singles/api/bank/invoices/x/order','POST',404]]){
    const r=await routeSinglesSurface(new Request('https://ekodi.kr'+path,{method,headers:{'content-type':'application/json'}}),env);
    assert.equal(r.status,expect,path);
  }
  const bank=await read('supabase/functions/singles-api/bank-transfer.ts');
  for(const route of ['/bank/admin/proposals','/bank/admin/ops/review'])assert.ok(bank.includes(route));
  assert.equal((bank.match(/owner_capability_required/g)||[]).length,4,'every owner route (proposals, review, decide, invites) checks can_configure');
  assert.match(app,/운영 개선 제안 · 소유자 결정/);
});
