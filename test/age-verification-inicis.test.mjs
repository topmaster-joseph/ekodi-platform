import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAgeVerificationRequest, ageVerificationAdminSnapshot } from '../age-verification-core.js';

const U = '11111111-1111-4111-8111-111111111111';
const V = '22222222-2222-4222-8222-222222222222';
const ROOT = 'https://ekodi.kr/api/age-verification';
const envBase = {
  AGE_VERIFICATION_ENABLED: 'true',
  AGE_VERIFICATION_SITE_POLICIES: '{"singles":"civil_adult_19","ekodimall":"youth_protection_19"}',
  AGE_VERIFICATION_SITE_PROVIDERS: '{"singles":"kg-inicis-unified"}',
  AGE_VERIFICATION_INICIS_CONTRACT_APPROVED: 'true',
  PORTONE_AGE_STORE_ID: 'store-abc12345',
  PORTONE_AGE_CHANNEL_KEY: 'channel-key-legacy12345',
  PORTONE_INICIS_AGE_CHANNEL_KEY: 'channel-key-inicis12345',
  PORTONE_AGE_API_SECRET: 'never-show-provider-secret',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'anon-test'
};

class FakeD1 {
  constructor() { this.attempts = new Map(); this.grants = new Map(); }
  prepare(sql) {
    const db = this;
    return { bind(...args) {
      return {
        async first() {
          if (sql.startsWith('SELECT name FROM sqlite_master')) return { name: 'age_verification_attempts' };
          if (sql.startsWith('SELECT COUNT(*)')) return { total: [...db.attempts.values()].filter(a => a.user === args[0] && a.created > args[1]).length };
          if (sql.startsWith('SELECT status,expires_at FROM age_verification_attempts')) {
            const a=db.attempts.get(args[0]);
            return a && a.user === args[1] && a.site === args[2] && a.policy === args[3]
              ? { status:a.status, expires_at:a.expires } : null;
          }
          if (sql.startsWith('SELECT expires_at,attempt_id FROM age_verification_grants')) {
            const grant=db.grants.get([args[0],args[1],args[2]].join(':'));
            return grant && grant.expires > args[3] ? {expires_at:grant.expires,attempt_id:grant.attemptId}:null;
          }
          throw Error('Unexpected first: '+sql);
        },
        async run() {
          if (sql.startsWith('INSERT INTO age_verification_attempts')) {
            const [id,user,site,policy,status,created,expires]=args;
            const count=[...db.attempts.values()].filter(a => a.user===user && a.created > args.at(-1)).length;
            if(count>=5)return {meta:{changes:0}};
            db.attempts.set(id,{id,user,site,policy,status,created,expires});
            return {meta:{changes:1}};
          }
          if (sql.startsWith('INSERT INTO age_verification_grants')) {
            const [at,expires,id,user,expected,stamp]=args;
            const attempt=db.attempts.get(id);
            if(!attempt || attempt.user!==user || attempt.status!==expected || attempt.expires<=stamp)return {meta:{changes:0}};
            db.grants.set([user,attempt.site,attempt.policy].join(':'),{at,expires,attemptId:id});
            return {meta:{changes:1}};
          }
          if (sql.startsWith('UPDATE age_verification_attempts')) {
            const [next,at,id,user,prior,stamp]=args,a=db.attempts.get(id);
            if(!a || a.user!==user || a.status!==prior || a.expires<=stamp)return {meta:{changes:0}};
            a.status=next; return {meta:{changes:1}};
          }
          if(sql.startsWith('DELETE FROM'))return {meta:{changes:0}};
          throw Error('Unexpected run: '+sql);
        }
      };
    }};
  }
  async batch(commands){const output=[];for(const c of commands)output.push(await c.run());return output;}
}
const DB = new FakeD1();
const env = {...envBase, DB};
const makeRequest=(path,body,token='example')=>new Request(ROOT+path,{
  method:body?'POST':'GET',
  headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
});
let current = U, proof, fetchCalls=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async (url, options) => {
  fetchCalls.push(String(url));
  if(String(url).endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:current}));
  if(String(url).startsWith('https://api.portone.io/identity-verifications/')) {
    assert.equal(options?.headers?.authorization, 'PortOne never-show-provider-secret');
    return new Response(JSON.stringify(proof?.(String(url).split('/').at(-1)) || {status:'READY'}));
  }
  throw Error('Unexpected network: '+url);
};
test.after(()=>{globalThis.fetch=originalFetch;});
const call=async (path,body,user=U,environment=env)=>{
  current=user;const res=await handleAgeVerificationRequest(makeRequest(path,body),environment);
  return {status:res.status,body:await res.json()};
};

test('KG channel stays disabled until explicit contract flag and channel exist', async()=>{
  for(const override of [
    {AGE_VERIFICATION_ENABLED:'false'},
    {AGE_VERIFICATION_INICIS_CONTRACT_APPROVED:'false'},
    {PORTONE_INICIS_AGE_CHANNEL_KEY:''},
    {PORTONE_AGE_API_SECRET:''},
    {AGE_VERIFICATION_SITE_PROVIDERS:'{"singles":"unknown"}'},
    {AGE_VERIFICATION_SITE_PROVIDERS:'not json'},
  ]) {
    const r=await call('/config?site=singles',undefined,U,{...env,...override});
    assert.equal(r.status,200);assert.deepEqual(r.body,{enabled:false});
  }
  const enabled=await call('/config?site=singles');
  assert.equal(enabled.body.enabled,true);
  assert.equal(enabled.body.provider,'kg-inicis-unified');
  assert.equal(enabled.body.channelKey,env.PORTONE_INICIS_AGE_CHANNEL_KEY);
  assert.equal(enabled.body.policy,'civil_adult_19');
  assert.equal(JSON.stringify(enabled.body).includes('never-show-provider-secret'),false);
  const legacy=await call('/config?site=ekodimall');
  assert.equal(legacy.body.provider,'portone-v2');
  assert.equal(legacy.body.channelKey,env.PORTONE_AGE_CHANNEL_KEY);
});

test('KG initiation is server selected and transaction ID binds to provider', async()=>{
  const start=await call('/start',{site:'singles'});
  assert.equal(start.status,201);
  assert.match(start.body.identityVerificationId,/^ekodi-inicis-[0-9a-f]{32}$/);
  assert.equal(start.body.provider,'kg-inicis-unified');
  assert.equal(DB.attempts.get(start.body.identityVerificationId).user,U);
  assert.equal((await call('/start',{site:'singles',provider:'portone-v2'})).status,400);
  assert.equal((await call('/start',{site:'singles',age:50})).status,400);
});

test('verified provider proof must match exact LIVE channel key, no TEST or missing channels',async()=>{
  const fixtures=[
    id=>({id,status:'VERIFIED',channel:{key:'channel-key-wrong',type:'LIVE'},verifiedCustomer:{birthDate:'1980-01-01'}}),
    id=>({id,status:'VERIFIED',channel:{key:env.PORTONE_INICIS_AGE_CHANNEL_KEY,type:'TEST'},verifiedCustomer:{birthDate:'1980-01-01'}}),
    id=>({id,status:'VERIFIED',channel:{key:env.PORTONE_INICIS_AGE_CHANNEL_KEY},verifiedCustomer:{birthDate:'1980-01-01'}}),
    id=>({id,status:'VERIFIED',channel:{type:'LIVE'},verifiedCustomer:{birthDate:'1980-01-01'}}),
    id=>({id,status:'VERIFIED',channel:{key:env.PORTONE_INICIS_AGE_CHANNEL_KEY,type:'LIVE'},storeId:'store-somebody-else',verifiedCustomer:{birthDate:'1980-01-01'}}),
  ];
  for(const fixture of fixtures){
    const a=(await call('/start',{site:'singles'})).body.identityVerificationId;
    proof=fixture;
    const res=await call('/complete',{site:'singles',identityVerificationId:a});
    assert.equal(res.status,502);
    assert.equal(res.body.error,'provider_context_mismatch');
  }
  assert.equal((await call('/status?site=singles')).body.verified,false);
});

test('verified live KG proof mints an isolated grant without retaining personal fields',async()=>{
  const id=(await call('/start',{site:'singles'},V)).body.identityVerificationId;
  proof=id=>({
    id,status:'VERIFIED',channel:{key:env.PORTONE_INICIS_AGE_CHANNEL_KEY,type:'LIVE'},
    storeId:env.PORTONE_AGE_STORE_ID,
    verifiedCustomer:{birthDate:'1980-01-01',name:'never-store-name',phoneNumber:'01098765432',ci:'never-store-ci'}
  });
  assert.equal((await call('/complete',{site:'singles',identityVerificationId:id},U)).status,404);
  assert.equal((await call('/complete',{site:'ekodimall',identityVerificationId:id},V)).status,400);
  const complete=await call('/complete',{site:'singles',identityVerificationId:id},V);
  assert.equal(complete.status,200);
  assert.equal(complete.body.verified,true);
  assert.equal((await call('/status?site=singles',undefined,V)).body.verified,true);
  assert.equal((await call('/status?site=ekodimall',undefined,V)).body.verified,false);
  assert.equal((await call('/complete',{site:'singles',identityVerificationId:id},V)).status,409);
  const dbDump=JSON.stringify([...DB.attempts.values(),...DB.grants.values()]);
  for(const forbidden of ['1980-01-01','01098765432','never-store-name','never-store-ci'])assert.ok(!dbDump.includes(forbidden));
});

test('provider switch invalidates old grant and blocks outstanding cross-provider proof',async()=>{
  const switched={...env,AGE_VERIFICATION_SITE_PROVIDERS:'{"singles":"portone-v2"}'};
  const state=await call('/status?site=singles',undefined,V,switched);
  assert.equal(state.body.verified,false);
  assert.equal(state.body.expiresAt,null);
  const id=(await call('/start',{site:'singles'},U)).body.identityVerificationId;
  const rejected=await call('/complete',{site:'singles',identityVerificationId:id},U,switched);
  assert.equal(rejected.status,400);
  assert.equal((await call('/status?site=singles')).body.verified,false);
});

test('failed or underage results cannot yield a KG grant',async()=>{
  const id=(await call('/start',{site:'singles'},U)).body.identityVerificationId;
  proof=tx=>({id:tx,status:'READY',channel:{key:env.PORTONE_INICIS_AGE_CHANNEL_KEY,type:'LIVE'},verifiedCustomer:{birthDate:'1980-01-01'}});
  assert.equal((await call('/complete',{site:'singles',identityVerificationId:id})).status,409);
  proof=tx=>({id:tx,status:'VERIFIED',channel:{key:env.PORTONE_INICIS_AGE_CHANNEL_KEY,type:'LIVE'},verifiedCustomer:{birthDate:'2011-01-01'}});
  const denied=await call('/complete',{site:'singles',identityVerificationId:id});
  assert.equal(denied.status,403);
  assert.equal(denied.body.verified,false);
  assert.equal((await call('/status?site=singles')).body.verified,false);
});

test('administrative readiness reports KG per-site without credentials or identity data',async()=>{
  const report=await ageVerificationAdminSnapshot(env);
  assert.equal(report.siteProviders.singles,'kg-inicis-unified');
  assert.equal(report.siteProviders.ekodimall,'portone-v2');
  assert.equal(report.siteReadiness.singles,true);
  assert.equal(report.providerConfigured,true);
  const raw=JSON.stringify(report);
  assert.ok(!raw.includes('never-show-provider-secret'));
  assert.ok(!raw.includes('channel-key-inicis12345'));
  const unapproved=await ageVerificationAdminSnapshot({...env,AGE_VERIFICATION_INICIS_CONTRACT_APPROVED:'false'});
  assert.equal(unapproved.siteReadiness.singles,false);
});
