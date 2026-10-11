import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyNativeAgentStatus} from '../scripts/verify-native-agent-status.mjs';

const now=Date.parse('2026-10-11T00:20:00.000Z');
const device={
  id:'secret-device-123',hostname:'USER3',platform:'Windows 11',status:'online',
  revokedAt:null,management:{source:'agent',type:'pc'},
  lastSeenAt:new Date(now-5000).toISOString(),
  capabilities:{agentStatus:true},recentCommands:[]
};
const ok=data=>new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});

test('bounded USER3 agent status command gets genuine Windows result receipt',async()=>{
  const calls=[];
  const fetchImpl=async(url,init)=>{
    calls.push({url,init});
    if(calls.length===1)return ok({devices:[device]});
    if(calls.length===2)return ok({command:{id:'cmd-status-123',type:'computer.agent.status',status:'queued'}});
    return ok({devices:[{...device,recentCommands:[{
      id:'cmd-status-123',type:'computer.agent.status',status:'succeeded',
      completedAt:new Date(now).toISOString(),result:{message:'Agent reported status',agent:{version:'2.5.2'}}
    }]}]});
  };
  const result=await verifyNativeAgentStatus({token:'short-lived-super-admin-token',hostname:'user3',now:()=>now,fetchImpl,maxPoll:1});
  assert.equal(result.receiptStatus,'succeeded');
  assert.equal(result.windowsAgentResponseReceived,true);
  assert.equal(result.deviceHeartbeatHealthy,true);
  assert.equal(result.commandType,'computer.agent.status');
  assert.equal(calls.length,3);
  assert.equal(calls[0].init.method,'GET');
  assert.equal(calls[1].init.method,'POST');
  const body=JSON.parse(calls[1].init.body);
  assert.deepEqual(body,{type:'computer.agent.status',confirmed:true});
  assert.ok(calls[1].url.endsWith('/api/control/devices/secret-device-123/commands'));
  assert.doesNotMatch(JSON.stringify(result),/secret-device-123|short-lived-super-admin-token/);
});

test('USER3 must be a recent native enrolled Windows agent with status capability',async()=>{
  for(const change of [
    {hostname:'USER4'},{status:'offline'},{lastSeenAt:new Date(now-90001).toISOString()},
    {management:{source:'desktop-commander',type:'pc'}},{revokedAt:'2026-10-10T00:00:00Z'},
    {capabilities:{agentStatus:false}},{platform:'Linux'}
  ]){
    const calls=[];
    const fetchImpl=async(url,init)=>{calls.push({url,method:init.method});return ok({devices:[{...device,...change}]});};
    await assert.rejects(verifyNativeAgentStatus({token:'short-lived-super-admin-token',now:()=>now,fetchImpl}),/no_healthy_eligible_user3_agent/);
    assert.equal(calls.length,1);
    assert.equal(calls[0].method,'GET');
  }
});

test('status proof cannot silently accept a queue entry or a fabricated result',async()=>{
  let count=0;
  const fetchImpl=async()=>{
    count++;
    if(count===1)return ok({devices:[device]});
    if(count===2)return ok({command:{id:'cmd-1',type:'computer.agent.status',status:'queued'}});
    return ok({devices:[{...device,recentCommands:[{id:'cmd-1',status:'succeeded',result:{message:'not a Windows Agent result'}}]}]});
  };
  await assert.rejects(verifyNativeAgentStatus({token:'short-lived-super-admin-token',now:()=>now,fetchImpl,maxPoll:1}),/native_agent_status_no_windows_result/);
});

test('receipt-gated status mode is separated from automatic read-only observation',()=>{
  const w=readFileSync(new URL('../.github/workflows/device-agent-production-verification.yml',import.meta.url),'utf8');
  const conv=readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
  assert.ok(w.includes("- status"));
  assert.ok(w.includes("inputs.execution_mode == 'status'"));
  assert.ok(w.includes('node scripts/verify-native-agent-status.mjs'));
  assert.ok(w.includes('test -n "$EKODI_RELEASE_TASK_ID"'));
  assert.ok(w.includes('test -n "$EKODI_RELEASE_BRANCH_REF"'));
  assert.ok(conv.includes("file==='scripts/verify-native-agent-status.mjs'"));
  assert.ok(conv.includes("execution_mode:'status'"));
  assert.ok(conv.includes("release_branch_ref:branch,release_task_id:taskId"));
});
