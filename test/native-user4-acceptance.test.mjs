import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyUser4BrowserFailure,eligibleUser4Agent,verifyUser4Browser,verifyUser4Acceptance,ensureUser4AgentUpdated,USER4_CDP_FIX_FLOOR}
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

test('USER4 CDP and Ollama commands are both queued before either waits for completion',async()=>{
  const posted=new Set();
  const browserType='computer.browser.canary';
  const aiType='software.localai.verify';
  const fetchImpl=async(url,init)=>{
    if(init.method==='POST'){
      const {type}=JSON.parse(init.body);
      assert([browserType,aiType].includes(type));
      posted.add(type);
      return new Response(JSON.stringify({command:{type,id:type,status:'queued'}}),{status:200});
    }
    const recentCommands=posted.size===2?[
      {id:browserType,type:browserType,status:'succeeded',completedAt:new Date(now).toISOString(),
        result:{browserCanary:{ok:true,mode:'native-cdp',url:'https://ekodi.kr/',
          contentBytes:3700,dedicatedAutomationProfile:true,focusIsolated:true,
          clipboardShared:false,userInputInjection:false}}},
      {id:aiType,type:aiType,status:'succeeded',completedAt:new Date(now).toISOString(),
        result:{localAiProof:{ollamaApi:'ready',inference:'passed',
          credentialCollection:false,executionMode:'fixed_loopback_api',
          selectedModel:'qwen3:0.6b',claudeCli:'not_visible_to_agent'}}}
    ]:[];
    const device={...good,capabilities:{localAiVerify:true},recentCommands};
    return new Response(JSON.stringify({devices:[device]}),{status:200});
  };
  const result=await verifyUser4Acceptance({token:'authorized-admin-session-token-abcdef',
    clock:()=>now,fetchImpl,sleepFn:async()=>{},maxPoll:4});
  assert.deepEqual([...posted].sort(),[browserType,aiType].sort());
  assert.equal(result.ok,true);
  assert.equal(result.browserVerified,true);
  assert.equal(result.localAiVerified,true);
  assert.equal(result.browser.targetAlias,'user4');
  assert.equal(result.localAi.targetAlias,'user4');
});


test('USER4 browser failure diagnostics are an allowlisted category without raw data',()=>{
  assert.equal(classifyUser4BrowserFailure('CDP_NODE_RUNTIME_REQUIRED'),'CDP_NODE_RUNTIME_REQUIRED');
  assert.equal(classifyUser4BrowserFailure('CDP_WORKER_FAILED: {"code":"CDP_PORT_TIMEOUT","file":"C:/private"}'),'CDP_PORT_TIMEOUT');
  assert.equal(classifyUser4BrowserFailure('CDP_WORKER_FAILED: {"code":"CDP_BROWSER_NOT_FOUND"}'),'CDP_BROWSER_NOT_FOUND');
  assert.equal(classifyUser4BrowserFailure('CDP_WORKER_FAILED: {"code":"UNEXPECTED_SECRET=abc"}'),'CDP_WORKER_FAILED');
  assert.equal(classifyUser4BrowserFailure('C:/private/profile token=abc'),'BROWSER_FAILURE_UNCLASSIFIED');
});
test('failed USER4 browser receipt returns classified failure only',async()=>{
  const fetchImpl=async(url,init)=>{
    if(init.method==='POST')return new Response(JSON.stringify({command:{id:'fail-4',type:'computer.browser.canary',status:'queued'}}),{status:200});
    return new Response(JSON.stringify({devices:[{...good,recentCommands:[{
      id:'fail-4',type:'computer.browser.canary',status:'failed',
      result:{message:'CDP_WORKER_FAILED: {"code":"CDP_PORT_TIMEOUT","token":"secret-123"}'}}]}]}),{status:200});
  };
  await assert.rejects(()=>verifyUser4Browser({token:'authorized-admin-session-token-abcdef',
    clock:()=>now,fetchImpl,sleepFn:async()=>{},maxPoll:3}),
    error=>error.message==='user4_browser_failed:CDP_PORT_TIMEOUT'&&!error.message.includes('secret-123'));
});

test('USER4 official update only when current pinned CDP worker has not been received',async()=>{
  const at=USER4_CDP_FIX_FLOOR+600000;
  let issued=false;const methods=[];
  const fetchImpl=async(url,init)=>{
    methods.push(init.method);
    assert.equal(new URL(url).hostname,'ekodi.kr');
    if(init.method==='POST'){
      issued=true;
      assert.equal(JSON.parse(init.body).type,'agent.self_update');
      assert.equal(JSON.parse(init.body).confirmed,true);
      return new Response(JSON.stringify({command:{type:'agent.self_update',id:'update-user4',status:'queued'}}),{status:200});
    }
    const recentCommands=issued?[{
      id:'update-user4',type:'agent.self_update',status:'succeeded',
      completedAt:new Date(at-1000).toISOString()
    }]:[];
    const device={...good,capabilities:{agentStatus:true,localAiVerify:true},
      lastSeenAt:new Date(at-100).toISOString(),recentCommands};
    return new Response(JSON.stringify({devices:[device]}),{status:200});
  };
  const result=await ensureUser4AgentUpdated({token:'authorized-admin-session-token-abcdef',
    clock:()=>at,fetchImpl,sleepFn:async()=>{},maxPoll:3});
  assert.equal(result.recentOfficialUpdateVerified,true);
  assert.equal(result.updatePerformed,true);
  assert.equal(methods.filter(x=>x==='POST').length,1);
});
test('USER4 previous successful official update after fixed CDP patch prevents reinstall loop',async()=>{
  const at=USER4_CDP_FIX_FLOOR+1800000;
  let writes=0;
  const fetchImpl=async(url,init)=>{
    if(init.method==='POST')writes++;
    return new Response(JSON.stringify({devices:[{...good,
      lastSeenAt:new Date(at-1000).toISOString(),
      capabilities:{agentStatus:true},recentCommands:[{
        id:'already-installed',type:'agent.self_update',status:'succeeded',
        completedAt:new Date(at-5000).toISOString()
      }]}]}),{status:200});
  };
  const proof=await ensureUser4AgentUpdated({token:'authorized-admin-session-token-abcdef',
    clock:()=>at,fetchImpl});
  assert.equal(proof.updatePerformed,false);
  assert.equal(proof.recentOfficialUpdateVerified,true);
  assert.equal(writes,0);
});
test('USER4 official update refuses offline, other host, and concurrent commands',async()=>{
  const at=USER4_CDP_FIX_FLOOR+600000;let writes=0;
  const invalid=[
    {...good,hostname:'USER3',lastSeenAt:new Date(at-1000).toISOString(),capabilities:{agentStatus:true}},
    {...good,status:'offline',lastSeenAt:new Date(at-1000).toISOString(),capabilities:{agentStatus:true}},
    {...good,lastSeenAt:new Date(at-1000).toISOString(),capabilities:{agentStatus:true},
      recentCommands:[{id:'busy',type:'computer.browser.canary',status:'claimed'}]}
  ];
  for(const device of invalid){
    const fetchImpl=async(url,init)=>{
      if(init.method==='POST')writes++;
      return new Response(JSON.stringify({devices:[device]}),{status:200});
    };
    await assert.rejects(()=>ensureUser4AgentUpdated({token:'authorized-admin-session-token-abcdef',
      clock:()=>at,fetchImpl,maxPoll:1}),/user4_native_agent_not_ready_to_update|user4_agent_busy_no_interruption/);
  }
  assert.equal(writes,0);
});

test('USER4 browser error classifier accepts only bounded diagnostic categories',()=>{
  assert.equal(classifyUser4BrowserFailure('CDP_WORKER_FAILED: {"code":"CDP_BROWSER_EARLY_EXIT_ACCESS"}'), 'CDP_BROWSER_EARLY_EXIT_ACCESS');
  assert.equal(classifyUser4BrowserFailure('CDP_BROWSER_EARLY_EXIT_DEPENDENCY C:\\Users\\Sensitive\\chrome.exe'), 'CDP_BROWSER_EARLY_EXIT_DEPENDENCY');
  assert.equal(classifyUser4BrowserFailure('CDP_BROWSER_EARLY_EXIT_POLICY'), 'CDP_BROWSER_EARLY_EXIT_POLICY');
  assert.equal(classifyUser4BrowserFailure('CDP_BROWSER_EARLY_EXIT_SANDBOX'), 'CDP_BROWSER_EARLY_EXIT_SANDBOX');
  assert.equal(classifyUser4BrowserFailure('CDP_BROWSER_EARLY_EXIT_ZERO'), 'CDP_BROWSER_EARLY_EXIT_ZERO');
  assert.equal(classifyUser4BrowserFailure('CDP_BROWSER_EARLY_EXIT_UNKNOWN'), 'CDP_BROWSER_EARLY_EXIT_UNKNOWN');
  assert.equal(classifyUser4BrowserFailure('C:\\Users\\Sensitive\\private.log'), 'BROWSER_FAILURE_UNCLASSIFIED');
});

test('USER4 prior-day Agent update cannot satisfy 2026-10-12 owner refresh request',async()=>{
  const now=USER4_CDP_FIX_FLOOR+120000;
  let posts=0;
  const before=new Date(USER4_CDP_FIX_FLOOR-3600000).toISOString();
  const fetchImpl=async(url,init)=>{
    if(init.method==='POST'){
      posts++;
      assert.equal(JSON.parse(init.body).type,'agent.self_update');
      return new Response(JSON.stringify({command:{
        type:'agent.self_update',id:'owner-refresh-user4',status:'queued'
      }}),{status:200});
    }
    const recentCommands=[
      {id:'old-success',type:'agent.self_update',status:'succeeded',completedAt:before},
      ...(posts?[{id:'owner-refresh-user4',type:'agent.self_update',status:'succeeded',
        completedAt:new Date(now-1000).toISOString()}]:[])
    ];
    return new Response(JSON.stringify({devices:[{...good,
      capabilities:{agentStatus:true,localAiVerify:true},
      lastSeenAt:new Date(now-100).toISOString(),recentCommands}]}),{status:200});
  };
  const proof=await ensureUser4AgentUpdated({
    token:'authorized-admin-session-token-abcdef',clock:()=>now,fetchImpl,
    sleepFn:async()=>{},maxPoll:3
  });
  assert.equal(posts,1);
  assert.equal(proof.updatePerformed,true);
  assert.equal(proof.recentOfficialUpdateVerified,true);
});
