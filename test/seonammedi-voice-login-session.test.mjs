import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import board from '../services/independent-board/worker.js';

const origin='https://seonammedi.kr';
function authorizedUser(){
 return {id:'verified-google-user',email:'writer@example.com',email_confirmed_at:'2026-01-01T00:00:00Z',
   app_metadata:{provider:'google',providers:['google']}};
}

test('fresh board renders parseable independent composer and protected admin path on both mounts',async()=>{
 for(const url of [origin+'/board/voices','https://ekodi.kr/seonammedi/board/voices']){
  const response=await board.fetch(new Request(url),{});
  assert.equal(response.status,200);
  const html=await response.text();
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);
  assert.doesNotThrow(()=>new Script(scripts[0][1]));
  for(const id of ['freshWrite','freshSearch','freshForm','freshList'])assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(html,/\/api\/auth\/session/);
  assert.match(html,/adminAllowed/);
  assert.match(html,/Google 로그인 상태가 확인되지 않았습니다/);
  assert.doesNotMatch(html,/id="voiceAuthStatus"|id="writeToggle"|id="voiceManageToggle"/);
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

test('fresh write form requires server verified Google session and checks confirmed saved post id',async()=>{
 const response=await board.fetch(new Request(origin+'/board/voices'),{});
 const html=await response.text();
 assert.match(html,/const t=await session\(\);if\(!t\)/);
 assert.match(html,/\/api\/auth\/session/);
 assert.match(html,/waitUntilPublished\(saved\)/);
 assert.match(html,/posts\.some\(p=>p\.id===savedId\)/);
 assert.match(html,/beginLogin\(\)/);
});

