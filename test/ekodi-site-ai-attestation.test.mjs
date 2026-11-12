import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {canonicalSiteAiHeartbeat,SITE_AI_HEARTBEAT_CONTRACT,verifySiteAiHeartbeatCandidate} from '../ekodi-site-ai-attestation.js';
const now=Date.parse('2026-11-12T02:00:00.000Z');
const hb={contract:SITE_AI_HEARTBEAT_CONTRACT,siteId:'ekodi-church',workspaceId:'workspace:church',agentId:'agent:church',keyId:'key-2026-11',sequence:9,
 nonce:'k9eY-U98vSY32kQNlSfKwmF3kwY',issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+59000).toISOString(),
 capabilityIds:['site-ai:heartbeat']};
const keys=await webcrypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
const pub=new Uint8Array(await webcrypto.subtle.exportKey('raw',keys.publicKey));
const registration={source:'ekodi_authoritative_site_agent_registry',active:true,revoked:false,workspaceMembershipVerified:true,
 grantedByAuthorizedPersonVerified:true,role:'site_ai',siteId:hb.siteId,workspaceId:hb.workspaceId,
 agentId:hb.agentId,keyId:hb.keyId,capabilityIds:['site-ai:heartbeat'],publicKeyRaw:pub,leaseExpiresAt:new Date(now+90000).toISOString()};
const b64url=bytes=>Buffer.from(bytes).toString('base64url');
const sign=async payload=>({payload,signature:b64url(new Uint8Array(await webcrypto.subtle.sign('Ed25519',keys.privateKey,new TextEncoder().encode(canonicalSiteAiHeartbeat(payload)))))});
const basic=await sign(hb);
const verify=(signed=basic,changes={},options={})=>verifySiteAiHeartbeatCandidate(signed,{registration:{...registration,...changes},nowMs:now,previousSequence:8,noncePreviouslySeen:false,cryptoImpl:webcrypto,...options});

test('signed scope evidence returns candidate but never work authorization or live status',async()=>{
 const r=await verify();assert.equal(r.ok,true);assert.equal(r.cryptographicEvidenceVerified,true);
 assert.equal(r.siteAiLiveStatusEligible,false);assert.equal(r.executionAuthorized,false);
 assert.equal(r.atomicReplayCommitRequired,true);assert.equal(r.automaticPaidApiBudgetKrw,0);
});
test('cross-site replay and workspace mismatch fail closed',async()=>{
 assert.equal((await verify(basic,{siteId:'another-site'})).reason,'identity_scope_mismatch');
 assert.equal((await verify(basic,{workspaceId:'workspace:other'})).reason,'identity_scope_mismatch');
});
test('agent id and key id mismatches deny',async()=>{
 assert.equal((await verify(basic,{agentId:'agent:other'})).reason,'identity_scope_mismatch');
 assert.equal((await verify(basic,{keyId:'key-other'})).reason,'identity_scope_mismatch');
});
test('caller supplied trust cannot become authoritative',async()=>{
 assert.equal((await verify(basic,{source:'client'})).reason,'untrusted_registration');
});
test('workspace membership and granting person are mandatory',async()=>{
 assert.equal((await verify(basic,{workspaceMembershipVerified:false})).reason,'untrusted_registration');
 assert.equal((await verify(basic,{grantedByAuthorizedPersonVerified:false})).reason,'untrusted_registration');
});
test('revoked expired and wrong-role agents cannot attest',async()=>{
 assert.equal((await verify(basic,{revoked:true})).reason,'untrusted_registration');
 assert.equal((await verify(basic,{role:'viewer'})).reason,'untrusted_registration');
 assert.equal((await verify(basic,{leaseExpiresAt:new Date(now).toISOString()})).reason,'registration_lease_expired');
});
test('no escalation beyond verified capabilities',async()=>{
 assert.equal((await verify(basic,{capabilityIds:['other:read']})).reason,'capability_scope_mismatch');
});
test('sequence and nonce replays blocked',async()=>{
 assert.equal((await verify(basic,{}, {previousSequence:9})).reason,'replay_sequence');
 assert.equal((await verify(basic,{}, {noncePreviouslySeen:true})).reason,'replay_nonce_unverified');
});
test('tampering with signed content rejects signature',async()=>{
 assert.equal((await verify({...basic,payload:{...hb,sequence:10}})).reason,'signature_mismatch');
});
test('unexpected unsigned fields or invalid signatures denied',async()=>{
 assert.equal((await verify({payload:{...hb,isSuperAdmin:true},signature:basic.signature})).reason,'unexpected_or_missing_field');
 assert.equal((await verify({payload:hb,signature:'abc'})).reason,'invalid_signature');
});
test('future stale and expired heartbeats denied',async()=>{
 const future={...hb,issuedAt:new Date(now+30000).toISOString(),expiresAt:new Date(now+60000).toISOString()};
 const stale={...hb,issuedAt:new Date(now-150000).toISOString(),expiresAt:new Date(now-100000).toISOString()};
 assert.equal((await verify(await sign(future))).reason,'stale_or_future_heartbeat');
 assert.equal((await verify(await sign(stale))).reason,'stale_or_future_heartbeat');
});
test('different signing key is rejected',async()=>{
 const other=await webcrypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
 const alt=new Uint8Array(await webcrypto.subtle.exportKey('raw',other.publicKey));
 assert.equal((await verify(basic,{publicKeyRaw:alt})).reason,'signature_mismatch');
});
test('invalid timestamp sequence capability and nonce fail canonicalization',()=>{
 assert.throws(()=>canonicalSiteAiHeartbeat({...hb,sequence:0}),/invalid_sequence/);
 assert.throws(()=>canonicalSiteAiHeartbeat({...hb,nonce:'short'}),/invalid_nonce/);
 assert.throws(()=>canonicalSiteAiHeartbeat({...hb,capabilityIds:['site-ai:heartbeat','site-ai:heartbeat']}),/invalid_capabilities/);
 assert.throws(()=>canonicalSiteAiHeartbeat({...hb,expiresAt:new Date(now+300000).toISOString()}),/invalid_timestamps/);
});
