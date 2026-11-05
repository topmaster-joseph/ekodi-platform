import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  sandboxConfiguration, startInicisSandbox, finishInicisSandbox
} from '../age-verification-sandbox.js';
import { handleAgeVerificationRequest } from '../age-verification-core.js';
import siteWorker from '../site-worker.js';

const userA = 'platform-admin-a', userB = 'platform-admin-b';
const originalFetch = globalThis.fetch;
const secret = 'server-secret-must-never-leak';
const configured = {
  AGE_VERIFICATION_SANDBOX_ENABLED: 'true',
  PORTONE_INICIS_SANDBOX_STORE_ID: 'store-abc123456789',
  PORTONE_INICIS_SANDBOX_CHANNEL_KEY: 'channel-key-test123456789',
  PORTONE_AGE_API_SECRET: secret
};
class D1 {
  constructor() { this.attempts = new Map(); this.grants = new Map(); }
  prepare(sql) {
    const db = this;
    return { bind(...args) {
      return {
        async run() {
          if (sql.startsWith('INSERT INTO age_verification_attempts')) {
            const [id,subject,site,policy,status,created,expires]=args;
            const count=[...db.attempts.values()].filter(row => row.subject===args[7] && row.created>args[8]).length;
            if (count>=5) return {meta:{changes:0}};
            db.attempts.set(id,{id,subject,site,policy,status,created,expires});
            return {meta:{changes:1}};
          }
          if (sql.startsWith('UPDATE age_verification_attempts')) {
            const [status,completed,id,subject,site,prior,time]=args;
            const a=db.attempts.get(id);
            if (!a || a.subject!==subject || a.site!==site || a.status!==prior || a.expires<=time)
              return {meta:{changes:0}};
            a.status=status;a.completed=completed;
            return {meta:{changes:1}};
          }
          if (sql.startsWith('INSERT INTO age_verification_grants'))
            throw Error('SANDBOX_MUST_NEVER_CREATE_GRANT');
          throw Error('unexpected mutation: '+sql);
        },
        async first() {
          if (sql.startsWith('SELECT status,expires_at FROM age_verification_attempts')) {
            const [id,subject,site,policy]=args;
            const a=db.attempts.get(id);
            return a && a.subject===subject && a.site===site && a.policy===policy
              ? {status:a.status,expires_at:a.expires} : null;
          }
          throw Error('unexpected query: '+sql);
        }
      };
    }};
  }
}
let DB,env,proof;
const now = Date.parse('2026-11-06T10:00:00.000Z');
beforeEach(() => { DB=new D1();env={...configured,DB};proof=null; });
after(() => { globalThis.fetch=originalFetch; });
globalThis.fetch=async (url, options) => {
  assert.match(String(url),/^https:\/\/api\.portone\.io\/identity-verifications\/ekodi-inicis-sandbox-[0-9a-f]{32}$/);
  assert.equal(options.headers.authorization,'PortOne '+secret);
  return new Response(JSON.stringify(typeof proof==='function' ? proof(String(url).split('/').at(-1)) : proof));
};

test('public SDK identifiers are distinct from real provider secrets and default disabled', () => {
  const ok=sandboxConfiguration(env);
  assert.equal(ok.enabled,true);
  assert.equal(ok.mode,'TEST');
  assert.equal(ok.provider,'kg-inicis-unified');
  assert.equal(ok.productionEligibility,false);
  assert.equal(ok.serverProofAvailable,true);
  assert.ok(!JSON.stringify(ok).includes(secret));
  for (const override of [
    {AGE_VERIFICATION_SANDBOX_ENABLED:'false'},
    {PORTONE_INICIS_SANDBOX_STORE_ID:''},
    {PORTONE_INICIS_SANDBOX_CHANNEL_KEY:''},
    {DB:null}
  ]) assert.equal(sandboxConfiguration({...env,...override}).enabled,false);
});

test('start binds a random TEST-only transaction to admin and never creates a grant',async()=>{
  const r=await startInicisSandbox(env,userA,now);
  assert.equal(r.status,201);
  assert.equal(r.body.mode,'TEST');
  assert.equal(r.body.productionEligibility,false);
  assert.match(r.body.identityVerificationId,/^ekodi-inicis-sandbox-[0-9a-f]{32}$/);
  const row=DB.attempts.get(r.body.identityVerificationId);
  assert.equal(row.subject,userA);
  assert.equal(row.site,'singles-sandbox');
  assert.equal(row.policy,'civil_adult_19');
  assert.equal(DB.grants.size,0);
  assert.equal(Date.parse(r.body.expiresAt)-now,10*60*1000);
});

test('atomic SQL admission enforces per-admin five attempts per day',async()=>{
  for(let i=0;i<5;i++){
    const r=await startInicisSandbox(env,userA,now);
    assert.equal(r.status,201);
  }
  assert.equal((await startInicisSandbox(env,userA,now)).status,429);
  assert.equal((await startInicisSandbox(env,userB,now)).status,201);
  assert.equal(DB.attempts.size,6);
});

test('wrong ID, another admin, expired and missing credentials cannot return proof',async()=>{
  const a=await startInicisSandbox(env,userA,now);
  const id=a.body.identityVerificationId;
  assert.equal((await finishInicisSandbox(env,userA,'ekodi-age-'+'1'.repeat(32),now)).status,400);
  assert.equal((await finishInicisSandbox(env,userB,id,now)).status,404);
  assert.equal((await finishInicisSandbox(env,userA,id,now+10*60*1000)).status,410);
  const secretless=await finishInicisSandbox({...env,PORTONE_AGE_API_SECRET:''},userA,id,now);
  assert.equal(secretless.status,503);
  assert.equal(secretless.body.productionEligibility,false);
  assert.equal(DB.grants.size,0);
});

test('only the correct TEST channel and store can pass sandbox; LIVE never passes',async()=>{
  const attempts=[
    id=>({id,status:'READY',channel:{key:env.PORTONE_INICIS_SANDBOX_CHANNEL_KEY,type:'TEST'}}),
    id=>({id,status:'VERIFIED',channel:{key:env.PORTONE_INICIS_SANDBOX_CHANNEL_KEY,type:'LIVE'}}),
    id=>({id,status:'VERIFIED',channel:{key:'channel-key-other',type:'TEST'}}),
    id=>({id,status:'VERIFIED',channel:{type:'TEST'}}),
    id=>({id,status:'VERIFIED',channel:{key:env.PORTONE_INICIS_SANDBOX_CHANNEL_KEY,type:'TEST'},storeId:'store-other12345'}),
    id=>({id:'other-id',status:'VERIFIED',channel:{key:env.PORTONE_INICIS_SANDBOX_CHANNEL_KEY,type:'TEST'}}),
  ];
  for (const make of attempts) {
    const id=(await startInicisSandbox(env,userA,now)).body.identityVerificationId;
    proof=make;
    const res=await finishInicisSandbox(env,userA,id,now);
    assert.equal(res.status,409);
    assert.equal(res.body.sandboxPassed,false);
    assert.equal(res.body.productionEligibility,false);
  }
  assert.equal(DB.grants.size,0);
});

test('server-verifiable TEST result is consumed without an age grant or personal data',async()=>{
  const id=(await startInicisSandbox(env,userA,now)).body.identityVerificationId;
  proof=id=>({
    id,status:'VERIFIED',
    channel:{key:env.PORTONE_INICIS_SANDBOX_CHANNEL_KEY,type:'TEST'},
    storeId:env.PORTONE_INICIS_SANDBOX_STORE_ID,
    verifiedCustomer:{birthDate:'1980-01-01',name:'TEST_SECRET_NAME',phoneNumber:'01012341234',ci:'TEST_SECRET_CI'}
  });
  const r=await finishInicisSandbox(env,userA,id,now);
  assert.equal(r.status,200);
  assert.equal(r.body.sandboxPassed,true);
  assert.equal(r.body.productionEligibility,false);
  assert.equal(r.body.ageGrantCreated,false);
  assert.ok(!('verified' in r.body));
  assert.equal(DB.grants.size,0);
  assert.equal(DB.attempts.get(id).status,'denied');
  assert.equal((await finishInicisSandbox(env,userA,id,now)).status,409);
  const text=JSON.stringify([...DB.attempts.values(),r.body]);
  for(const value of ['TEST_SECRET_NAME','01012341234','1980-01-01','TEST_SECRET_CI',secret])
    assert.ok(!text.includes(value));
});

test('production gateway rejects sandbox transaction IDs regardless of TEST proof',async()=>{
  const r=await handleAgeVerificationRequest(
    new Request('https://ekodi.kr/api/age-verification/complete',{
      method:'POST', headers:{'content-type':'application/json','authorization':'Bearer user'},
      body:JSON.stringify({site:'singles',identityVerificationId:'ekodi-inicis-sandbox-'+'1'.repeat(32)})
    }),{...env,AGE_VERIFICATION_ENABLED:'false'});
  assert.equal(r.status,503);
  assert.deepEqual(await r.json(),{error:'age_verification_unavailable'});
});

test('admin route guard and sensitive test assets are restricted to the existing age namespace',async()=>{
  const source=await readFile(new URL('../api-worker.js',import.meta.url),'utf8');
  const idx=source.indexOf("const ageSandboxBase =");
  const auth=source.indexOf("if (!auth.session) return auth.response;");
  assert.ok(idx>auth);
  assert.match(source.slice(idx,idx+2400),/super_admin_required/);
  assert.match(source.slice(idx,idx+2400),/origin_not_allowed/);
  const app=await readFile(new URL('../verify/adult/test.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../verify/adult/test.html',import.meta.url),'utf8');
  assert.match(html,/noindex,nofollow,noarchive/);
  assert.match(app,/flgFixedUser: 'N'/);
  assert.match(app,/credentials: 'same-origin'/);
  assert.doesNotMatch(app,/SUPABASE_SERVICE_ROLE_KEY|PORTONE_AGE_API_SECRET|test-verification-raw/);
  const response=await siteWorker.fetch(new Request('https://ekodi.kr/verify/adult/test.html'),
    {ASSETS:{fetch:async()=>new Response(html,{headers:{'content-type':'text/html'}})}});
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal((await siteWorker.fetch(new Request('https://ekodi.kr/verify/adult/other-sandbox.js'),
    {ASSETS:{fetch:async()=>new Response('unexpected')}})).status,404);
});
