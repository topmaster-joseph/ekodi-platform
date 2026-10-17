import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {readFile} from 'node:fs/promises';
import board from '../services/independent-board/worker.js';

test('fresh opinion page uses Google authentication and protected admin controls on both hosts',async()=>{
 for(const url of ['https://seonammedi.kr/board/voices','https://ekodi.kr/seonammedi/board/voices']){
  const r=await board.fetch(new Request(url),{});assert.equal(r.status,200);
  const html=await r.text();
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);assert.doesNotThrow(()=>new Script(scripts[0][1]));
  assert.match(html,/id="freshWrite"/);
  assert.match(html,/id="freshForm"/);
  assert.match(html,/url\.searchParams\.set\('site','seonammedi'\)/);
  assert.match(html,/url\.searchParams\.set\('return_to',dest\.href\)/);
  assert.match(html,/const t=await session\(\);if\(!t\)/);
  assert.match(html,/adminAllowed/);
  assert.match(html,/headers:\{authorization:'Bearer '\+token\}/);
  assert.doesNotMatch(html,/id="voiceAdminLogin"|id="writeToggle"|id="voiceManageToggle"/);
 }
});
test('form-post handoff stores the Google session without leaking the one-use proof',async()=>{
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600,user:{id:'test'}});
 try{
  const r=await board.fetch(new Request('https://seonammedi.kr/board/voices?compose=1',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'ekodi_auth_return=1&ekodi_token=one-use-synthetic&ekodi_type=email'}),{});
  assert.equal(r.status,200);
  const html=await r.text();
  assert.match(html,/sessionStorage\.setItem\(/);
  assert.match(html,/if\(saved\)location\.replace\(target\)/);
  assert.doesNotMatch(html,/one-use-synthetic/);
  assert.match(html,/board\/voices\?compose=1/);
 }finally{globalThis.fetch=oldFetch}
});
test('only canonical EKODI Site Core grants fresh board admin permission',async()=>{
 const oldFetch=globalThis.fetch,queries=[];
 globalThis.fetch=async(url,options)=>{queries.push({url:String(url),auth:options?.headers?.authorization});return Response.json({ok:true,permissions:{voices:true},platform:false})};
 const env={BOARD_DB:{prepare(){return{all:async()=>({results:[]})}}}};
 try{
  const r=await board.fetch(new Request('https://seonammedi.kr/board/api/voices-fresh/admin',{headers:{authorization:'Bearer verified-test-admin'}}),env);
  assert.equal(r.status,200);
  assert.deepEqual((await r.json()).items,[]);
  assert.equal(queries.length,1);
  assert.equal(queries[0].url,'https://ekodi.kr/api/seonammedi/admin/me');
  assert.equal(queries[0].auth,'Bearer verified-test-admin');
 }finally{globalThis.fetch=oldFetch}
});
test('visitors never gain administrator rights on fresh board or retired old API',async()=>{
 const env={BOARD_DB:{prepare(){throw Error('guest must not query admin table')}}};
 const denied=await board.fetch(new Request('https://seonammedi.kr/board/api/voices-fresh/admin'),env);
 assert.equal(denied.status,403);
 const old=await board.fetch(new Request('https://seonammedi.kr/board/api/admin/posts'),env);
 assert.equal(old.status,410);
});
test('fresh board separates ordinary Google proof from permissions',async()=>{
 const src=await readFile(new URL('../services/independent-board/worker.js',import.meta.url),'utf8');
 const page=await readFile(new URL('../services/independent-board/voices-fresh/page.mjs',import.meta.url),'utf8');
 assert.match(src,/admin:requireVoiceAdmin/);
 assert.match(src,/google:signedInGoogle/);
 assert.match(page,/\/api\/auth\/session/);
 assert.match(page,/data\.authenticated===true|d\?\.authenticated===true/);
 assert.match(page,/\/api\/voices-fresh/);
});
