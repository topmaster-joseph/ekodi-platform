import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {createNativeFamilyRunner,NATIVE_RUNNER_POLICY} from '../tools/ekodi-device-agent/windows/ai-family-native-runner.mjs';
const NOW=Date.parse('2026-11-07T01:00:00Z');
const SHA=createHash('sha256').update('trusted CLI contents').digest('hex');
const NODE='C:\\Program Files\\nodejs\\node.exe';
const SCRIPT='C:\\Users\\user\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js';
const task=(id='hyb_12345678-1234-4234-8234-123456789abc')=>({
  id,type:'ai.family.codex',issuedAt:new Date(NOW-60000).toISOString(),
  claimedAt:new Date(NOW-1000).toISOString(),leaseExpiresAt:new Date(NOW+120000).toISOString(),attempt:1,
  payload:{prompt:'Prepare a concise plan',requestKey:'a'.repeat(64),costKrw:0,lane:'node:codex',timeoutMs:180000},
});
const approval={enabled:true,nonElevatedVerified:true,deviceIdVerified:true,authMethod:'oauth_token',provider:'codex-cli',readOnly:true,
 verifiedAt:new Date(NOW-10000).toISOString(),jobId:'hyb_12345678-1234-4234-8234-123456789abc',deviceId:'device-1',requestKey:'a'.repeat(64),nodeExecutable:NODE,cliScriptPath:SCRIPT,readOnlyWorkspace:'C:\\EKODI\\readonly',
 cliScriptSha256:SHA,nodeExecutableSha256:SHA,binaryHashVerified:true};
function fakeChild(onSpawn){const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin={end(x){child.stdinSent=x},on(){}};child.kill=()=>{};child.pid=1012;
  queueMicrotask(()=>onSpawn?.(child));return child;}
function fixture(overrides={}){
  const calls=[];
  const d={platform:'win32',now:()=>NOW,
    getSignedConsent:async({claim,deviceId})=>({...approval,jobId:claim.jobId,deviceId,requestKey:claim.requestKey}),verifySignedConsent:async()=>true,
    isNonElevatedWindowsUser:async()=>true,verifyCliOAuth:async()=>true,
    renewLease:async()=>({ok:true,leaseExpiresAt:new Date(NOW+120000).toISOString()}),
    readFile:async()=>Buffer.from('trusted CLI contents'),
    terminateProcessTree:async()=>true,
    spawn:(exe,args,opts)=>{calls.push({exe,args,opts});return fakeChild(child=>{child.stdout.emit('data','response');child.emit('close',0,null);})},
    env:{OPENAI_API_KEY:'secret',ANTHROPIC_API_KEY:'secret',PATH:'C:\\Program Files\\nodejs'},...overrides};
  return {runner:createNativeFamilyRunner(d),calls};
}
test('off-by-default and no privileged/paid API broker path', async()=>{
  assert.equal(NATIVE_RUNNER_POLICY.enabledByDefault,false);
  assert.equal(NATIVE_RUNNER_POLICY.paidApiBudgetKrw,0);
  const missing=createNativeFamilyRunner({platform:'win32',now:()=>NOW});
  assert.equal((await missing.run(task(),{deviceId:'d'})).code,'TRUSTED_BROKER_NOT_CONNECTED');
  const wrong=createNativeFamilyRunner({platform:'linux',now:()=>NOW});
  assert.equal((await wrong.run(task(),{deviceId:'d'})).code,'WINDOWS_USER_MODE_REQUIRED');
});
test('read-only native CLI runs only after consent, hash, oauth and lease checks', async()=>{
  const {runner,calls}=fixture();const result=await runner.run(task(),{deviceId:'device-1'});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.receipt.output,'response');
  assert.equal(result.receipt.costKrw,0);
  assert.equal(result.receipt.deviceId,'device-1');
  assert.equal(calls.length,1);
  assert.equal(calls[0].opts.shell,false);
  assert.equal(calls[0].opts.detached,false);
  assert.equal('OPENAI_API_KEY' in calls[0].opts.env,false);
  assert.equal('ANTHROPIC_API_KEY' in calls[0].opts.env,false);
});
test('non-elevated identity, signed consent, valid hash, oauth and lease are mandatory',async()=>{
  const mutations=[
   [{isNonElevatedWindowsUser:async()=>false},'ELEVATED_IDENTITY_FORBIDDEN'],
   [{verifySignedConsent:async()=>false},'SIGNED_CONSENT_REQUIRED'],
   [{readFile:async()=>Buffer.from('tampered')},'EXECUTABLE_HASH_MISMATCH'],
   [{verifyCliOAuth:async()=>false},'OAUTH_SUBSCRIPTION_UNVERIFIED'],
   [{renewLease:async()=>({ok:false})},'LEASE_FENCE_REJECTED'],
  ];
  for(const [overrides,reason] of mutations){const {runner,calls}=fixture(overrides);const result=await runner.run(task(),{deviceId:'d'});assert.equal(result.code,reason,reason);assert.equal(calls.length,0,reason);}
});
test('duplicate in-flight work is rejected even when a lane slot exists',async()=>{
  let finish;
  const {runner}=fixture({spawn:()=>fakeChild(child=>{finish=()=>{child.stdout.emit('data','x');child.emit('close',0,null)}})});
  const first=runner.run(task(),{deviceId:'d'});
  await new Promise(r=>setImmediate(r));
  assert.equal(runner.activeCount(),1);
  const duplicate=await runner.run(task(),{deviceId:'d'});
  assert.equal(duplicate.code,'DUPLICATE_NATIVE_JOB');
  finish();assert.equal((await first).ok,true);assert.equal(runner.activeCount(),0);
});
test('runner rejects failed process and limits returned output',async()=>{
  const {runner}=fixture({spawn:()=>fakeChild(child=>{child.stderr.emit('data','secret-token');child.emit('close',2,null)})});
  const r=await runner.run(task(),{deviceId:'d'});
  assert.equal(r.code,'NATIVE_CLI_FAILURE');
});
test('a consent grant for a different job or device is rejected',async()=>{
  const {runner,calls}=fixture({getSignedConsent:async()=>({...approval,jobId:'hyb_different',deviceId:'d',requestKey:'a'.repeat(64)})});
  const result=await runner.run(task(),{deviceId:'d'});
  assert.equal(result.code,'CONSENT_JOB_BINDING_MISMATCH');
  assert.equal(calls.length,0);
});
test('after-run lease failure discards otherwise valid CLI text',async()=>{
  let count=0;
  const {runner,calls}=fixture({renewLease:async()=>({ok:++count===1,leaseExpiresAt:new Date(NOW+120000).toISOString()})});
  const result=await runner.run(task(),{deviceId:'d'});
  assert.equal(calls.length,1);
  assert.equal(result.code,'LEASE_FENCE_REJECTED');
});
test('failed heartbeat terminates a running CLI without reporting success',async()=>{
  let count=0;
  let terminated=0;
  const {runner}=fixture({heartbeatIntervalMs:50,
    renewLease:async()=>({ok:++count===1,leaseExpiresAt:new Date(NOW+120000).toISOString()}),
    spawn:()=>fakeChild(()=>{}),terminateProcessTree:async()=>{terminated++;return true},
  });
  const result=await Promise.race([
    runner.run(task(),{deviceId:'d'}),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('hang')),800)),
  ]);
  assert.equal(result.code,'LEASE_FENCE_REJECTED');
  assert.equal(terminated,1);
  assert.equal(runner.activeCount(),0);
});
test('a user cancellation terminates a running CLI and never returns a receipt',async()=>{
  const aborter=new AbortController();let terminated=0;
  const {runner}=fixture({spawn:()=>fakeChild(()=>{}),terminateProcessTree:async()=>{terminated++;return true;}});
  const promise=runner.run(task(),{deviceId:'d',signal:aborter.signal});
  await new Promise(resolve=>setImmediate(resolve));
  aborter.abort();
  const result=await Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('hang')),800))]);
  assert.equal(result.code,'ABORTED');
  assert.equal(terminated,1);
});
test('oversized output is terminated before a result can be accepted',async()=>{
  let terminated=0;
  const {runner}=fixture({
    spawn:()=>fakeChild(child=>{child.stdout.emit('data','x'.repeat(50000));}),
    terminateProcessTree:async()=>{terminated++;return true;},
  });
  const result=await Promise.race([runner.run(task(),{deviceId:'d'}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('hang')),800))]);
  assert.equal(result.code,'OUTPUT_LIMIT_REACHED');
  assert.equal(terminated,1);
});
test('per device and model maximum is two jobs',async()=>{
  const finish=[];
  const {runner}=fixture({spawn:()=>fakeChild(child=>{finish.push(()=>{child.stdout.emit('data','result');child.emit('close',0,null)})})});
  const first=runner.run(task('hyb_12345678-1234-4234-8234-123456789abc'),{deviceId:'d'});
  const second=runner.run(task('hyb_22345678-1234-4234-8234-123456789abc'),{deviceId:'d'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(runner.activeCount(),2);
  const third=await runner.run(task('hyb_32345678-1234-4234-8234-123456789abc'),{deviceId:'d'});
  assert.equal(third.code,'LOCAL_LANE_SATURATED');
  finish.forEach(fn=>fn());
  assert.equal((await first).ok,true);
  assert.equal((await second).ok,true);
});
