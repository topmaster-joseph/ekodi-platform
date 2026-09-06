import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPersonalAiBridgeSnapshot,
  canonicalAiSubject,
  personalAiSubjectCandidates,
  resolveCanonicalEkodiIdentity,
} from '../personal-ai-bridge.js';

test('linked login identities converge on one canonical Personal AI subject',()=>{
  const google={authUserId:'google-auth',personId:'person-1',ekodiId:'EKODI-ABC'};
  const apple={authUserId:'apple-auth',personId:'person-1',ekodiId:'EKODI-ABC'};
  assert.equal(canonicalAiSubject(google),'person:person-1');
  assert.equal(canonicalAiSubject(apple),'person:person-1');
  assert.deepEqual(personalAiSubjectCandidates(google),['person:person-1','google-auth']);
});

test('bridge snapshot keeps AI router automatic and MCP consent explicit',()=>{
  const bridge=buildPersonalAiBridgeSnapshot({authUserId:'auth-1',personId:'person-1',ekodiId:'EKODI-ABC',loginProvider:'google'});
  assert.equal(bridge.providerIndependent,true);
  assert.equal(bridge.forward.automatic,true);
  assert.equal(bridge.forward.coreFirst,true);
  assert.equal(bridge.reverse.gateway,'ekodi-mcp');
  assert.equal(bridge.reverse.requiresFirstConnectionConsent,true);
});
test('canonical identity resolver projects Supabase login onto EKODI Person',async()=>{
  const identity=await resolveCanonicalEkodiIdentity({
    token:'token',authUser:{id:'auth-1',email:'USER@example.com'},
    fetchImpl:async()=>new Response(JSON.stringify({
      canonical:true,person_id:'person-1',ekodi_id:'EKODI-ABC',login_provider:'apple',
    }),{status:200,headers:{'content-type':'application/json'}}),
    supabaseUrl:'https://example.supabase.co',publishableKey:'publishable',
  });
  assert.equal(identity.authUserId,'auth-1');
  assert.equal(identity.email,'user@example.com');
  assert.equal(identity.personId,'person-1');
  assert.equal(identity.ekodiId,'EKODI-ABC');
  assert.equal(identity.subjectKey,'person:person-1');
});

test('resolver falls back without merging identities by email',async()=>{
  const identity=await resolveCanonicalEkodiIdentity({
    token:'token',authUser:{id:'auth-legacy',email:'same@example.com'},
    fetchImpl:async()=>new Response('{}',{status:404}),supabaseUrl:'https://example.supabase.co',publishableKey:'publishable',
  });
  assert.equal(identity.canonical,false);
  assert.equal(identity.subjectKey,'auth:auth-legacy');
  assert.deepEqual(personalAiSubjectCandidates(identity),['auth:auth-legacy','auth-legacy']);
});

test('MCP identity resolution uses the least-privilege OAuth RPC',async()=>{
  let requested='';
  const identity=await resolveCanonicalEkodiIdentity({
    token:'token',authUser:{id:'auth-1',email:'user@example.com'},oauthMcp:true,
    fetchImpl:async url=>{requested=String(url);return new Response(JSON.stringify({
      authenticated:true,authorized:true,canonical:true,person_id:'person-1',ekodi_id:'EKODI-ABC',login_provider:'google',
    }),{status:200,headers:{'content-type':'application/json'}})},
    supabaseUrl:'https://example.supabase.co',publishableKey:'publishable',
  });
  assert.match(requested,/\/rest\/v1\/rpc\/current_ekodi_mcp_identity$/);
  assert.equal(identity.authorized,true);
  assert.equal(identity.subjectKey,'person:person-1');
});
