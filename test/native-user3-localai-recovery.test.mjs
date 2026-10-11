import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pickHealthyUser3,recoverNativeUser3LocalAi} from '../scripts/recover-native-user3-localai.mjs';

const now=Date.parse('2026-10-11T08:00:00Z');
const base={
 id:'private-pc-id',hostname:'USER3',management:{source:'agent',type:'pc'},platform:'Windows 11',
 status:'online',revokedAt:null,lastSeenAt:new Date(now-2000).toISOString(),
 capabilities:{agentStatus:true,localAiInstall:true,localAiVerify:false},recentCommands:[]
};
const okProof={
 receiptStatus:'succeeded',windowsAgentResponseReceived:true,ollamaApi:'ready',
 inference:'passed',credentialCollection:false,commandType:'software.localai.verify',
 commandId:'cmd-proof',ollamaVersion:'0.40.1',model:'qwen2.5-coder:1.5b'
};
const success=(body)=>new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
test('only fresh registered online Windows USER3 Agent may be upgraded',()=>{
 assert.equal(pickHealthyUser3([base],now)?.id,base.id);
 assert.equal(pickHealthyUser3([{...base,hostname:'user4'}],now),null);
 assert.equal(pickHealthyUser3([{...base,revokedAt:'2026-10-11T07:58:00Z'}],now),null);
 assert.equal(pickHealthyUser3([{...base,management:{source:'desktop-commander',type:'pc'}}],now),null);
 assert.equal(pickHealthyUser3([{...base,lastSeenAt:new Date(now-120000).toISOString()}],now),null);
 assert.equal(pickHealthyUser3([{...base,capabilities:{agentStatus:false}}],now),null);
});
test('no admin token means no API request',async()=>{
 let n=0;await assert.rejects(recoverNativeUser3LocalAi({
 token:'',clock:()=>now,fetchImpl:async()=>{n++;throw Error('unexpected fetch')}
 }),/trusted_admin_session_required/);assert.equal(n,0);
});
test('healthy current agent runs inference proof without unnecessary update',async()=>{
 const calls=[];let verified=0;
 const state={...base,capabilities:{...base.capabilities,localAiVerify:true}};
 const result=await recoverNativeUser3LocalAi({
  token:'temporary-real-admin-session-token',clock:()=>now,
  fetchImpl:async(url,opts)=>{calls.push({url,opts});return success({devices:[state]})},
  verifyFn:async()=>{verified++;return okProof;}
 });
 assert.equal(verified,1);assert.equal(calls.length,1);
 assert.equal(calls[0].opts.method,'GET');
 assert.equal(result.agentAlreadyCurrent,true);
 assert.equal(result.updatePerformed,false);
 assert.equal(result.cloudAiNodePaired,false);
 assert.doesNotMatch(JSON.stringify(result),/private-pc-id|temporary-real-admin-session-token/);
});
test('existing Agent safely self-updates, restarts, then returns real inference proof',async()=>{
 const calls=[];let listNumber=0;
 const token='temporary-real-admin-session-token';
 const result=await recoverNativeUser3LocalAi({
  token,clock:()=>now,sleepFn:async()=>{},maxPoll:5,
  fetchImpl:async(url,opts)=>{
   calls.push({url,opts});
   if(opts.method==='POST')return success({command:{id:'cmd-update',type:'agent.self_update',status:'queued'}});
   listNumber++;
   if(listNumber===1)return success({devices:[base]});
   return success({devices:[{...base,capabilities:{...base.capabilities,localAiVerify:true},
     recentCommands:[{id:'cmd-update',type:'agent.self_update',status:'succeeded'}]}]});
  },
  verifyFn:async()=>okProof
 });
 const post=calls.filter(x=>x.opts.method==='POST');
 assert.equal(post.length,1);
 assert.equal(post[0].url,'https://ekodi.kr/api/control/devices/private-pc-id/commands');
 assert.deepEqual(JSON.parse(post[0].opts.body),{type:'agent.self_update',confirmed:true});
 assert.equal(result.updatePerformed,true);
 assert.equal(result.ollamaApi,'ready');
 assert.equal(result.inference,'passed');
 assert.equal(result.cloudAiNodePaired,false);
 assert.doesNotMatch(JSON.stringify(result),/temporary-real-admin-session-token|private-pc-id/);
});
test('active unrelated command blocks self-update rather than disrupting the user',async()=>{
 const busy={...base,recentCommands:[{id:'cmd-working',type:'computer.browser.execute',status:'claimed'}]};
 let posts=0;
 await assert.rejects(recoverNativeUser3LocalAi({
   token:'temporary-real-admin-session-token',clock:()=>now,
   fetchImpl:async(url,opts)=>{if(opts.method==='POST')posts++;return success({devices:[busy]})},
   verifyFn:async()=>{throw Error('must-not-run')}
 }),/user3_native_agent_busy/);
 assert.equal(posts,0);
});
test('failed updater cannot claim success or proceed with Ollama inference',async()=>{
 let gets=0,proofs=0;
 await assert.rejects(recoverNativeUser3LocalAi({
  token:'temporary-real-admin-session-token',clock:()=>now,maxPoll:3,sleepFn:async()=>{},
  fetchImpl:async(url,opts)=>{
   if(opts.method==='POST')return success({command:{type:'agent.self_update',id:'cmd-fail',status:'queued'}});
   gets++;
   if(gets===1)return success({devices:[base]});
   return success({devices:[{...base,recentCommands:[{id:'cmd-fail',status:'failed'}]}]});
  },
  verifyFn:async()=>{proofs++;return okProof}
 }),/user3_agent_selfupdate_failed/);
 assert.equal(proofs,0);
});
test('official workflow and converger dispatch only receipt-approved recovery mode',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/device-agent-production-verification.yml',import.meta.url),'utf8');
 const converger=readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
 assert.ok(workflow.includes("- user3-upgrade-localai"));
 assert.ok(workflow.includes("inputs.execution_mode == 'user3-upgrade-localai'"));
 assert.ok(workflow.includes("node scripts/recover-native-user3-localai.mjs"));
 assert.ok(workflow.includes("test -n \"$EKODI_RELEASE_BRANCH_REF\""));
 assert.ok(workflow.includes("test -n \"$EKODI_RELEASE_TASK_ID\""));
 assert.ok(workflow.includes('validate-ekodi-ai-change-orchestration.mjs\" --release'));
 assert.ok(converger.includes("file==='scripts/recover-native-user3-localai.mjs'"));
 assert.ok(converger.includes("execution_mode:'user3-upgrade-localai'"));
 assert.ok(converger.includes("release_branch_ref:branch,release_task_id:taskId"));
});
