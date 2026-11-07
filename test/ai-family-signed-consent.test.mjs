import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {canonicalFamilyConsentPayload,createSignedFamilyConsentVerifier} from '../tools/ekodi-device-agent/windows/ai-family-signed-consent.mjs';
const NOW=Date.parse('2026-11-07T08:00:00Z');
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const claim={ok:true,jobId:'hyb_12345678-1234-4234-8234-123456789abc',requestKey:'a'.repeat(64),provider:'codex-cli'};
const consent=()=>({
 version:'ekodi-ai-family-consent-v1',nonce:'abcdefghijklmno123456789XYZ',
 jobId:claim.jobId,deviceId:'device-1',requestKey:claim.requestKey,provider:'codex-cli',
 enabled:true,readOnly:true,nonElevatedVerified:true,deviceIdVerified:true,
 authMethod:'oauth_token',verifiedAt:new Date(NOW-2000).toISOString(),expiresAt:new Date(NOW+100000).toISOString(),
 nodeExecutable:'C:\\Program Files\\nodejs\\node.exe',nodeExecutableSha256:'b'.repeat(64),
 cliScriptPath:'C:\\Users\\user\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js',
 cliScriptSha256:'a'.repeat(64),readOnlyWorkspace:'C:\\EKODI\\readonly',binaryHashVerified:true,
});
const signConsent=x=>({...x,signature:sign(null,Buffer.from(canonicalFamilyConsentPayload(x)),privateKey).toString('base64url')});
test('real Ed25519 signature binds the exact consent and prevents replay',async()=>{
 const seen=new Set();const verify=createSignedFamilyConsentVerifier({publicKey,clock:()=>NOW,consumeNonce:async nonce=>{if(seen.has(nonce))return false;seen.add(nonce);return true}});
 const signed=signConsent(consent());
 assert.equal(await verify(signed,{claim,deviceId:'device-1'}),true);
 assert.equal(await verify(signed,{claim,deviceId:'device-1'}),false);
 assert.equal(seen.size,1);
});
test('tampering and wrong device are refused without consuming nonce',async()=>{
 const seen=[];const verify=createSignedFamilyConsentVerifier({publicKey,clock:()=>NOW,consumeNonce:async nonce=>{seen.push(nonce);return true}});
 const signed=signConsent(consent());
 assert.equal(await verify({...signed,cliScriptPath:'C:\\unknown\\hack.js'},{claim,deviceId:'device-1'}),false);
 assert.equal(await verify(signed,{claim,deviceId:'device-2'}),false);
 assert.equal(seen.length,0);
});
test('invalid expiry, authentication and incomplete fields fail closed',async()=>{
 const verify=createSignedFamilyConsentVerifier({publicKey,clock:()=>NOW,consumeNonce:async()=>true});
 const expired=consent();expired.expiresAt=new Date(NOW-1).toISOString();
 const api=consent();api.authMethod='api_key';
 const long=consent();long.expiresAt=new Date(NOW+700000).toISOString();
 for(const bad of [expired,api,long])assert.equal(await verify(signConsent(bad),{claim,deviceId:'device-1'}),false);
 const missing=consent();delete missing.readOnly;
 assert.equal(canonicalFamilyConsentPayload(missing),null);
 assert.equal(await verify({...missing,signature:'invalid'},{claim,deviceId:'device-1'}),false);
});
test('missing public key and unavailable durable nonce store fail closed',async()=>{
 const absent=createSignedFamilyConsentVerifier({clock:()=>NOW,consumeNonce:async()=>true});
 assert.equal(await absent(signConsent(consent()),{claim,deviceId:'device-1'}),false);
 const broken=createSignedFamilyConsentVerifier({publicKey,clock:()=>NOW,consumeNonce:async()=>{throw Error('DB unavailable')}});
 assert.equal(await broken(signConsent(consent()),{claim,deviceId:'device-1'}),false);
});
