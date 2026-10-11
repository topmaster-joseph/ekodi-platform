import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverNativeUser4Browser} from '../scripts/recover-native-user4-browser.mjs';

const now=Date.parse('2026-10-11T09:10:00.000Z');
const good={id:'user4-device-id',hostname:'USER4',platform:'Windows 11',
  status:'online',revokedAt:null,management:{source:'agent',type:'pc'},
  capabilities:{agentStatus:true,localAiVerify:true},
  lastSeenAt:new Date(now-1000).toISOString(),recentCommands:[]};

test('only exact USER4 receives transactional Agent update and acceptance runs after reconnect',async()=>{
  let updated=false,requests=0,verified=false;
  const fetchImpl=async(url,init)=>{
    requests++;
    if(init.method==='POST'){
      assert.equal(url,'https://ekodi.kr/api/control/devices/user4-device-id/commands');
      assert.deepEqual(JSON.parse(init.body),{type:'agent.self_update',confirmed:true});
      updated=true;
      return new Response(JSON.stringify({command:{id:'refresh-4',type:'agent.self_update',status:'queued'}}),{status:200});
    }
    const receipt=updated?[{id:'refresh-4',type:'agent.self_update',status:'succeeded',
      completedAt:new Date(now-2000).toISOString()}]:[];
    return new Response(JSON.stringify({devices:[
      {...good,lastSeenAt:new Date(now-1000).toISOString(),recentCommands:receipt}
    ]}),{status:200});
  };
  const acceptanceFn=async()=>{
    verified=true;
    return {ok:true,targetAlias:'user4',browserVerified:true,localAiVerified:true};
  };
  const result=await recoverNativeUser4Browser({token:'trusted-admin-auth-token-abcdef',
    fetchImpl,clock:()=>now,sleepFn:async()=>{},maxPoll:2,acceptanceFn});
  assert.equal(result.ok,true);
  assert.equal(result.agentUpdate.commandId,'refresh-4');
  assert.equal(result.agentUpdate.targetAlias,'user4');
  assert.equal(verified,true);
  assert.equal(requests>=3,true);
});
test('USER3 cannot substitute for offline or missing USER4; no command posted',async()=>{
  let writes=0;
  const fetchImpl=async(_,init)=>{
    if(init.method==='POST')writes++;
    return new Response(JSON.stringify({devices:[{...good,hostname:'USER3'}]}),{status:200});
  };
  await assert.rejects(()=>recoverNativeUser4Browser({
    token:'trusted-admin-auth-token-abcdef',fetchImpl
  }),/user4_native_agent_not_healthy/);
  assert.equal(writes,0);
});
test('update failure cannot proceed to CDP or local AI execution',async()=>{
  let command=false,acceptance=false;
  const fetchImpl=async(_,init)=>{
    if(init.method==='POST'){
      command=true;
      return new Response(JSON.stringify({command:{id:'fail',type:'agent.self_update',status:'queued'}}),{status:200});
    }
    const recentCommands=command?[{id:'fail',type:'agent.self_update',status:'failed'}]:[];
    return new Response(JSON.stringify({devices:[{...good,recentCommands}]}),{status:200});
  };
  await assert.rejects(()=>recoverNativeUser4Browser({
    token:'trusted-admin-auth-token-abcdef',fetchImpl,
    clock:()=>now,sleepFn:async()=>{},maxPoll:2,
    acceptanceFn:async()=>{acceptance=true;}
  }),/user4_agent_update_failed/);
  assert.equal(acceptance,false);
});
test('latest healthy heartbeat must occur AFTER update completion',async()=>{
  let command=false,acceptance=false;
  const fetchImpl=async(_,init)=>{
    if(init.method==='POST'){
      command=true;
      return new Response(JSON.stringify({command:{id:'up',type:'agent.self_update',status:'queued'}}),{status:200});
    }
    return new Response(JSON.stringify({devices:[{
      ...good,lastSeenAt:new Date(now-5000).toISOString(),
      recentCommands:command?[{id:'up',type:'agent.self_update',status:'succeeded',
        completedAt:new Date(now-1000).toISOString()}]:[]
    }]}),{status:200});
  };
  await assert.rejects(()=>recoverNativeUser4Browser({
    token:'trusted-admin-auth-token-abcdef',fetchImpl,
    clock:()=>now,sleepFn:async()=>{},maxPoll:2,
    acceptanceFn:async()=>{acceptance=true;}
  }),/user4_agent_update_or_reconnect_timeout/);
  assert.equal(acceptance,false);
});
test('final acceptance fails closed without independent USER4 browser and Ollama proofs',async()=>{
  let command=false;
  const fetchImpl=async(_,init)=>{
    if(init.method==='POST'){
      command=true;
      return new Response(JSON.stringify({command:{id:'up',type:'agent.self_update',status:'queued'}}),{status:200});
    }
    return new Response(JSON.stringify({devices:[{
      ...good,lastSeenAt:new Date(now-1000).toISOString(),
      recentCommands:command?[{id:'up',type:'agent.self_update',status:'succeeded',
        completedAt:new Date(now-2000).toISOString()}]:[]
    }]}),{status:200});
  };
  const result=await recoverNativeUser4Browser({
    token:'trusted-admin-auth-token-abcdef',fetchImpl,
    clock:()=>now,sleepFn:async()=>{},maxPoll:2,
    acceptanceFn:async()=>({ok:true,targetAlias:'user4',browserVerified:true,localAiVerified:false})
  });
  assert.equal(result.ok,false);
});
