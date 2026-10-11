import test from 'node:test';
import assert from 'node:assert/strict';
import {eligibleUser4Agent,verifyUser4Browser,verifyUser4Acceptance}
  from '../scripts/verify-native-user4-acceptance.mjs';
const now=Date.parse('2026-10-11T06:30:00.000Z');
const good={id:'device-4',hostname:'USER4',status:'online',revokedAt:null,
  platform:'Windows 11',management:{source:'agent',type:'pc'},
  lastSeenAt:new Date(now-3000).toISOString(),recentCommands:[]};
test('USER4 must be the exact healthy EKODI-native Windows Agent',()=>{
  assert.equal(eligibleUser4Agent(good,{now}),true);
  for(const d of [{...good,hostname:'USER3'},{...good,status:'offline'},
    {...good,management:{source:'desktop-commander',type:'pc'}},
    {...good,lastSeenAt:new Date(now-100000).toISOString()}])
    assert.equal(eligibleUser4Agent(d,{now}),false);
});
test('USER4 browser issues exactly one approved CDP canary with authenticated receipt',async()=>{
  const calls=[];let issued=false;
  const fetchImpl=async(url,init)=>{
    const parsed=new URL(url);
    calls.push({url,method:init.method,body:init.body||''});
    if(init.method==='POST'){
      issued=true;
      assert.equal(JSON.parse(init.body).confirmed,true);
      assert.equal(JSON.parse(init.body).type,'computer.browser.canary');
      return new Response(JSON.stringify({command:{id:'canary-4',type:'computer.browser.canary',status:'queued'}}),{status:200});
    }
    return new Response(JSON.stringify({devices:[{...good,recentCommands:issued?[{
      id:'canary-4',type:'computer.browser.canary',status:'succeeded',
      completedAt:new Date(now).toISOString(),
      result:{browserCanary:{ok:true,mode:'native-cdp',url:'https://ekodi.kr/',
        contentBytes:1024,dedicatedAutomationProfile:true,focusIsolated:true,
        clipboardShared:false,userInputInjection:false}}
    }]:[]}]}),{status:200});
  };
  const result=await verifyUser4Browser({token:'authorized-admin-session-token-abcdef',
    clock:()=>now,fetchImpl,sleepFn:async()=>{},maxPoll:3});
  assert.equal(result.targetAlias,'user4');
  assert.equal(result.mode,'native-cdp');
  assert.equal(result.domBytes,1024);
  assert.equal(calls.filter(c=>c.method==='POST').length,1);
  assert.equal(calls.every(c=>c.url.startsWith('https://ekodi.kr/api/control/devices')),true);
});
test('no command is sent to USER3 when USER4 unavailable',async()=>{
  let writes=0;
  const fetchImpl=async(url,init)=>{
    if(init.method==='POST')writes++;
    return new Response(JSON.stringify({devices:[{...good,hostname:'USER3'}]}),{status:200});
  };
  await assert.rejects(()=>verifyUser4Browser({token:'authorized-admin-session-token-abcdef',
    clock:()=>now,fetchImpl}),/user4_native_agent_not_healthy/);
  assert.equal(writes,0);
});
test('missing administrator token never accesses devices',async()=>{
  let requests=0;
  await assert.rejects(()=>verifyUser4Browser({fetchImpl:async()=>{requests++;}}),/trusted_admin_session_required/);
  assert.equal(requests,0);
});
test('UI code or HTTP 200 without actual CDP proof never marks success',async()=>{
  const fetchImpl=async(url,init)=>{
    if(init.method==='POST')return new Response(JSON.stringify({command:{id:'x',type:'computer.browser.canary',status:'queued'}}),{status:200});
    return new Response(JSON.stringify({devices:[{...good,recentCommands:[{
      id:'x',type:'computer.browser.canary',status:'succeeded',
      result:{browserCanary:{ok:true,mode:'background-browser-canary',contentBytes:0}}
    }]}]}),{status:200});
  };
  await assert.rejects(()=>verifyUser4Browser({token:'authorized-admin-session-token-abcdef',
    clock:()=>now,fetchImpl,sleepFn:async()=>{},maxPoll:3}),/user4_native_cdp_proof_invalid/);
});
test('aggregate outcome is not successful if both live receipts are absent',async()=>{
  const fetchImpl=async()=>new Response(JSON.stringify({devices:[]}),{status:200});
  const result=await verifyUser4Acceptance({token:'authorized-admin-session-token-abcdef',
    clock:()=>now,fetchImpl,sleepFn:async()=>{},maxPoll:1});
  assert.equal(result.ok,false);
  assert.equal(result.targetAlias,'user4');
  assert.equal(result.browser,null);
  assert.equal(result.localAi,null);
  assert.equal(result.browserVerified,false);
  assert.equal(result.localAiVerified,false);
  assert.equal(result.mode,'ekodi-native-receipt-gated');
});
