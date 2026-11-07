import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createHash,generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {createWindowsNativeFamilySidecar} from '../tools/ekodi-device-agent/windows/ai-family-windows-sidecar.mjs';
import {createNativeFamilyConsentBroker} from '../tools/ekodi-device-agent/windows/ai-family-consent-broker.mjs';
import {AI_FAMILY_SIDECAR_POLICY} from '../tools/ekodi-device-agent/windows/ai-family-sidecar-contract.mjs';
import {NATIVE_RUNNER_POLICY} from '../tools/ekodi-device-agent/windows/ai-family-native-runner.mjs';

const NOW=Date.parse('2026-11-07T13:50:00Z');
const JOB='hyb_12345678-1234-4234-8234-123456789abc';
const PATH_NODE='C:\\Program Files\\nodejs\\node.exe';
const PATH_SCRIPT='C:\\Users\\user\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js';
const PATH_WORKSPACE='C:\\EKODI\\readonly';
const EXEC_BYTES=Buffer.from('trusted immutable test executable');
const EXEC_SHA=createHash('sha256').update(EXEC_BYTES).digest('hex');
const requestKey='a'.repeat(64);
const command=()=>({
  id:JOB,type:'ai.family.codex',issuedAt:new Date(NOW-60000).toISOString(),
  claimedAt:new Date(NOW-10000).toISOString(),
  leaseExpiresAt:new Date(NOW+120000).toISOString(),attempt:1,
  payload:{prompt:'Describe one read-only code test',lane:'node:codex',requestKey,
    costKrw:0,timeoutMs:180000},
});

// Fake durable SQLite behavior: globally atomic UNIQUE(nonce) + UNIQUE(job_id).
// Each new sidecar uses this same store; it is not the production database.
function durableStore(){
  const nonces=new Set(),jobs=new Set();
  return {prepare(sql){
    assert.match(sql,/INSERT INTO ai_family_consumed_nonces/);
    return {bind(nonce,job){
      return {async run(){
        if(nonces.has(nonce)||jobs.has(job))return {meta:{changes:0}};
        nonces.add(nonce);jobs.add(job);
        return {meta:{changes:1}};
      }};
    }};
  }};
}
function fakeChild({output='',exit=0,hold=false}={}){
  const child=new EventEmitter();
  child.stdout=new EventEmitter();
  child.stderr=new EventEmitter();
  child.pid=9021;child.kill=()=>true;
  child.stdin={end(value){child.prompt=value;},on(){}};
  if(!hold)queueMicrotask(()=>{
    child.stdout.emit('data',Buffer.from(output));
    child.emit('close',exit,null);
  });
  return child;
}
function makeHarness({
  store=durableStore(),
  elevated=false,
  osApproval=true,
  oauthText='Logged in using ChatGPT',
  badBinary=false,
  tamperConsent=false,
  leaseFailAfter=Infinity,
  holdOutput=false,
}={}){
  const events={preflight:[],model:[],lease:0,stops:0};
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const trustedRuntime={
    provider:'codex-cli',readOnly:true,nonElevatedVerified:true,
    oauthSubscriptionVerified:true,binaryHashVerified:true,
    nodeExecutable:PATH_NODE,nodeExecutableSha256:EXEC_SHA,
    cliScriptPath:PATH_SCRIPT,cliScriptSha256:EXEC_SHA,
    readOnlyWorkspace:PATH_WORKSPACE,
  };
  const broker=createNativeFamilyConsentBroker({
    enabled:true,publicKey,durableNonceDb:store,clock:()=>NOW,
    randomNonce:()=>randomBytes(24).toString('base64url'),
    resolveTrustedRuntime:async()=>trustedRuntime,
    requestUserPresence:async intent=>({testGesture:true,jobId:intent.jobId}),
    verifyUserPresence:async(proof,intent)=>osApproval===true&&proof.testGesture&&proof.jobId===intent.jobId,
    signWithUserProtectedKey:async data=>sign(null,data,privateKey),
  });
  const trustedBroker=tamperConsent
    ? {...broker,getSignedConsent:async args=>{
      const signed=await broker.getSignedConsent(args);
      return signed?{...signed,cliScriptSha256:'c'.repeat(64)}:null;
    }}
    : broker;
  const runner=createWindowsNativeFamilySidecar({
    broker:trustedBroker,
    leaseClient:{renewLease:async()=>({
      ok:++events.lease<=leaseFailAfter,
      leaseExpiresAt:new Date(NOW+120000).toISOString(),
    })},
    preflightOptions:{
      platform:'win32',
      env:{SYSTEMROOT:'C:\\Windows',PATH:'C:\\Program Files\\nodejs',
        ANTHROPIC_API_KEY:'secret-not-for-child'},
      spawn:(exe,args,opts)=>{
        events.preflight.push({exe,args,opts});
        if(exe.toLowerCase().endsWith('powershell.exe'))
          return fakeChild({output:elevated?'DENIED':'NON_ELEVATED'});
        if(exe.toLowerCase().endsWith('taskkill.exe')){
          events.stops++;
          return fakeChild({output:''});
        }
        if(exe.toLowerCase().endsWith('node.exe')&&args.includes('login'))
          return fakeChild({output:oauthText});
        return fakeChild({output:'DENIED',exit:1});
      },
    },
    runnerOptions:{
      platform:'win32',
      now:()=>NOW,
      env:{PATH:'C:\\Program Files\\nodejs',SYSTEMROOT:'C:\\Windows',
        OPENAI_API_KEY:'never-disclose',ANTHROPIC_API_KEY:'never-disclose',
        EKODI_DEVICE_TOKEN:'never-disclose'},
      readFile:async()=>badBinary?Buffer.from('tampered binary'):EXEC_BYTES,
      spawn:(exe,args,opts)=>{
        events.model.push({exe,args,opts});
        return fakeChild({output:'read-only AI result',hold:holdOutput});
      },
    },
  });
  return {runner,events,broker};
}

test('complete synthetic Windows user-mode path issues Ed25519 consent, fences lease and returns read-only receipt',async()=>{
  const h=makeHarness();
  const result=await h.runner.run(command(),{deviceId:'device-1'});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.receipt.jobId,JOB);
  assert.equal(result.receipt.deviceId,'device-1');
  assert.equal(result.receipt.output,'read-only AI result');
  assert.equal(result.receipt.executor,'codex-cli');
  assert.equal(result.receipt.costKrw,0);
  assert.equal(h.events.lease,2,'one fresh lease before start and another before receipt');
  assert.equal(h.events.model.length,1);
  assert.equal(h.events.model[0].opts.shell,false);
  assert.equal(h.events.model[0].opts.detached,false);
  assert.ok(h.events.model[0].args.includes('read-only'));
  assert.equal('OPENAI_API_KEY' in h.events.model[0].opts.env,false);
  assert.equal('ANTHROPIC_API_KEY' in h.events.model[0].opts.env,false);
  assert.equal('EKODI_DEVICE_TOKEN' in h.events.model[0].opts.env,false);
  assert.equal(h.runner.activeCount(),0);
});
test('feature is still OFF by default and cannot start without an independent broker',async()=>{
  assert.equal(AI_FAMILY_SIDECAR_POLICY.autoEnabled,false);
  assert.equal(NATIVE_RUNNER_POLICY.enabledByDefault,false);
  const sidecar=createWindowsNativeFamilySidecar({
    preflightOptions:{platform:'win32'},
    runnerOptions:{platform:'win32',now:()=>NOW},
  });
  assert.equal((await sidecar.run(command(),{deviceId:'device-1'})).code,'TRUSTED_BROKER_NOT_CONNECTED');
});
test('two separate sidecars cannot execute a shared signed job twice',async()=>{
  const store=durableStore();
  const one=makeHarness({store}),two=makeHarness({store});
  const results=await Promise.all([
    one.runner.run(command(),{deviceId:'device-1'}),
    two.runner.run(command(),{deviceId:'device-2'}),
  ]);
  assert.equal(results.filter(x=>x.ok).length,1,JSON.stringify(results));
  assert.equal(results.filter(x=>x.code==='SIGNED_CONSENT_REQUIRED').length,1);
  assert.equal(one.events.model.length+two.events.model.length,1);
});
test('preflight OS privilege, user consent, provider billing and signature tampering all block process spawn',async()=>{
  for(const [kind,settings,code] of [
    ['privilege',{elevated:true},'ELEVATED_IDENTITY_FORBIDDEN'],
    ['approval',{osApproval:false},'SIGNED_CONSENT_REQUIRED'],
    ['api-key',{oauthText:'Logged in using an API key'},'OAUTH_SUBSCRIPTION_UNVERIFIED'],
    ['tamper',{tamperConsent:true},'SIGNED_CONSENT_REQUIRED'],
    ['binary',{badBinary:true},'EXECUTABLE_HASH_MISMATCH'],
  ]){
    const h=makeHarness(settings);
    const result=await h.runner.run(command(),{deviceId:'device-1'});
    assert.equal(result.code,code,kind+': '+JSON.stringify(result));
    assert.equal(h.events.model.length,0,kind);
  }
});
test('lease failure after output discards the result and never issues a verified receipt',async()=>{
  const h=makeHarness({leaseFailAfter:1});
  const result=await h.runner.run(command(),{deviceId:'device-1'});
  assert.equal(result.code,'LEASE_FENCE_REJECTED');
  assert.equal(h.events.model.length,1);
  assert.equal(h.events.lease,2);
});
test('user cancellation of synthetic child ends its process tree and never sends a success receipt',async()=>{
  const h=makeHarness({holdOutput:true});
  const abort=new AbortController();
  const running=h.runner.run(command(),{deviceId:'device-1',signal:abort.signal});
  for(let i=0;i<10&&h.events.model.length===0;i++)
    await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.events.model.length,1);
  await new Promise(resolve=>setImmediate(resolve));
  abort.abort();
  const outcome=await Promise.race([
    running,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('synthetic abort hung')),1500)),
  ]);
  assert.equal(outcome.code,'ABORTED');
  assert.equal(h.events.stops,1);
  assert.equal(h.runner.activeCount(),0);
});
