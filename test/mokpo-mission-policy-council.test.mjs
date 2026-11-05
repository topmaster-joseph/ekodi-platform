import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  MOKPO_POLICY_API_PATH, REGISTRATION_CLOSES_AT, EXPIRES_AT, MAX_PEOPLE, PHONE_LIMIT,
  handleMokpoMissionPolicyRegistrations, purgeExpiredMokpoMissionRegistrations,
  validateSubmission, mokpoMissionKeys, sealField, openField, isMokpoPolicyApiPath,
} from '../mokpo-mission-policy-council-api.js';

const MIGRATION=fs.readFileSync(new URL('../migrations/202611051600_mokpo_mission_policy_council_2026.sql',import.meta.url),'utf8');
const KEY='test-only-key-'+'y'.repeat(40);
const ENDPOINT='https://ekodi.kr'+MOKPO_POLICY_API_PATH;
const OPEN_NOW=Date.parse('2026-11-10T10:00:00+09:00');
const TABLE='mokpo_mission_policy_council_2026_registrations';

function d1(){
  const db=new DatabaseSync(':memory:');
  db.exec(MIGRATION);
  const statement=(sql,params=[])=>({
    bind:(...args)=>statement(sql,args),
    async first(){return db.prepare(sql).get(...params)??null},
    async all(){return {results:db.prepare(sql).all(...params)}},
    async run(){const r=db.prepare(sql).run(...params);return {meta:{changes:Number(r.changes)}}},
  });
  return {raw:db,prepare:sql=>statement(sql),async batch(list){const out=[];for(const s of list)out.push(await s.run());return out;}};
}
const envWith=(o={})=>({DB:d1(),MOKPO_MISSION_PII_KEY:KEY,...o});
const person=(extra={})=>({dept:'선교부',role:'서기',name:'가상 목사',clergy:'목사',church:'가상교회',phone:'010-0000-1234',attend:'O',...extra});
const payload=(people=[person()],extra={})=>({people,consent:true,...extra});
let seq=0;
const post=(body,{key=`idem-${++seq}-abcdefghijklmnop`,headers={},ip='203.0.113.9'}={})=>new Request(ENDPOINT,{
  method:'POST',body:JSON.stringify(body),
  headers:{'content-type':'application/json','origin':'https://ekodi.kr','x-ekodi-intake-request':'1','idempotency-key':key,'cf-connecting-ip':ip,...headers},
});
const at=now=>({now:()=>now});

test('route matches only the exact registrations path',()=>{
  assert.equal(isMokpoPolicyApiPath(MOKPO_POLICY_API_PATH),true);
  assert.equal(isMokpoPolicyApiPath(MOKPO_POLICY_API_PATH+'/'),true);
  assert.equal(isMokpoPolicyApiPath(MOKPO_POLICY_API_PATH+'/x'),false);
  assert.equal(isMokpoPolicyApiPath('/api/organizations/mokpo-mission'),false);
});

test('validation follows the 총회 붙임2 columns, consent and honeypot',()=>{
  assert.equal(validateSubmission(payload()).ok,true);
  assert.equal(validateSubmission(payload([person()],{consent:false})).code,'CONSENT_REQUIRED');
  assert.equal(validateSubmission(payload([])).code,'PEOPLE_REQUIRED');
  assert.equal(validateSubmission(payload(Array.from({length:MAX_PEOPLE+1},()=>person()))).code,'TOO_MANY_PEOPLE');
  assert.equal(validateSubmission(payload([person({clergy:'집사'})])).code,'CLERGY_INVALID');
  assert.equal(validateSubmission(payload([person({attend:'Y'})])).code,'ATTEND_INVALID');
  assert.equal(validateSubmission(payload([person({dept:'교육부'})])).code,'DEPT_INVALID');
  assert.equal(validateSubmission(payload([person({role:''})])).code,'ROLE_INVALID');
  assert.equal(validateSubmission(payload([person({name:' '})])).code,'NAME_REQUIRED');
  assert.equal(validateSubmission(payload([person({church:''})])).code,'CHURCH_REQUIRED');
  assert.equal(validateSubmission(payload([person({phone:'abc'})])).code,'PHONE_INVALID');
  const second=validateSubmission(payload([person(),person({phone:'1'})]));
  assert.equal(second.code,'PHONE_INVALID');assert.equal(second.index,1);
  assert.equal(validateSubmission(payload([person({extra:1})])).code,'UNRECOGNIZED_FIELD');
  assert.equal(validateSubmission(payload([person()],{website:'spam'})).code,'INVALID_SUBMISSION');
});

test('field encryption round-trips and is bound to row and column',async()=>{
  const keys=await mokpoMissionKeys(KEY);
  const sealed=await sealField(keys,'홍길동','name','r1');
  assert.notEqual(sealed,await sealField(keys,'홍길동','name','r1'));
  assert.equal(await openField(keys,sealed,'name','r1'),'홍길동');
  await assert.rejects(openField(keys,sealed,'phone','r1'));
  assert.equal(await mokpoMissionKeys('short'),null);
});

test('POST stores every person encrypted and returns a receipt only after read-back',async()=>{
  const env=envWith();
  const res=await handleMokpoMissionPolicyRegistrations(post(payload([person(),person({name:'가상 장로',clergy:'장로',phone:'010-0000-5678',attend:'X',role:'회계'})])),env,at(OPEN_NOW));
  assert.equal(res.status,201);
  const body=await res.json();
  assert.match(body.receipt_id,/^MP26-[2-9A-Z]{8}$/);assert.equal(body.count,2);
  const rows=env.DB.raw.prepare(`SELECT * FROM ${TABLE} ORDER BY seq`).all();
  assert.equal(rows.length,2);
  for(const r of rows){
    assert.equal(r.receipt_code,body.receipt_id);assert.equal(r.expires_at,EXPIRES_AT);
    assert.ok(!r.name_enc.includes('가상'));assert.ok(!r.phone_enc.includes('010'));
  }
  assert.deepEqual(rows.map(r=>[r.clergy,r.attend,r.role]),[['목사','O','서기'],['장로','X','회계']]);
});

test('fails closed without key or storage and never fakes a receipt',async()=>{
  const noKey=await handleMokpoMissionPolicyRegistrations(post(payload()),envWith({MOKPO_MISSION_PII_KEY:''}),at(OPEN_NOW));
  assert.equal(noKey.status,503);assert.equal((await noKey.json()).receipt_id,undefined);
  const noDb=await handleMokpoMissionPolicyRegistrations(post(payload()),{MOKPO_MISSION_PII_KEY:KEY},at(OPEN_NOW));
  assert.equal(noDb.status,503);
});

test('cross-origin, missing intake header and wrong content type are rejected',async()=>{
  const env=envWith();
  assert.equal((await handleMokpoMissionPolicyRegistrations(post(payload(),{headers:{origin:'https://evil.example'}}),env,at(OPEN_NOW))).status,403);
  assert.equal((await handleMokpoMissionPolicyRegistrations(post(payload(),{headers:{'x-ekodi-intake-request':'0'}}),env,at(OPEN_NOW))).status,403);
  assert.equal((await handleMokpoMissionPolicyRegistrations(post(payload(),{headers:{'content-type':'text/plain'}}),env,at(OPEN_NOW))).status,415);
  assert.equal((await handleMokpoMissionPolicyRegistrations(post(payload(),{key:'short'}),env,at(OPEN_NOW))).status,400);
  assert.equal(env.DB.raw.prepare(`SELECT COUNT(*) n FROM ${TABLE}`).get().n,0);
});

test('idempotent replay returns the same receipt; conflicting reuse is refused',async()=>{
  const env=envWith(),key='same-key-1234567890abcdef';
  const a=await (await handleMokpoMissionPolicyRegistrations(post(payload(),{key}),env,at(OPEN_NOW))).json();
  const b=await handleMokpoMissionPolicyRegistrations(post(payload(),{key}),env,at(OPEN_NOW));
  assert.equal(b.status,200);assert.equal((await b.json()).receipt_id,a.receipt_id);
  const c=await handleMokpoMissionPolicyRegistrations(post(payload([person({church:'다른교회'})]),{key}),env,at(OPEN_NOW));
  assert.equal(c.status,409);
  assert.equal(env.DB.raw.prepare(`SELECT COUNT(*) n FROM ${TABLE}`).get().n,1);
});

test('the same phone is limited per day',async()=>{
  const env=envWith();
  for(let i=0;i<PHONE_LIMIT;i++)assert.equal((await handleMokpoMissionPolicyRegistrations(post(payload(),{ip:'198.51.100.'+i}),env,at(OPEN_NOW))).status,201);
  assert.equal((await handleMokpoMissionPolicyRegistrations(post(payload(),{ip:'198.51.100.99'}),env,at(OPEN_NOW))).status,429);
});

test('registration closes at 2026-11-24 00:00 KST',async()=>{
  assert.equal(REGISTRATION_CLOSES_AT,Date.parse('2026-11-23T15:00:00Z'));
  const res=await handleMokpoMissionPolicyRegistrations(post(payload()),envWith(),at(REGISTRATION_CLOSES_AT));
  assert.equal(res.status,410);
});

test('admin list: anonymous 401, other tenant 403, mokpo-mission admin decrypts and is audited',async()=>{
  const env=envWith();
  await handleMokpoMissionPolicyRegistrations(post(payload()),env,at(OPEN_NOW));
  const get=()=>new Request(ENDPOINT);
  let asked=null;
  const anon=await handleMokpoMissionPolicyRegistrations(get(),env,{...at(OPEN_NOW),resolveAuthority:async()=>({ok:false,status:401})});
  assert.equal(anon.status,401);
  const body401=await anon.text();assert.ok(!body401.includes('010-'));
  const other=await handleMokpoMissionPolicyRegistrations(get(),env,{...at(OPEN_NOW),resolveAuthority:async()=>({ok:false,status:403})});
  assert.equal(other.status,403);
  const ok=await handleMokpoMissionPolicyRegistrations(get(),env,{...at(OPEN_NOW),resolveAuthority:async(_r,_e,o)=>{asked=o.tenantSlug;return {ok:true,scope:'platform',email:'admin@example.test'};}});
  assert.equal(asked,'mokpo-mission');
  const data=await ok.json();
  assert.equal(data.registrations[0].name,'가상 목사');assert.equal(data.registrations[0].phone,'010-0000-1234');
  assert.equal(data.summary.attending,1);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM mokpo_mission_policy_council_2026_access_audit').get().n,1);
});

test('retention purge removes rows after the expiry date',async()=>{
  const env=envWith();
  await handleMokpoMissionPolicyRegistrations(post(payload()),env,at(OPEN_NOW));
  assert.equal((await purgeExpiredMokpoMissionRegistrations(env,{now:OPEN_NOW})).deleted,0);
  assert.equal((await purgeExpiredMokpoMissionRegistrations(env,{now:Date.parse(EXPIRES_AT)})).deleted,1);
});

test('mission page links the registration page and the page uses the 붙임2 columns',()=>{
  const home=fs.readFileSync(new URL('../sites/mokpo-presbytery/mission/index.html',import.meta.url),'utf8');
  assert.ok(home.includes('/mokpo-presbytery/mission/policy-council-2026/'));
  assert.ok(home.includes('/mokpo-presbytery/mission/admin/registrations'));
  const page=fs.readFileSync(new URL('../sites/mokpo-presbytery/mission/policy-council-2026/index.html',import.meta.url),'utf8');
  assert.ok(page.includes(`data-api="${MOKPO_POLICY_API_PATH}"`));
  assert.ok(page.includes('/mokpo-presbytery/mission/policy-council-2026/app.js'));
  const app=fs.readFileSync(new URL('../sites/mokpo-presbytery/mission/policy-council-2026/app.js',import.meta.url),'utf8');
  for(const label of ['부서명','부서 직책','성명','교직','교회','연락처','정책협의회 참석'])assert.ok(app.includes(label),label);
});

test('router serves the registration page and its script, 404 for other subpaths',async()=>{
  const worker=(await import('../platform-router-entry-worker.js')).default;
  const call=async path=>{const served=[];const env={ASSETS:{fetch:async req=>{served.push(new URL(req.url).pathname);return new Response('ok',{status:200,headers:{'content-type':'text/html'}});}}};
    const res=await worker.fetch(new Request('https://ekodi.kr'+path),env,{waitUntil(){},passThroughOnException(){}});return {res,served};};
  const base='/mokpo-presbytery/mission/policy-council-2026';
  for(const [path,asset] of [[base,base+'/'],[base+'/',base+'/'],[base+'/app.js',base+'/app.js']]){
    const {res,served}=await call(path);
    assert.equal(res.status,200,path);assert.deepEqual(served,[asset],path);
    assert.equal(res.headers.get('x-ekodi-route'),'mokpo-presbytery-static-pilot');
  }
  for(const path of [base+'/registrations.csv',base+'/admin',base+'x/']){
    const {res,served}=await call(path);
    assert.equal(res.status,404,path);assert.deepEqual(served,[],path);
  }
});

test('registrations admin section exists only for the mission department',async()=>{
  const {isOrganizationAdminPath,organizationAdminPage}=await import('../organization-admin-page.js');
  assert.equal(isOrganizationAdminPath('/mokpo-presbytery/mission/admin/registrations'),true);
  assert.equal(isOrganizationAdminPath('/mokpo-presbytery/admin/registrations'),false);
  assert.equal(isOrganizationAdminPath('/hammu/admin/registrations'),false);
  const html=await organizationAdminPage('/mokpo-presbytery/mission/admin/registrations').text();
  assert.match(html,/정책협의회 신청명단/);
  const hammu=await organizationAdminPage('/hammu/admin').text();
  assert.doesNotMatch(hammu,/정책협의회 신청명단/);
});

test('static headers let the registration page run its same-origin script and reach the API',()=>{
  const headers=fs.readFileSync(new URL('../_headers',import.meta.url),'utf8');
  for(const path of ['/mokpo-presbytery/mission/policy-council-2026/','/mokpo-presbytery/mission/policy-council-2026/*']){
    const start=headers.indexOf('\n'+path+'\n');
    assert.ok(start>=0,path);
    const block=headers.slice(start+1).split(/\n\s*\n/)[0];
    assert.match(block,/! Content-Security-Policy/,path);
    const csp=block.split('\n').find(line=>line.trim().startsWith('Content-Security-Policy:'));
    assert.match(csp,/script-src 'self'/,path);
    assert.match(csp,/connect-src 'self'/,path);
    assert.doesNotMatch(csp,/unsafe-eval|script-src[^;]*unsafe-inline/,path);
  }
});
