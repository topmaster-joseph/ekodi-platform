import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createNativeFamilyConsentBroker} from '../tools/ekodi-device-agent/windows/ai-family-consent-broker.mjs';
const NOW=Date.parse('2026-11-07T13:50:00Z');
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const claim={ok:true,jobId:'hyb_12345678-1234-4234-8234-123456789abc',
  requestKey:'a'.repeat(64),provider:'codex-cli',deadlineMs:NOW+180000};
const deviceId='device-1';
const trustedRuntime={
  provider:'codex-cli',readOnly:true,nonElevatedVerified:true,
  oauthSubscriptionVerified:true,binaryHashVerified:true,
  nodeExecutable:'C:\\Program Files\\nodejs\\node.exe',
  nodeExecutableSha256:'b'.repeat(64),
  cliScriptPath:'C:\\Users\\user\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js',
  cliScriptSha256:'a'.repeat(64),readOnlyWorkspace:'C:\\EKODI\\readonly',
};
function durableFake(){
  const nonceSet=new Set(),jobSet=new Set();
  return {prepare(sql){assert.match(sql,/ai_family_consumed_nonces/);
    return {bind(nonce,jobId,device,at){return {async run(){
      if(nonceSet.has(nonce)||jobSet.has(jobId))return {meta:{changes:0}};
      nonceSet.add(nonce);jobSet.add(jobId);return {meta:{changes:1}};
    }};}};}};
}
function make({enabled=true,db=durableFake(),osVerified=true}={}){
  return createNativeFamilyConsentBroker({
    enabled,publicKey,durableNonceDb:db,clock:()=>NOW,
    randomNonce:()=> 'abcdefghijklmnopqrstuvwxyz012345',
    resolveTrustedRuntime:async()=>trustedRuntime,
    requestUserPresence:async intent=>({id:intent.jobId,from:'user-presence-test'}),
    verifyUserPresence:async proof=>osVerified&&proof?.from==='user-presence-test',
    signWithUserProtectedKey:async bytes=>sign(null,bytes,privateKey),
  });
}
test('adapter stays inert unless enabled with independently trusted providers',async()=>{
  const broker=make({enabled:false});
  assert.equal(await broker.getSignedConsent({claim,deviceId}),null);
  assert.equal(await broker.verifySignedConsent({}, {claim,deviceId}),false);
  const absent=make({db:null});
  assert.equal(await absent.getSignedConsent({claim,deviceId}),null);
  assert.equal(await absent.verifySignedConsent({}, {claim,deviceId}),false);
});
test('broker emits real Ed25519 consent and consumes its nonce once',async()=>{
  const broker=make();
  const signed=await broker.getSignedConsent({claim,deviceId});
  assert.ok(signed?.signature);
  assert.equal(signed.jobId,claim.jobId);
  assert.equal(signed.deviceId,deviceId);
  assert.equal(signed.authMethod,'oauth_token');
  assert.equal(await broker.verifySignedConsent(signed,{claim,deviceId}),true);
  assert.equal(await broker.verifySignedConsent(signed,{claim,deviceId}),false);
});
test('tampered signature cannot consume consent and wrong device cannot reuse it',async()=>{
  const broker=make();
  const signed=await broker.getSignedConsent({claim,deviceId});
  assert.equal(await broker.verifySignedConsent({...signed,cliScriptSha256:'c'.repeat(64)},{claim,deviceId}),false);
  assert.equal(await broker.verifySignedConsent(signed,{claim,deviceId:'device-2'}),false);
  assert.equal(await broker.verifySignedConsent(signed,{claim,deviceId}),true);
});
test('independent OS approval denial prevents any signed consent from being issued',async()=>{
  const broker=make({osVerified:false});
  assert.equal(await broker.getSignedConsent({claim,deviceId}),null);
});
