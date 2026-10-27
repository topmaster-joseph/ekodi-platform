import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SOCIAL_IDENTITY_PROVIDERS,socialIdentityPolicy,handleSocialIdentityControl } from '../social-identity-control.js';
import { handleExternalAccountControl } from '../external-account-control.js';

const endpoint='https://ekodi.kr/api/control/external-accounts/social-identities';
const actor={userId:'ekodi-user-1',email:'member@example.test',superAdmin:false};
const superAdmin={...actor,superAdmin:true};

test('social identity feature is disabled by default and never enables social login or posting',()=>{
  assert.deepEqual(socialIdentityPolicy({}),{
    registrationEnabled:false,oauthLinkingEnabled:false,socialLoginEnabled:false,
    autoPublishingEnabled:false,manualActivationRequired:true
  });
  const ids=SOCIAL_IDENTITY_PROVIDERS.map(item=>item.id);
  for(const provider of ['youtube','facebook','instagram','threads','naver','kakao','tiktok','x','linkedin','pinterest','bluesky','discord','telegram'])
    assert.ok(ids.includes(provider));
});

test('unverified request is denied, regardless of feature flag',async()=>{
  const response=await handleSocialIdentityControl(new Request(endpoint,{method:'POST'}),{EKODI_SOCIAL_IDENTITY_REGISTRATION_ENABLED:'true'},null);
  assert.equal(response.status,401);
});

test('registration is fail-closed with no write or provider network call',async()=>{
  let writes=0;
  const env={DB:{prepare(){writes++;throw new Error('should never run')}}};
  const response=await handleSocialIdentityControl(new Request(endpoint,{method:'POST',body:JSON.stringify({provider:'instagram',providerAccountId:'myhandle'})}),env,actor);
  assert.equal(response.status,423);
  assert.equal((await response.json()).error,'social_identity_registration_disabled');
  assert.equal(writes,0);
});

test('private accounts cannot query the platform-wide inventory',async()=>{
  const response=await handleSocialIdentityControl(new Request(endpoint+'?scope=all'),{},actor);
  assert.equal(response.status,403);
});

test('admin inventory discloses state truthfully and does not count legacy channels as new links',async()=>{
  const env={DB:{prepare(){return {all:async()=>({results:[]})}}}};
  const response=await handleSocialIdentityControl(new Request(endpoint+'?scope=all'),env,superAdmin,{
    existing:[{source:'channel',provider:'instagram',providerAccountId:'ig-1',status:'active',displayName:'IG channel',workspaceSlug:'church'}]
  });
  const body=await response.json();
  assert.equal(body.storageReady,true);
  assert.equal(body.policy.registrationEnabled,false);
  assert.equal(body.providers.find(x=>x.id==='instagram').registered,0);
  assert.equal(body.providers.find(x=>x.id==='instagram').existingService,1);
  assert.equal(body.existingServiceConnections[0].source,'existing_service');
  assert.ok(!('credential' in body.existingServiceConnections[0]));
});

test('even with the server registration switch enabled, arbitrary active statuses and secrets are rejected',async()=>{
  const env={EKODI_SOCIAL_IDENTITY_REGISTRATION_ENABLED:'true',DB:{prepare(){throw new Error('no writes expected')}}};
  for(const payload of [
    {provider:'instagram',providerAccountId:'hello',status:'active'},
    {provider:'instagram',providerAccountId:'hello',access_token:'leak'},
    {provider:'instagram',providerAccountId:'hello',ekodiUserId:'other-user'}
  ]){
    const response=await handleSocialIdentityControl(new Request(endpoint,{method:'POST',body:JSON.stringify(payload)}),env,actor);
    assert.equal(response.status,400);
  }
});

test('schema and routing preserve account sovereignty and existing protected API entry',()=>{
  const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
  const migration=read('migrations/202610280700_social_account_links.sql');
  const route=read('external-account-control.js');
  const menu=read('admin-menu-registry.js');
  const routing=read('admin-canonical-routes.js');
  const registry=read('admin-menu-registry.js');
  assert.match(migration,/UNIQUE\(ekodi_user_id,provider,provider_account_id\)/);
  assert.doesNotMatch(migration,/access_token|refresh_token|client_secret|password|credential_ciphertext/i);
  assert.match(route,/handleSocialIdentityControl/);
  assert.match(menu,/id: 'social-accounts'/);
  assert.match(routing,/'social-accounts':'accounts'/);
  assert.match(registry,/import\('\.\/social-account-admin\.js'\)/);
});


test('if later enabled, registration always binds the verified EKODI ID and remains unverified',async()=>{
  const sql=[],params=[],batches=[];
  const db={
    prepare(statement){sql.push(statement);return {bind(...values){params.push(values);return {statement,values}}}},
    async batch(statements){batches.push(statements);return [{success:true},{success:true}]}
  };
  const env={EKODI_SOCIAL_IDENTITY_REGISTRATION_ENABLED:'true',DB:db};
  const request=new Request(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
    provider:'instagram',providerAccountId:'my.verified.later',displayName:'Account holder'
  })});
  const response=await handleSocialIdentityControl(request,env,actor);
  const body=await response.json();
  assert.equal(response.status,201);
  assert.equal(body.status,'pending_provider_verification');
  assert.equal(body.oauthLinked,false);
  assert.equal(body.autoPublishingEnabled,false);
  assert.equal(params[0][1],actor.userId);
  assert.ok(batches[0].length===2);
  assert.match(sql[0],/pending_provider_verification/);
  assert.ok(!JSON.stringify(params).includes('access_token'));
});

test('verified EKODI admin session can see all social account status without Supabase user token',async()=>{
  let attemptedWrite=0;
  const env={DB:{prepare(sql){
    if(sql.includes('FROM sessions'))return {bind(){return {first:async()=>({
      email:'owner@example.test',role:'super_admin',expires_at:'2099-01-01T00:00:00.000Z'
    })}}};
    return {all:async()=>({results:[]}),bind(){return {all:async()=>({results:[]})}},run(){attemptedWrite++;throw new Error('unexpected write')}};
  }}};
  const res=await handleExternalAccountControl(new Request(endpoint+'?scope=all',{
    headers:{authorization:'Bearer active-ekodi-admin-session'}
  }),env);
  const body=await res.json();
  assert.equal(res.status,200);
  assert.equal(body.ownerScope,'platform');
  assert.equal(body.policy.registrationEnabled,false);
  assert.equal(attemptedWrite,0);
});

test('the EKODI admin-session inventory exception never authorizes social registrations',async()=>{
  const env={EKODI_SOCIAL_IDENTITY_REGISTRATION_ENABLED:'true',DB:{
    prepare(sql){if(sql.includes('FROM sessions'))throw new Error('admin login must not be used for POST');
      return {all:async()=>({results:[]})}}
  }};
  const res=await handleExternalAccountControl(new Request(endpoint,{
    method:'POST',headers:{authorization:'Bearer admin-only-token','content-type':'application/json'},
    body:JSON.stringify({provider:'instagram',providerAccountId:'account'})
  }),env);
  assert.equal(res.status,401);
});
