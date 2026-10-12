import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyUser2BrowserFailure,
  eligibleUser2Agent,
  recoverUser2NativeBrowser
} from '../scripts/recover-native-user2-browser.mjs';

const now=Date.parse('2026-10-12T11:30:00.000Z');
const base={
  id:'device-2',hostname:'USER2',status:'online',revokedAt:null,
  platform:'Windows 11',management:{source:'agent',type:'pc'},
  capabilities:{agentStatus:true,backgroundBrowser:false,backgroundBrowserCanary:false},
  lastSeenAt:new Date(now-1000).toISOString(),recentCommands:[]
};

test('USER2 recovery selects only the exact fresh EKODI-native Windows Agent',()=>{
  assert.equal(eligibleUser2Agent(base,{now}),true);
  for(const device of [
    {...base,hostname:'USER3'},
    {...base,status:'offline'},
    {...base,management:{source:'desktop-commander',type:'pc'}},
    {...base,lastSeenAt:new Date(now-100000).toISOString()}
  ]) assert.equal(eligibleUser2Agent(device,{now}),false);
});

test('USER2 self-updates once, confirms new capabilities, then verifies native CDP receipt',async()=>{
  let phase='initial';const posts=[];
  const fetchImpl=async(url,init)=>{
    if(init.method==='POST'){
      const body=JSON.parse(init.body);posts.push(body.type);
      if(body.type==='agent.self_update'){
        phase='updated';
        return new Response(JSON.stringify({command:{id:'update-2',type:body.type,status:'queued'}}),{status:200});
      }
      if(body.type==='computer.browser.canary'){
        phase='canary';
        return new Response(JSON.stringify({command:{id:'canary-2',type:body.type,status:'queued'}}),{status:200});
      }
    }
    const caps=phase==='initial'?base.capabilities:{agentStatus:true,backgroundBrowser:true,backgroundBrowserCanary:true};
    const recentCommands=phase==='updated'?[{
      id:'update-2',type:'agent.self_update',status:'succeeded',
      completedAt:new Date(now-500).toISOString()
    }]:phase==='canary'?[
      {id:'update-2',type:'agent.self_update',status:'succeeded',completedAt:new Date(now-500).toISOString()},
      {id:'canary-2',type:'computer.browser.canary',status:'succeeded',completedAt:new Date(now).toISOString(),
        result:{browserCanary:{ok:true,mode:'native-cdp',url:'https://ekodi.kr/',contentBytes:2048,
          dedicatedAutomationProfile:true,focusIsolated:true,clipboardShared:false,userInputInjection:false}}}
    ]:[];
    return new Response(JSON.stringify({devices:[{...base,capabilities:caps,
      lastSeenAt:new Date(now).toISOString(),recentCommands}]}),{status:200});
  };
  const result=await recoverUser2NativeBrowser({
    token:'authorized-admin-session-token-abcdef',clock:()=>now,fetchImpl,
    sleepFn:async()=>{},updateMaxPoll:3,canaryMaxPoll:3
  });
  assert.equal(result.ok,true);
  assert.equal(result.targetAlias,'user2');
  assert.equal(result.agentUpdate.performed,true);
  assert.equal(result.browser.mode,'native-cdp');
  assert.equal(result.externalProviderUsed,false);
  assert.equal(result.userDesktopAttached,false);
  assert.deepEqual(posts,['agent.self_update','computer.browser.canary']);
});

test('already capable USER2 skips update and runs only browser canary',async()=>{
  const posts=[];let issued=false;
  const capable={...base,capabilities:{agentStatus:true,backgroundBrowser:true,backgroundBrowserCanary:true}};
  const fetchImpl=async(url,init)=>{
    if(init.method==='POST'){
      const body=JSON.parse(init.body);posts.push(body.type);issued=true;
      return new Response(JSON.stringify({command:{id:'canary',type:body.type,status:'queued'}}),{status:200});
    }
    const recentCommands=issued?[{id:'canary',type:'computer.browser.canary',status:'succeeded',
      result:{browserCanary:{ok:true,mode:'native-cdp',url:'https://ekodi.kr/',contentBytes:512,
        dedicatedAutomationProfile:true,focusIsolated:true,clipboardShared:false,userInputInjection:false}}}]:[];
    return new Response(JSON.stringify({devices:[{...capable,recentCommands}]}),{status:200});
  };
  const result=await recoverUser2NativeBrowser({
    token:'authorized-admin-session-token-abcdef',clock:()=>now,fetchImpl,sleepFn:async()=>{},canaryMaxPoll:2
  });
  assert.equal(result.agentUpdate.performed,false);
  assert.deepEqual(posts,['computer.browser.canary']);
});

test('USER3, external desktop status or missing token never causes USER2 mutation',async()=>{
  let writes=0;
  const fetchImpl=async(url,init)=>{
    if(init.method==='POST')writes++;
    return new Response(JSON.stringify({devices:[{...base,hostname:'USER3'}]}),{status:200});
  };
  await assert.rejects(()=>recoverUser2NativeBrowser({
    token:'authorized-admin-session-token-abcdef',clock:()=>now,fetchImpl
  }),/user2_native_agent_not_healthy/);
  await assert.rejects(()=>recoverUser2NativeBrowser({fetchImpl:async()=>{writes++;}}),/trusted_admin_session_required/);
  assert.equal(writes,0);
});

test('browser failure exposes only allowlisted category',()=>{
  assert.equal(classifyUser2BrowserFailure('CDP_WORKER_FAILED: {"code":"CDP_PORT_TIMEOUT","token":"secret"}'),'CDP_PORT_TIMEOUT');
  assert.equal(classifyUser2BrowserFailure('C:/private/profile token=abc'),'BROWSER_FAILURE_UNCLASSIFIED');
});
