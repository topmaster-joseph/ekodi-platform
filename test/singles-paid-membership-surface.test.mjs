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
  assert.match(app,/가입비 500,000원을 계좌이체하면 같은 금액\(500,000원\)이 적립금으로 생깁니다/);
  assert.match(app,/plan_code:'credit_initial'/);
  assert.match(app,/\['message','메시지 교환 요청'\],\['contact','연락처 교환 요청'\]/);
});
