import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  MOTOR_FESTIVAL_API_PATH, REGISTRATION_CLOSES_AT, EXPIRES_AT, CLIENT_LIMIT, PHONE_LIMIT,
  handleMotorFestivalApplications, purgeExpiredMotorFestivalApplications,
  validateApplication, motorFestivalKeys, sealField, openField, summarize,
} from '../motor-festival-registration-api.js';
import customerEntryWorker from '../customer-entry-worker.js';

const MIGRATION=fs.readFileSync(new URL('../migrations/0199_cgma_motor_festival_2026_applications.sql',import.meta.url),'utf8');
const KEY='test-only-key-'+'x'.repeat(40);
const ENDPOINT='https://ekodi.kr'+MOTOR_FESTIVAL_API_PATH;
const OPEN_NOW=Date.parse('2026-10-20T10:00:00+09:00');

// Minimal Cloudflare D1 adapter over node:sqlite, executing the real migration.
function d1(){
  const db=new DatabaseSync(':memory:');
  db.exec(MIGRATION);
  const statement=(sql,params=[])=>({
    bind:(...args)=>statement(sql,args),
    async first(){return db.prepare(sql).get(...params)??null},
    async all(){return {results:db.prepare(sql).all(...params)}},
    async run(){const r=db.prepare(sql).run(...params);return {meta:{changes:Number(r.changes)}}},
  });
  return {raw:db,prepare:sql=>statement(sql)};
}
const envWith=(overrides={})=>({DB:d1(),MOTOR_FESTIVAL_PII_KEY:KEY,...overrides});
const payload=(extra={})=>({business_name:'청계 테스트상점',contact_name:'가상 담당자',phone:'010-0000-1234',
  category:'음식·분식',membership:'join',intent:'yes',activity:['판매','시식·시연'],items:'가상 품목',
  hours:'all',support:['테이블','전기'],staff:'2',notes:'가상 건의',consent:'on',...extra});
let seq=0;
const post=(body,{key=`idem-${Date.now()}-${++seq}-abcdef`,headers={},ip='203.0.113.7'}={})=>new Request(ENDPOINT,{
  method:'POST',body:JSON.stringify(body),
  headers:{'content-type':'application/json','origin':'https://ekodi.kr','x-ekodi-intake-request':'1',
    'idempotency-key':key,'cf-connecting-ip':ip,...headers},
});
const get=(query='',headers={})=>new Request(ENDPOINT+query,{headers});
const at=now=>({now:()=>now});
const authority=result=>({now:()=>OPEN_NOW,resolveAuthority:async()=>result});
const CGMA_ADMIN={ok:true,scope:'tenant',email:'manager@example.test',role:'admin',tenantSlug:'cgma'};
const SUPER_ADMIN={ok:true,scope:'platform',email:'super@example.test',role:'super_admin'};

test('route matches only the exact festival path',async()=>{
  const env=envWith();
  assert.equal(await handleMotorFestivalApplications(new Request('https://ekodi.kr/api/merchant-events/other'),env),null);
  assert.equal(await handleMotorFestivalApplications(new Request(ENDPOINT+'/extra'),env),null);
});

test('validation enforces required fields, consent, allow-lists and honeypot',()=>{
  assert.equal(validateApplication(payload()).ok,true);
  assert.equal(validateApplication(payload({consent:undefined})).code,'CONSENT_REQUIRED');
  assert.equal(validateApplication(payload({business_name:'  '})).code,'BUSINESS_NAME_REQUIRED');
  assert.equal(validateApplication(payload({contact_name:''})).code,'CONTACT_NAME_REQUIRED');
  assert.equal(validateApplication(payload({phone:'abc'})).code,'PHONE_INVALID');
  assert.equal(validateApplication(payload({category:'무기'})).code,'CATEGORY_INVALID');
  assert.equal(validateApplication(payload({membership:'admin'})).code,'MEMBERSHIP_INVALID');
  assert.equal(validateApplication(payload({activity:['<script>']})).code,'ACTIVITY_INVALID');
  assert.equal(validateApplication(payload({notes:'가'.repeat(1001)})).code,'TEXT_TOO_LONG');
  assert.equal(validateApplication(payload({role:'super_admin'})).code,'UNRECOGNIZED_FIELD');
  assert.equal(validateApplication(payload({website:'http://spam'})).code,'INVALID_APPLICATION');
  assert.deepEqual(validateApplication(payload({activity:'판매'})).value.activity,['판매']);
});

test('field encryption round-trips, is randomized and bound to the key',async()=>{
  const keys=await motorFestivalKeys(KEY);
  const a=await sealField(keys,'010-0000-1234'),b=await sealField(keys,'010-0000-1234');
  assert.notEqual(a,b);
  assert.doesNotMatch(a,/0000/);
  assert.equal(await openField(keys,a),'010-0000-1234');
  const other=await motorFestivalKeys('another-key-'+'y'.repeat(40));
  await assert.rejects(openField(other,a));
  assert.equal(await motorFestivalKeys('short'),null);
});

test('anonymous POST persists encrypted row and returns receipt only after read-back',async()=>{
  const env=envWith();
  const res=await handleMotorFestivalApplications(post(payload()),env,at(OPEN_NOW));
  assert.equal(res.status,201);
  const body=await res.json();
  assert.match(body.receipt_id,/^MF26-[2-9A-HJ-NP-Z]{8}$/);
  const row=env.DB.raw.prepare('SELECT * FROM cgma_motor_festival_2026_applications').get();
  assert.equal(row.receipt_code,body.receipt_id);
  assert.equal(row.business_name,'청계 테스트상점');
  assert.equal(row.expires_at,EXPIRES_AT);
  for(const column of ['contact_name_enc','phone_enc','notes_enc']){
    assert.match(row[column],/^v1\./);
    assert.doesNotMatch(row[column],/가상|0000/);
  }
  assert.doesNotMatch(JSON.stringify(row),/010-0000-1234|가상 담당자/);
  assert.equal(res.headers.get('cache-control'),'private, no-store');
});

test('POST fails closed without encryption key or storage and never fakes a receipt',async()=>{
  const noKey=await handleMotorFestivalApplications(post(payload()),envWith({MOTOR_FESTIVAL_PII_KEY:''}),at(OPEN_NOW));
  assert.equal(noKey.status,503);
  assert.equal((await noKey.json()).receipt_id,undefined);
  const noDb=await handleMotorFestivalApplications(post(payload()),{MOTOR_FESTIVAL_PII_KEY:KEY},at(OPEN_NOW));
  assert.equal(noDb.status,503);
  const broken=envWith();
  broken.DB={prepare(){throw new Error('D1 offline: secret payload must not leak')}};
  const logged=[];const original=console.error;console.error=(...args)=>logged.push(args.join(' '));
  try{
    const res=await handleMotorFestivalApplications(post(payload()),broken,at(OPEN_NOW));
    assert.equal(res.status,503);
    assert.equal((await res.json()).receipt_id,undefined);
  }finally{console.error=original}
  assert.doesNotMatch(logged.join('\n'),/010|가상|secret payload/);
});

test('cross-origin, missing intake header, wrong type and oversize are rejected',async()=>{
  const env=envWith();
  assert.equal((await handleMotorFestivalApplications(post(payload(),{headers:{origin:'https://evil.example'}}),env,at(OPEN_NOW))).status,403);
  assert.equal((await handleMotorFestivalApplications(post(payload(),{headers:{'sec-fetch-site':'cross-site'}}),env,at(OPEN_NOW))).status,403);
  assert.equal((await handleMotorFestivalApplications(post(payload(),{headers:{'x-ekodi-intake-request':''}}),env,at(OPEN_NOW))).status,403);
  assert.equal((await handleMotorFestivalApplications(post(payload(),{headers:{'content-type':'text/plain'}}),env,at(OPEN_NOW))).status,415);
  assert.equal((await handleMotorFestivalApplications(post(payload(),{key:'short'}),env,at(OPEN_NOW))).status,400);
  assert.equal((await handleMotorFestivalApplications(post(payload({notes:'x'.repeat(9000)})),env,at(OPEN_NOW))).status,413);
  assert.equal(env.DB.raw.prepare('SELECT count(*) n FROM cgma_motor_festival_2026_applications').get().n,0);
});

test('idempotent replay returns same receipt; conflicting reuse is refused',async()=>{
  const env=envWith();
  const key='replay-key-0123456789';
  const first=await (await handleMotorFestivalApplications(post(payload(),{key}),env,at(OPEN_NOW))).json();
  const again=await handleMotorFestivalApplications(post(payload(),{key}),env,at(OPEN_NOW));
  assert.equal(again.status,200);
  assert.equal((await again.json()).receipt_id,first.receipt_id);
  const conflict=await handleMotorFestivalApplications(post(payload({business_name:'다른 상점'}),{key}),env,at(OPEN_NOW));
  assert.equal(conflict.status,409);
  assert.equal(env.DB.raw.prepare('SELECT count(*) n FROM cgma_motor_festival_2026_applications').get().n,1);
});

test('per-phone duplicate and per-client burst limits return 429',async()=>{
  const env=envWith();
  for(let i=0;i<PHONE_LIMIT;i++)assert.equal((await handleMotorFestivalApplications(post(payload(),{ip:'198.51.100.'+i}),env,at(OPEN_NOW+i))).status,201);
  const dup=await handleMotorFestivalApplications(post(payload(),{ip:'198.51.100.99'}),env,at(OPEN_NOW+10));
  assert.equal(dup.status,429);
  assert.equal((await dup.json()).code,'DUPLICATE_LIMIT');
  const burst=envWith();
  assert.ok(CLIENT_LIMIT>=20,'one shop Wi-Fi must serve a merchants meeting');
  for(let i=0;i<CLIENT_LIMIT;i++)assert.equal((await handleMotorFestivalApplications(post(payload({phone:`010-1111-${String(i).padStart(4,'0')}`})),burst,at(OPEN_NOW+i))).status,201);
  const sixth=await handleMotorFestivalApplications(post(payload({phone:'010-1111-9999'})),burst,at(OPEN_NOW+99));
  assert.equal(sixth.status,429);
  assert.equal((await sixth.json()).code,'TOO_MANY_REQUESTS');
  const later=await handleMotorFestivalApplications(post(payload({phone:'010-1111-8888'})),burst,at(OPEN_NOW+11*60*1000));
  assert.equal(later.status,201);
});

test('registration closes at 2026-10-25 08:00 KST',async()=>{
  const env=envWith();
  assert.equal((await handleMotorFestivalApplications(post(payload()),env,at(REGISTRATION_CLOSES_AT-1))).status,201);
  assert.equal((await handleMotorFestivalApplications(post(payload({phone:'010-2222-3333'})),env,at(REGISTRATION_CLOSES_AT))).status,410);
});

test('admin list: anonymous 401, ordinary member 403, cgma admin and super admin 200',async()=>{
  const env=envWith();
  await handleMotorFestivalApplications(post(payload()),env,at(OPEN_NOW));
  const anon=await handleMotorFestivalApplications(get(),env,authority({ok:false,status:401,code:'ACCESS_AUTH_REQUIRED'}));
  assert.equal(anon.status,401);
  assert.doesNotMatch(await anon.text(),/가상|010/);
  const member=await handleMotorFestivalApplications(get(),env,authority({ok:false,status:403,code:'TENANT_ACCESS_MANAGE_FORBIDDEN'}));
  assert.equal(member.status,403);
  const otherTenant=await handleMotorFestivalApplications(get(),env,authority({ok:true,scope:'unknown',email:'x@example.test'}));
  assert.equal(otherTenant.status,403);
  for(const who of [CGMA_ADMIN,SUPER_ADMIN]){
    const res=await handleMotorFestivalApplications(get(),env,authority(who));
    assert.equal(res.status,200);
    const data=await res.json();
    assert.equal(data.summary.total,1);
    assert.equal(data.applications[0].phone,'010-0000-1234');
    assert.equal(data.applications[0].contact_name,'가상 담당자');
    assert.deepEqual(data.applications[0].support,['테이블','전기']);
  }
  const audits=env.DB.raw.prepare('SELECT actor_email,action,record_count FROM cgma_motor_festival_2026_access_audit ORDER BY actor_email').all();
  assert.deepEqual(audits.map(a=>[a.actor_email,a.action,a.record_count]),[['manager@example.test','list',1],['super@example.test','list',1]]);
});

test('authority is resolved for tenant cgma',async()=>{
  const env=envWith();let seen='';
  await handleMotorFestivalApplications(get(),env,{now:()=>OPEN_NOW,resolveAuthority:async(_r,_e,{tenantSlug})=>{seen=tenantSlug;return {ok:false,status:401}}});
  assert.equal(seen,'cgma');
});

test('summary view is aggregate only and contains no personal data',async()=>{
  const env=envWith();
  await handleMotorFestivalApplications(post(payload()),env,at(OPEN_NOW));
  await handleMotorFestivalApplications(post(payload({phone:'010-3333-4444',membership:'regular',intent:'maybe',support:['급수']})),env,at(OPEN_NOW));
  const res=await handleMotorFestivalApplications(get('?view=summary'),env,authority(CGMA_ADMIN));
  const text=await res.text();
  assert.equal(res.status,200);
  assert.doesNotMatch(text,/010|가상 담당자|가상 건의|applications/);
  const {summary}=JSON.parse(text);
  assert.equal(summary.total,2);assert.equal(summary.regular,1);assert.equal(summary.join,1);
  assert.equal(summary.participating,1);assert.equal(summary.maybe,1);
  assert.deepEqual(summary.bySupport,{'테이블':1,'전기':1,'급수':1});
  assert.deepEqual(summarize([]).byCategory,{});
});

test('retention purge deletes only expired rows and expired rows are never listed',async()=>{
  const env=envWith();
  await handleMotorFestivalApplications(post(payload()),env,at(OPEN_NOW));
  assert.deepEqual(await purgeExpiredMotorFestivalApplications(env,{now:Date.parse(EXPIRES_AT)-1}),{ok:true,deleted:0});
  const afterExpiry=Date.parse(EXPIRES_AT)+1;
  const hidden=await handleMotorFestivalApplications(get('?view=summary'),env,{now:()=>afterExpiry,resolveAuthority:async()=>CGMA_ADMIN});
  assert.equal((await hidden.json()).summary.total,0);
  assert.deepEqual(await purgeExpiredMotorFestivalApplications(env,{now:afterExpiry}),{ok:true,deleted:1});
  assert.equal(env.DB.raw.prepare('SELECT count(*) n FROM cgma_motor_festival_2026_applications').get().n,0);
  const purgeCadence=10*60*1000;
  assert.ok(Date.parse(EXPIRES_AT)+purgeCadence-Date.parse('2026-10-25T17:00:00+09:00')<30*24*60*60*1000,'deleted within 30 days of event end');
});

test('Control API dispatches the route and runs purge on every schedule',async()=>{
  const env=envWith();
  const res=await customerEntryWorker.fetch(new Request(ENDPOINT,{method:'DELETE'}),env,{waitUntil(){}});
  assert.equal(res.status,405);
  assert.equal(res.headers.get('x-ekodi-route'),'cgma-motor-festival-2026');
  const source=fs.readFileSync(new URL('../customer-entry-worker.js',import.meta.url),'utf8');
  const scheduled=source.slice(source.indexOf('async scheduled('));
  assert.ok(scheduled.indexOf('purgeExpiredMotorFestivalApplications')<scheduled.indexOf('if (reporting?.ran) return'),'purge precedes early return');
});

test('no Supabase service-role key or plaintext personal fields in the Worker module',()=>{
  const source=fs.readFileSync(new URL('../motor-festival-registration-api.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/SERVICE_ROLE/);
  assert.doesNotMatch(MIGRATION,/\b(contact_name|phone|notes)\s+TEXT/);
});
