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
   assert.match(html,/if\(!await requireVoiceAccount\(\)\)return/);
   assert.match(html,/voiceAuthLabel\(\(data.email/);
   assert.match(html,/auth.searchParams.set\("site","portal"\)/);
   assert.match(html,/target.searchParams.set\("compose","1"\)/);
   assert.match(html,/if\(allowed&&new URLSearchParams\(location.search\).get\("compose"\)==="1"\)/);
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
   assert.equal(options.headers.authorization,'Bearer example-test-token');
   checks++;
   return Response.json(authorizedUser());
 };
 try{
   const res=await board.fetch(new Request(origin+'/board/api/auth/session',{
     headers:{authorization:'Bearer example-test-token'}
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
     headers:{authorization:'Bearer email-only-token'}
   }),{});
   assert.equal(res.status,401);
   assert.equal((await res.json()).error,'google_login_required');
 }finally{globalThis.fetch=oldFetch}
});

test('login form POST handoff keeps write intent query and never exposes credentials in its URL',async()=>{
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({
   access_token:'test-short-lived-access',refresh_token:'test-refresh',expires_in:3600,
   user:{id:'confirmed'}
 });
 try{
   const url=origin+'/board/voices?compose=1';
   const res=await board.fetch(new Request(url,{method:'POST',
     headers:{'content-type':'application/x-www-form-urlencoded'},
     body:'ekodi_auth_return=1&ekodi_token=valid-test-code&ekodi_type=email'
   }),{});
   assert.equal(res.status,200);
   const html=await res.text();
   assert.match(html,/board\/voices\?compose=1/);
   assert.doesNotMatch(html,/valid-test-code/);
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
