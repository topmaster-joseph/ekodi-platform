import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import board from '../services/independent-board/worker.js';

const origin='https://seonammedi.kr';
function authorizedUser(){
 return {id:'verified-google-user',email:'writer@example.com',email_confirmed_at:'2026-01-01T00:00:00Z',
   app_metadata:{provider:'google',providers:['google']}};
}

test('public board renders parseable login-first composer JavaScript on both site mounts',async()=>{
 for(const url of [origin+'/board/voices','https://ekodi.kr/seonammedi/board/voices']){
   const page=await board.fetch(new Request(url),{});
   assert.equal(page.status,200);
   const html=await page.text();
   const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
   assert.equal(scripts.length,1,'board must have exactly one inline script');
   assert.doesNotThrow(()=>new Script(scripts[0]),'browser script must parse');
   assert.match(html,/id="voiceAuthStatus"[^>]*aria-live="polite"/);
   assert.match(html,/id="voiceAuthStatus"[^>]*hidden/,'anonymous status must not prompt for login');
   assert.doesNotMatch(html,/id="adminLogin"|id="voiceAdminLogin"/,'no duplicate administrator login control');
   assert.doesNotMatch(html,/id="voiceManageToggle"/,'redundant management toggle removed');
   assert.match(html,/if\(q\|\|!voiceVerified\)/,'unverified visitors cannot see management');
   assert.match(html,/\/board\/api\/admin\/posts/,'server-side admin permission is checked');
   assert.match(html,/adminItems=data\.items\|\|\[\];render\(adminItems,true\)/,'protected admin API success directly displays management actions');
   assert.doesNotMatch(html,/manageToggle\.onclick/,'no extra click required for management');
   assert.match(html,/if\(adminLink\)adminLink\.hidden=true/,'admin link is initially hidden');
   assert.match(html,/render\(publicItems,false\)/,'public cards always load before protected admin check');

   assert.match(html,/if\(!await requireVoiceAccount\(\)\)return/);
   assert.match(html,/voiceAuthLabel\("Google 로그인 완료"\)/);
   assert.match(html,/auth.searchParams.set\("site","seonammedi"\)/);
   assert.match(html,/target.searchParams.set\("compose","1"\)/);
   assert.match(html,/if\(composeRequested&&allowed\)\{write\.hidden=false/);
 }
});

test('GET auth/session rejects unauthenticated users, including empty headers',async()=>{
 const res=await board.fetch(new Request(origin+'/board/api/auth/session'),{});
 assert.equal(res.status,401);
 const data=await res.json();
 assert.equal(data.authenticated,false);
 assert.equal(data.error,'google_login_required');
 assert.equal(res.headers.get('cache-control'),'no-store');
});

test('GET auth/session validates identity with upstream Google provider and hides no write bypass',async()=>{
 const oldFetch=globalThis.fetch;
 let checks=0;
 globalThis.fetch=async (url,options)=>{
   assert.equal(new URL(url).pathname,'/auth/v1/user');
   assert.equal(options.headers.authorization,'Bearer fixture-access-value');
   checks++;
   return Response.json(authorizedUser());
 };
 try{
   const res=await board.fetch(new Request(origin+'/board/api/auth/session',{
     headers:{authorization:'Bearer fixture-access-value'}
   }),{});
   assert.equal(res.status,200);
   assert.deepEqual(await res.json(),{ok:true,authenticated:true,provider:'google',email:'writer@example.com'});
   assert.equal(checks,1);
 }finally{globalThis.fetch=oldFetch}
});

test('non-Google accounts do not gain voice write privilege',async()=>{
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({...authorizedUser(),app_metadata:{provider:'email',providers:['email']}});
 try{
   const res=await board.fetch(new Request(origin+'/board/api/auth/session',{
     headers:{authorization:'Bearer fixture-email-value'}
   }),{});
   assert.equal(res.status,401);
   assert.equal((await res.json()).error,'google_login_required');
 }finally{globalThis.fetch=oldFetch}
});

test('login form POST handoff keeps write intent query and never exposes credentials in its URL',async()=>{
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({
   access_token:'fixture-session-value',refresh_token:'fixture-refresh-value',expires_in:3600,
   user:{id:'confirmed'}
 });
 try{
   const url=origin+'/board/voices?compose=1';
   const res=await board.fetch(new Request(url,{method:'POST',
     headers:{'content-type':'application/x-www-form-urlencoded'},
     body:'ekodi_auth_return=1&ekodi_token=fixture-code-value&ekodi_type=email'
   }),{});
   assert.equal(res.status,200);
   const html=await res.text();
   assert.match(html,/board\/voices\?compose=1/);
   assert.doesNotMatch(html,/fixture-code-value/);
   assert.match(html,/localStorage.setItem/);
 }finally{globalThis.fetch=oldFetch}
});

test('write entry requires successful live identity check, not cached token presence',async()=>{
 const response=await board.fetch(new Request(origin+'/board/voices'),{});
 const html=await response.text();
 assert.match(html,/byId\("writeToggle"\)\.onclick=async\(\)=>\{if\(!await requireVoiceAccount\(\)\)return/);
 assert.match(html,/write\.onsubmit=async e=>\{e\.preventDefault\(\);if\(!await requireVoiceAccount\(\)\)return/);
 assert.match(html,/list\.addEventListener\("submit",async e=>[\s\S]*?if\(!await requireVoiceAccount\(\)\)return/);
 assert.match(html,/await awaitVoicePublication\(accepted\)/);
 assert.match(html,/await awaitVoicePublication\(result\)/);
});
