import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleInvestAutopilotApi } from '../invest-autopilot-runtime.js';
import { investMyRoute } from '../invest-my-workspace.js';
import {
 normalizeStepUpAnswer,candidateFragment,hashStepUpFragment,stepUpLockout,STEP_UP_LIMITS,STEP_UP_TTL_MS,safeEqual
} from '../invest-step-up.js';

const MIGRATIONS=['0086_invest_autonomous_loop.sql','202610251300_invest_autopilot.sql','202610280100_invest_step_up.sql']
 .map(name=>fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
const OWNER='owner@example.com';
// Fictional factor values only. Real factors are seeded out-of-band, never committed.
const PHONE='010-1234-5678',ADDRESS_FRAGMENT='테스트로12길 34-5';
const SALT_A='00112233445566778899aabbccddeeff',SALT_B='ffeeddccbbaa99887766554433221100';

function d1(){
 const sqlite=new DatabaseSync(':memory:');
 for(const sql of MIGRATIONS)sqlite.exec(sql);
 const statement=(sql,params=[])=>({
  bind(...values){return statement(sql,values)},
  async first(){return sqlite.prepare(sql).get(...params)||null},
  async all(){return {results:sqlite.prepare(sql).all(...params)}},
  async run(){const r=sqlite.prepare(sql).run(...params);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}}
 });
 return {sqlite,prepare:sql=>statement(sql)};
}

async function seed(db,{iterations=1000}={}){
 const phone=normalizeStepUpAnswer('phone',PHONE).slice(-8);
 const address=normalizeStepUpAnswer('address',ADDRESS_FRAGMENT);
 const insert=db.sqlite.prepare(`INSERT INTO investment_step_up_factors(subject_email,kind,salt,hash,fragment_length,iterations,active,created_at) VALUES(?,?,?,?,?,?,1,?)`);
 insert.run(OWNER,'phone',SALT_A,await hashStepUpFragment(phone,SALT_A,iterations),phone.length,iterations,'2026-10-28T00:00:00Z');
 insert.run(OWNER,'address',SALT_B,await hashStepUpFragment(address,SALT_B,iterations),address.length,iterations,'2026-10-28T00:00:00Z');
}

function harness({email=OWNER,configured=true}={}){
 const env={DB:d1(),ALLOW_MUTATIONS:'true',ALLOWED_ORIGINS:'https://ekodi.kr',INVEST_OWNER_EMAIL:OWNER,INVEST_STEP_UP_REQUIRED:'true'};
 const ready=configured?seed(env.DB):Promise.resolve();
 const call=async(method,path,payload,token='')=>{
  await ready;
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({id:'owner-uuid',email,email_confirmed_at:'2026-10-01T00:00:00Z'}),{status:200});
  try{
   const headers={authorization:'Bearer '+'t'.repeat(40),'content-type':'application/json',origin:'https://ekodi.kr'};
   if(token)headers['x-ekodi-invest-step-up']=token;
   const response=await handleInvestAutopilotApi(new Request('https://ekodi.kr'+path,{method,headers,body:payload?JSON.stringify(payload):undefined}),env);
   return {status:response.status,body:await response.json(),headers:response.headers};
  }finally{globalThis.fetch=original}
 };
 return {env,call};
}

test('normalization keeps only the comparable fragment',()=>{
 assert.equal(normalizeStepUpAnswer('phone','010-1234-5678'),'01012345678');
 assert.equal(normalizeStepUpAnswer('address',' 테스트로12길 34-5 '),'테스트로12길345');
 assert.equal(candidateFragment('phone','010 1234 5678',8),'12345678');
 assert.equal(candidateFragment('phone','5678',8),'');
 const fragment=normalizeStepUpAnswer('address',ADDRESS_FRAGMENT);
 assert.equal(candidateFragment('address','전남 무안군 테스트로12길 34-5',fragment.length),fragment);
 assert.equal(safeEqual('abc','abc'),true);assert.equal(safeEqual('abc','abd'),false);assert.equal(safeEqual('ab','abc'),false);
});

test('lockout triggers after repeated failures in the window and the day',()=>{
 const now=Date.UTC(2026,9,28,0,0,0);
 assert.equal(stepUpLockout([now-1000,now-2000],now).locked,false);
 const window=Array.from({length:STEP_UP_LIMITS.windowFailures},(_,i)=>now-i*1000);
 assert.equal(stepUpLockout(window,now).locked,true);
 const day=Array.from({length:STEP_UP_LIMITS.dayFailures},(_,i)=>now-(i+1)*STEP_UP_LIMITS.windowMs);
 const decision=stepUpLockout(day,now);
 assert.equal(decision.locked,true);assert.ok(decision.retryAfterMs>0);
});

test('Google login alone cannot use the autopilot API',async()=>{
 const {call}=harness();
 const status=await call('GET','/v1/invest/autopilot/status');
 assert.equal(status.status,403);assert.equal(status.body.error,'STEP_UP_REQUIRED');
 const forged=await call('GET','/v1/invest/autopilot/status',null,'F'.repeat(43));
 assert.equal(forged.body.error,'STEP_UP_REQUIRED');
 const policy=await call('PUT','/v1/invest/autopilot/policy',{policy:{}});
 assert.equal(policy.body.error,'STEP_UP_REQUIRED');
});

test('non-owner is rejected before the second factor is even offered',async()=>{
 const {call}=harness({email:'someone@example.com'});
 const r=await call('POST','/v1/invest/autopilot/step-up',{answer:PHONE});
 assert.equal(r.status,403);assert.equal(r.body.error,'OWNER_ONLY');
});

test('phone number (any format) unlocks the workspace and the token then works',async()=>{
 const {env,call}=harness();
 const before=await call('GET','/v1/invest/autopilot/step-up');
 assert.equal(before.body.configured,true);assert.equal(before.body.verified,false);
 const r=await call('POST','/v1/invest/autopilot/step-up',{answer:'010 1234 5678'});
 assert.equal(r.status,200);assert.equal(r.body.verified,true);
 assert.match(r.body.token,/^[A-Za-z0-9_-]{43}$/);
 assert.ok(Date.parse(r.body.expiresAt)-Date.now()<=STEP_UP_TTL_MS);
 const after=await call('GET','/v1/invest/autopilot/step-up',null,r.body.token);
 assert.equal(after.body.verified,true);
 const status=await call('GET','/v1/invest/autopilot/status',null,r.body.token);
 assert.equal(status.status,200);assert.equal(status.body.state,'RESEARCH_ONLY');
 // Nothing about the answer is persisted in clear text.
 const dump=JSON.stringify(env.DB.sqlite.prepare(`SELECT * FROM investment_step_up_sessions`).all())+JSON.stringify(env.DB.sqlite.prepare(`SELECT * FROM investment_autopilot_events`).all());
 assert.doesNotMatch(dump,/12345678|1234-5678/);assert.doesNotMatch(dump,new RegExp(r.body.token));
 const events=env.DB.sqlite.prepare(`SELECT event_type FROM investment_autopilot_events`).all().map(e=>e.event_type);
 assert.ok(events.includes('step_up:verified'));
 // Revocation ends the session.
 await call('DELETE','/v1/invest/autopilot/step-up',null,r.body.token);
 assert.equal((await call('GET','/v1/invest/autopilot/status',null,r.body.token)).body.error,'STEP_UP_REQUIRED');
});

test('a part of the registered address unlocks, even with a region prefix',async()=>{
 const {call}=harness();
 const r=await call('POST','/v1/invest/autopilot/step-up',{answer:'전남 무안군 테스트로12길 34-5'});
 assert.equal(r.status,200);assert.equal(r.body.verified,true);
});

test('wrong answers count down and then lock, even for the right answer',async()=>{
 const {call}=harness();
 const first=await call('POST','/v1/invest/autopilot/step-up',{answer:'010-9999-0000'});
 assert.equal(first.status,401);assert.equal(first.body.error,'STEP_UP_MISMATCH');
 assert.equal(first.body.remaining,STEP_UP_LIMITS.windowFailures-1);
 for(let i=1;i<STEP_UP_LIMITS.windowFailures;i++)await call('POST','/v1/invest/autopilot/step-up',{answer:'wrong-'+i});
 const locked=await call('POST','/v1/invest/autopilot/step-up',{answer:PHONE});
 assert.equal(locked.status,429);assert.equal(locked.body.error,'STEP_UP_LOCKED');assert.ok(locked.body.retryAfterSec>0);
});

test('short, partial or oversized answers never match',async()=>{
 const {call}=harness();
 for(const answer of ['5678','','1234-5678'.slice(0,3),'x'.repeat(201),null])
  assert.notEqual((await call('POST','/v1/invest/autopilot/step-up',{answer})).status,200);
});

test('expired sessions are rejected',async()=>{
 const {env,call}=harness();
 const r=await call('POST','/v1/invest/autopilot/step-up',{answer:PHONE});
 env.DB.sqlite.exec(`UPDATE investment_step_up_sessions SET expires_at='2020-01-01T00:00:00.000Z'`);
 assert.equal((await call('GET','/v1/invest/autopilot/status',null,r.body.token)).body.error,'STEP_UP_REQUIRED');
});

test('fails closed when no factor is registered',async()=>{
 const {call}=harness({configured:false});
 const r=await call('POST','/v1/invest/autopilot/step-up',{answer:PHONE});
 assert.equal(r.status,503);assert.equal(r.body.error,'STEP_UP_NOT_CONFIGURED');
 assert.equal((await call('GET','/v1/invest/autopilot/step-up')).body.configured,false);
});

test('CORS allows the step-up header and DELETE',async()=>{
 const {env}=harness();
 const pre=await handleInvestAutopilotApi(new Request('https://ekodi.kr/v1/invest/autopilot/step-up',{method:'OPTIONS',headers:{origin:'https://ekodi.kr'}}),env);
 assert.equal(pre.status,204);
 assert.match(pre.headers.get('access-control-allow-headers'),/x-ekodi-invest-step-up/);
 assert.match(pre.headers.get('access-control-allow-methods'),/DELETE/);
});

test('top-right shows one 본인인증 대기 button, a step-up dialog, and keeps the token in memory',async()=>{
 const html=await (await investMyRoute(new Request('https://ekodi.kr/invest'),{})).text();
 const js=await (await investMyRoute(new Request('https://ekodi.kr/invest/app.js'),{})).text();
 assert.match(html,/id="stepUpButton"[^>]*data-state="pending"[^>]*>본인인증 대기<\/button>/);
 assert.doesNotMatch(html,/본인 인증 확인 중<\/span>|class="avatar"/);
 assert.match(html,/<dialog id="stepUpDialog"/);assert.match(html,/휴대폰 번호 또는 주소 일부/);
 assert.match(js,/본인인증 완료/);assert.match(js,/x-ekodi-invest-step-up/);assert.match(js,/STEP_UP_REQUIRED/);
 assert.doesNotMatch(js,/sessionStorage\.setItem|localStorage\.setItem|innerHTML/);
 // Owner tools stay hidden until the second factor succeeds.
 assert.match(html,/<section id="owner" hidden>/);
});

test('every login step on /my/invest is time-boxed so the page never hangs on 확인 중',async()=>{
 const js=await (await investMyRoute(new Request('https://ekodi.kr/invest/app.js'),{})).text();
 assert.match(js,/function withTimeout\(/);
 assert.match(js,/withTimeout\(import\('https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\/\+esm'\),\d+\)/);
 assert.match(js,/withTimeout\(sessionClient\.auth\.getSession\(\),\d+\)/);
 assert.match(js,/withTimeout\(fetch\('\/my\/invest\/access'/);
 assert.match(js,/withTimeout\(fetch\(autopilotApi\+'\/step-up'/);
});

// Production bundles with esbuild keepNames, which injects __name(...) calls into the serialized
// browser client. Without a private helper the script throws on line 1 and /my/invest stays on
// "본인 인증과 사용 권한을 확인하고 있습니다." forever (observed on 2026-10-28).
test('/my/invest/app.js survives the esbuild __name rewrite and leaves the 확인 중 state',async()=>{
 const { Script, createContext }=await import('node:vm');
 const js=await (await investMyRoute(new Request('https://ekodi.kr/invest/app.js'),{})).text();
 const prelude='(()=>{const __name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});\n';
 assert.ok(js.startsWith(prelude));assert.ok(js.endsWith('();})();'));
 // Simulate the bundler: put a keepNames call at the top of the client body.
 const bundled=js.replace("'use strict';","'use strict';const __probe=__name(()=>0,\"probe\");");
 assert.notEqual(bundled,js);
 const nodes=new Map();
 const element=id=>{if(!nodes.has(id))nodes.set(id,{id,hidden:false,disabled:false,value:'',textContent:'',dataset:{},style:{},children:[],
  addEventListener(){},setAttribute(){},replaceChildren(...c){this.children=c;this.textContent=c.map(x=>x.textContent??String(x)).join('')},append(...c){this.children.push(...c);this.textContent+=c.map(x=>x.textContent??String(x)).join('')},
  showModal(){},close(){},focus(){},querySelectorAll(){return []}});return nodes.get(id)};
 element('authMessage').textContent='본인 인증과 사용 권한을 확인하고 있습니다.';
 const throwing={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')},removeItem(){}};
 const context=createContext({console,setTimeout,clearTimeout,Promise,URL,URLSearchParams,Intl,JSON,Math,Number,String,Object,Array,Date,Error,Map,Set,
  document:{getElementById:element,createElement:()=>element(Symbol()),createTextNode:t=>({textContent:t}),createElementNS:()=>element(Symbol()),querySelectorAll:()=>[],activeElement:null},
  location:{hash:'',pathname:'/my/invest',search:'',href:''},history:{replaceState(){}},localStorage:throwing,sessionStorage:throwing,
  fetch:async()=>{throw new Error('offline')},confirm:()=>false});
 assert.doesNotThrow(()=>new Script(bundled).runInContext(context));
 await new Promise(resolve=>setTimeout(resolve,50));
 assert.doesNotMatch(element('authMessage').textContent,/확인하고 있습니다/);
 assert.match(element('authMessage').textContent,/로그인/);
});

test('step-up is an owner opt-in: without INVEST_STEP_UP_REQUIRED the owner session unlocks directly',async()=>{
 const {env,call}=harness({configured:false});
 delete env.INVEST_STEP_UP_REQUIRED;
 const status=await call('GET','/v1/invest/autopilot/step-up');
 assert.equal(status.status,200);assert.deepEqual(status.body,{verified:true,required:false});
 const post=await call('POST','/v1/invest/autopilot/step-up',{answer:'x'});
 assert.equal(post.status,409);
 const policy=await call('GET','/v1/invest/autopilot/policy');
 assert.notEqual(policy.status,403);assert.notEqual(policy.body.error,'STEP_UP_REQUIRED');
});

test('a non-owner Google account is still refused when step-up is off',async()=>{
 const {env,call}=harness({email:'someone@example.com',configured:false});
 delete env.INVEST_STEP_UP_REQUIRED;
 const r=await call('GET','/v1/invest/autopilot/policy');
 assert.equal(r.status,403);
});
