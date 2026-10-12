import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ensureUser4EditionProbeAgent,USER4_EDITION_PROBE_CUTOVER} from '../scripts/ensure-user4-edition-probe-agent.mjs';

const now=Date.parse('2026-10-12T12:00:00.000Z');
const token='legitimate-scoped-admin-token-of-sufficient-length';
const fresh=new Date(now-2000).toISOString();
const good={id:'agent-user4',hostname:'USER4',status:'online',revokedAt:null,
  management:{source:'agent',type:'pc'},platform:'Windows 11',
  lastSeenAt:fresh,capabilities:{agentStatus:true},recentCommands:[]};

test('USER4 signed Agent already updated after release needs only read-only GET',async()=>{
  let posts=0;
  const fetchImpl=async(url,init)=>{
    if(init.method==='POST')posts++;
    return new Response(JSON.stringify({devices:[{...good,recentCommands:[{
      id:'updated',type:'agent.self_update',status:'succeeded',
      completedAt:new Date(now-5000).toISOString()
    }]}]}),{status:200});
  };
  const value=await ensureUser4EditionProbeAgent({token,fetchImpl,clock:()=>now});
  assert.equal(value.updatePerformed,false);
  assert.equal(value.receiptVerified,true);
  assert.equal(posts,0);
});

test('exact USER4 accepts one confirmed signed Agent update and requires postupdate heartbeat',async()=>{
  let posted=0,done=false,reads=0;
  const issuedAt=new Date(now-3000).toISOString();
  const completedAt=new Date(now-1000).toISOString();
  const fetchImpl=async(url,init)=>{
    assert(url.startsWith('https://ekodi.kr/api/control/devices'));
    if(init.method==='POST'){
      posted++;
      assert.match(url,/\/agent-user4\/commands$/);
      assert.deepEqual(JSON.parse(init.body),{type:'agent.self_update',confirmed:true});
      done=true;
      return new Response(JSON.stringify({command:{id:'update-4',type:'agent.self_update',
        status:'queued',issuedAt}}),{status:200});
    }
    reads++;
    const command=done?[{id:'update-4',type:'agent.self_update',
      status:'succeeded',completedAt}]:[];
    const device={...good,lastSeenAt:done?new Date(now).toISOString():fresh,
      recentCommands:command};
    return new Response(JSON.stringify({devices:[device]}),{status:200});
  };
  const value=await ensureUser4EditionProbeAgent({token,fetchImpl,clock:()=>now,
    sleepFn:async()=>{},maxPoll:5});
  assert.equal(value.updatePerformed,true);
  assert.equal(value.receiptVerified,true);
  assert.equal(posted,1);
  assert(reads>=2);
});

test('USER2, an offline USER4, and an in-flight unrelated command cannot be modified',async()=>{
  for(const device of [
    {...good,hostname:'USER2'},
    {...good,status:'offline'},
    {...good,recentCommands:[{id:'busy',type:'computer.browser.canary',
      status:'claimed',issuedAt:fresh}]}
  ]){
    let writes=0;
    const fetchImpl=async(url,init)=>{
      if(init.method==='POST')writes++;
      return new Response(JSON.stringify({devices:[device]}),{status:200});
    };
    await assert.rejects(()=>ensureUser4EditionProbeAgent({token,fetchImpl,clock:()=>now}),
      /user4_agent_not_healthy_for_update|user4_agent_busy_no_interrupt/);
    assert.equal(writes,0);
  }
});

test('stale update receipt from before edition release cannot falsely satisfy cutover',async()=>{
  let posts=0;
  const fetchImpl=async(url,init)=>{
    if(init.method==='POST'){
      posts++;
      return new Response(JSON.stringify({command:{id:'new',type:'agent.self_update',status:'queued'}}),{status:200});
    }
    return new Response(JSON.stringify({devices:[{...good,recentCommands:[{
      id:'old',type:'agent.self_update',status:'succeeded',
      completedAt:new Date(USER4_EDITION_PROBE_CUTOVER-100000).toISOString()
    }]}]}),{status:200});
  };
  await assert.rejects(()=>ensureUser4EditionProbeAgent({token,fetchImpl,
    clock:()=>now,sleepFn:async()=>{},maxPoll:2}),/user4_agent_update_reconnect_timeout/);
  assert.equal(posts,1);
});

test('native edition preflight is guarded and never changes Windows features or user desktop',()=>{
  const helper=readFileSync(new URL('../scripts/ensure-user4-edition-probe-agent.mjs',import.meta.url),'utf8');
  const runner=readFileSync(new URL('../scripts/verify-native-user4-virtual-probe.mjs',import.meta.url),'utf8');
  assert.match(helper,/const COMMAND='agent.self_update'/);
  assert.match(helper,/confirmed:true/);
  assert.match(runner,/ensureUser4EditionProbeAgent\(\{token\}\)/);
  assert.doesNotMatch(helper+runner,/Enable-WindowsOptionalFeature|Restart-Computer|Start-VM|New-VM|SendKeys|SetWindowsHookEx/);
});
