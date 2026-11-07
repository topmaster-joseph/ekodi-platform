import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {createFamilyConsentIssuer,FAMILY_CONSENT_ISSUER_POLICY} from '../tools/ekodi-device-agent/windows/ai-family-consent-issuer.mjs';
import {createDurableFamilyNonceConsumer,FAMILY_CONSENT_NONCE_SCHEMA,pruneExpiredFamilyNonces} from '../tools/ekodi-device-agent/windows/ai-family-durable-nonce.mjs';
import {createSignedFamilyConsentVerifier} from '../tools/ekodi-device-agent/windows/ai-family-signed-consent.mjs';

const NOW=Date.parse('2026-11-07T13:50:00Z');
const jobId='hyb_12345678-1234-4234-8234-123456789abc';
const deviceId='device-1';
const requestKey='a'.repeat(64);
const nonce=randomBytes(24).toString('base64url');
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const claim=Object.freeze({
  ok:true,jobId,requestKey,provider:'codex-cli',deadlineMs:NOW+180000,
});
const trustedRuntime={
  provider:'codex-cli',readOnly:true,nonElevatedVerified:true,
  oauthSubscriptionVerified:true,binaryHashVerified:true,
  nodeExecutable:'C:\\Program Files\\nodejs\\node.exe',
  nodeExecutableSha256:'b'.repeat(64),
  cliScriptPath:'C:\\Users\\user\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js',
  cliScriptSha256:'a'.repeat(64),readOnlyWorkspace:'C:\\EKODI\\readonly',
};
const approvedBroker=()=>({
  enabled:true,clock:()=>NOW,randomNonce:()=>nonce,
  requestUserPresence:async intent=>({type:'os-attested-user-gesture',jobId:intent.jobId}),
  verifyUserPresence:async(proof,intent)=>proof.type==='os-attested-user-gesture'&&proof.jobId===intent.jobId,
  signWithUserProtectedKey:async bytes=>sign(null,bytes,privateKey),
});

// A single test fake represents a shared persistent backing store. It mimics
// the atomic UNIQUE(nonce) constraint and offers a restart from the same data.
function fakeDurableDb(){
  const consumed=new Map();
  return {
    consumed,
    prepare(sql){
      assert.match(sql,/ai_family_consumed_nonces/);
      return {bind(...values){
        return {async run(){
          if(/INSERT INTO/.test(sql)){
            const [key,job,device,at]=values;
            if(consumed.has(key)||[...consumed.values()].some(row=>row.job===job))return {meta:{changes:0}};
            consumed.set(key,{job,device,at});
            return {meta:{changes:1}};
          }
          if(/DELETE FROM/.test(sql)){
            const cutoff=values[0],before=consumed.size;
            for(const [key,entry] of consumed)if(entry.at<cutoff)consumed.delete(key);
            return {meta:{changes:before-consumed.size}};
          }
          throw Error('UNEXPECTED_SQL');
        }};
      }};
    },
  };
}

test('consent issuer is inert unless explicitly enabled with OS broker and signer',async()=>{
  assert.equal(FAMILY_CONSENT_ISSUER_POLICY.enabledByDefault,false);
  const disabled=createFamilyConsentIssuer(approvedBroker());
  const result=await disabled.issue({claim,deviceId,trustedRuntime});
  assert.equal(result.code,'CONSENT_ISSUANCE_DISABLED');
  const absent=createFamilyConsentIssuer({enabled:true});
  assert.equal((await absent.issue({claim,deviceId,trustedRuntime})).code,'TRUSTED_USER_BROKER_UNAVAILABLE');
});

test('genuine Ed25519 consent issuer and verifier bind one job, device and request key',async()=>{
  const issuer=createFamilyConsentIssuer(approvedBroker());
  const result=await issuer.issue({claim,deviceId,trustedRuntime});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.approval.jobId,jobId);
  assert.equal(result.approval.deviceId,deviceId);
  assert.equal(result.approval.provider,'codex-cli');
  assert.equal(result.approval.expiresAt,new Date(claim.deadlineMs).toISOString());
  const db=fakeDurableDb();
  const verify=createSignedFamilyConsentVerifier({
    publicKey,clock:()=>NOW,consumeNonce:createDurableFamilyNonceConsumer(db,{clock:()=>NOW}),
  });
  assert.equal(await verify(result.approval,{claim,deviceId}),true);
  assert.equal(await verify(result.approval,{claim,deviceId}),false,'replay must fail');
  assert.equal(db.consumed.size,1);
  const anotherNonce=randomBytes(24).toString('base64url');
  assert.equal(await createDurableFamilyNonceConsumer(db,{clock:()=>NOW})(anotherNonce,{jobId,deviceId}),false,'a different signed nonce cannot restart an already-consumed job');
});

test('same durable nonce store rejects racing consent consumers across restarts',async()=>{
  const issuer=createFamilyConsentIssuer(approvedBroker());
  const result=await issuer.issue({claim,deviceId,trustedRuntime});
  const db=fakeDurableDb();
  const fresh=()=>createSignedFamilyConsentVerifier({
    publicKey,clock:()=>NOW,consumeNonce:createDurableFamilyNonceConsumer(db,{clock:()=>NOW}),
  });
  const [a,b]=await Promise.all([
    fresh()(result.approval,{claim,deviceId}),
    fresh()(result.approval,{claim,deviceId}),
  ]);
  assert.equal(Number(a)+Number(b),1);
  assert.equal(await fresh()(result.approval,{claim,deviceId}),false);
});

test('spoofed OS consent, expired job, paid API capability and wrong scope fail closed',async()=>{
  const badOS=createFamilyConsentIssuer({...approvedBroker(),verifyUserPresence:async()=>false});
  assert.equal((await badOS.issue({claim,deviceId,trustedRuntime})).code,'USER_PRESENCE_NOT_VERIFIED');
  const dead=createFamilyConsentIssuer({...approvedBroker(),clock:()=>NOW+300001});
  assert.equal((await dead.issue({claim,deviceId,trustedRuntime})).code,'JOB_EXPIRED');
  for(const bad of [
    {...trustedRuntime,readOnly:false},
    {...trustedRuntime,oauthSubscriptionVerified:false},
    {...trustedRuntime,provider:'openai-api'},
    {...trustedRuntime,nodeExecutable:'cmd.exe'},
  ]){
    assert.equal((await createFamilyConsentIssuer(approvedBroker()).issue({claim,deviceId,trustedRuntime:bad})).ok,false);
  }
});

test('nonce consumer rejects missing/unavailable DB and malformed contexts without fallback',async()=>{
  const missing=createDurableFamilyNonceConsumer(null,{clock:()=>NOW});
  assert.equal(await missing(nonce,{jobId,deviceId}),false);
  const db=fakeDurableDb();
  const consume=createDurableFamilyNonceConsumer(db,{clock:()=>NOW});
  assert.equal(await consume('invalid',{jobId,deviceId}),false);
  assert.equal(await consume(nonce,{jobId:'evil',deviceId}),false);
  assert.equal(await consume(nonce,{jobId,deviceId}),true);
  assert.equal(await consume(nonce,{jobId,deviceId}),false);
  const unavailable=createDurableFamilyNonceConsumer({prepare(){throw Error('disk offline');}});
  assert.equal(await unavailable(randomBytes(24).toString('base64url'),{jobId,deviceId}),false);
});

test('nonce schema requires primary-key uniqueness and cleanup only after 24h',async()=>{
  assert.match(FAMILY_CONSENT_NONCE_SCHEMA,/nonce TEXT PRIMARY KEY NOT NULL/);
  assert.match(FAMILY_CONSENT_NONCE_SCHEMA,/UNIQUE INDEX IF NOT EXISTS idx_ai_family_consumed_nonces_job/);
  const db=fakeDurableDb();
  const consume=createDurableFamilyNonceConsumer(db,{clock:()=>NOW});
  assert.equal(await consume(nonce,{jobId,deviceId}),true);
  assert.equal((await pruneExpiredFamilyNonces(db,{clock:()=>NOW+600000})).deleted,0);
  assert.equal((await pruneExpiredFamilyNonces(db,{clock:()=>NOW+25*60*60*1000})).deleted,1);
  assert.equal(db.consumed.size,0);
});

test('optional real SQLite smoke test exercises ON CONFLICT atomic uniqueness',async t=>{
  let sqlite;
  try{sqlite=await import('node:sqlite');}catch{return t.skip('node:sqlite not installed on this runtime');}
  const database=new sqlite.DatabaseSync(':memory:');
  try{
    database.exec(FAMILY_CONSENT_NONCE_SCHEMA);
    const adapter={
      prepare(sql){
        const stmt=database.prepare(sql);
        return {
          bind(...args){
            return {
              async run(){
                const result=stmt.run(...args);
                return {meta:{changes:Number(result.changes)}};
              },
            };
          },
        };
      },
    };
    const first=createDurableFamilyNonceConsumer(adapter,{clock:()=>NOW});
    const second=createDurableFamilyNonceConsumer(adapter,{clock:()=>NOW});
    assert.equal((await first(nonce,{jobId,deviceId})),true);
    assert.equal((await second(nonce,{jobId,deviceId})),false);
    assert.equal((await second(randomBytes(24).toString('base64url'),{jobId,deviceId})),false,'SQLite job-id unique index must also fence distinct nonces');
  }finally{database.close();}
});
