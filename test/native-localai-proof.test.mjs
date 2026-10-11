import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {eligibleNativeLocalAiDevice,verifyNativeLocalAi} from '../scripts/verify-native-localai.mjs';

const now=Date.parse('2026-10-11T01:30:00Z');
const device={id:'private-device-id',hostname:'USER3',platform:'Windows 11',status:'online',
  revokedAt:null,management:{source:'agent',type:'pc'},lastSeenAt:new Date(now-5000).toISOString(),
  capabilities:{localAiVerify:true},recentCommands:[]};
const response=data=>new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
test('only fresh enrolled Windows USER3 Agent advertising localAiVerify is eligible',()=>{
  assert.equal(eligibleNativeLocalAiDevice(device,{now}),true);
  for(const variant of [
    {...device,hostname:'USER4'},{...device,revokedAt:'2026-10-11T01:00:00Z'},
    {...device,status:'offline'},{...device,capabilities:{localAiVerify:false}},
    {...device,management:{source:'desktop-commander',type:'pc'}},
    {...device,lastSeenAt:new Date(now-91000).toISOString()}
  ])assert.equal(eligibleNativeLocalAiDevice(variant,{now}),false);
});
test('native USER3 loopback Ollama inference and Windows result are verified with one allowed command',async()=>{
  const calls=[];
  const result={localAiProof:{ollamaApi:'ready',ollamaVersion:'0.40.1',
    selectedModel:'qwen2.5-coder:1.5b',inference:'passed',claudeCli:'not_visible_to_agent',
    credentialCollection:false,executionMode:'fixed_loopback_api'}};
  const fetchImpl=async(url,opts)=>{
    calls.push({url,opts});
    if(opts.method==='POST')return response({command:{id:'cmd-verified',type:'software.localai.verify',status:'queued'}});
    if(calls.some(x=>x.opts.method==='POST'))return response({devices:[{...device,recentCommands:[{id:'cmd-verified',type:'software.localai.verify',status:'succeeded',result,completedAt:new Date(now).toISOString()}]}]});
    return response({devices:[device]});
  };
  const r=await verifyNativeLocalAi({token:'short-lived-admin-token-long-enough',clock:()=>now,fetchImpl,sleepFn:async()=>{},maxPoll:2});
  assert.equal(r.inference,'passed');
  assert.equal(r.ollamaApi,'ready');
  assert.equal(r.receiptStatus,'succeeded');
  assert.equal(r.windowsAgentResponseReceived,true);
  assert.equal(r.cloudAiNodePaired,false);
  assert.equal(r.claudeAuth,'not_checked');
  assert.doesNotMatch(JSON.stringify(r),/private-device-id|short-lived-admin-token/);
  assert.equal(calls.filter(x=>x.opts.method==='POST').length,1);
  assert.equal(calls.filter(x=>x.opts.method==='POST')[0].url,
    'https://ekodi.kr/api/control/devices/private-device-id/commands');
  assert.deepEqual(JSON.parse(calls.find(x=>x.opts.method==='POST').opts.body),
    {type:'software.localai.verify',confirmed:true});
});
test('missing Windows loopback proof cannot pass',async()=>{
  const fakeFetch=async(url,opts)=>{
    if(opts.method==='POST')return response({command:{id:'cmd-bad',type:'software.localai.verify',status:'queued'}});
    return response({devices:[{...device,recentCommands:[{id:'cmd-bad',status:'succeeded',result:{message:'done'}}]}]});
  };
  await assert.rejects(verifyNativeLocalAi({token:'short-lived-admin-token-long-enough',clock:()=>now,fetchImpl:fakeFetch,maxPoll:1}),/native_localai_missing_real_windows_proof/);
});
test('unsupported device and invalid tokens never cause commands',async()=>{
  let requests=0;
  await assert.rejects(verifyNativeLocalAi({token:'',fetchImpl:async()=>{requests++}}),/trusted_admin_session_required/);
  await assert.rejects(verifyNativeLocalAi({token:'trusted-admin-token-long-enough',hostname:'user3/evil',fetchImpl:async()=>{requests++}}),/invalid_target_hostname/);
  assert.equal(requests,0);
  let post=0;
  await assert.rejects(verifyNativeLocalAi({token:'trusted-admin-token-long-enough',clock:()=>now,fetchImpl:async(_url,opts)=>{
    if(opts.method==='POST')post++;
    return response({devices:[{...device,capabilities:{localAiVerify:false}}]});
  }}),/no_healthy_localai_verify_user3_agent/);
  assert.equal(post,0);
});
test('Ollama verification mode stays receipt-gated and never changes scheduled observer behavior',()=>{
  const wf=readFileSync(new URL('../.github/workflows/device-agent-production-verification.yml',import.meta.url),'utf8');
  const release=readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
  assert.ok(wf.includes('- localai'));
  assert.ok(wf.includes("inputs.execution_mode == 'localai'"));
  assert.ok(wf.includes('node scripts/verify-native-localai.mjs'));
  assert.ok(wf.includes('test -n "$EKODI_RELEASE_TASK_ID"'));
  assert.ok(wf.includes('test -n "$EKODI_RELEASE_BRANCH_REF"'));
  assert.ok(release.includes("file==='scripts/verify-native-localai.mjs'"));
  assert.ok(release.includes("execution_mode:'localai'"));
  assert.ok(release.includes("release_branch_ref:branch,release_task_id:taskId"));
});
