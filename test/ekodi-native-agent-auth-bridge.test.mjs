import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthenticatedAgentBridge, agentEligible, verifyBrowserCanaryReceipt} from '../scripts/ekodi-native-agent-auth-bridge.mjs';
const device={id:'device_12345678',status:'online',revokedAt:null,hostname:'user2',management:{source:'agent',type:'pc'},platform:'Windows',lastSeenAt:new Date(100000).toISOString(),recentCommands:[]};
const proof={ok:true,mode:'native-cdp',url:'https://ekodi.kr/',contentBytes:123,dedicatedAutomationProfile:true,focusIsolated:true,clipboardShared:false,userInputInjection:false};
test('rejects stale devices and unsafe receipts',()=>{
 assert.equal(agentEligible(device,110000),true);
 assert.equal(agentEligible(device,200000),false);
 assert.equal(verifyBrowserCanaryReceipt({type:'computer.browser.canary',status:'succeeded',result:{browserCanary:proof}}),true);
 assert.equal(verifyBrowserCanaryReceipt({type:'computer.browser.canary',status:'succeeded',result:{browserCanary:{...proof,focusIsolated:false}}}),false);
});
test('fails closed without admin session and without explicit confirmation', async()=>{
 const adapter=createAuthenticatedAgentBridge({getToken:()=>''});
 await assert.rejects(adapter.list(),/trusted_admin_session_required/);
 await assert.rejects(adapter.canary({deviceId:device.id}),/explicit_admin_confirmation_required/);
});
test('enqueues only first-party browser canary and accepts verified receipt',async()=>{
 const calls=[];let enqueued=false;
 const bridge=createAuthenticatedAgentBridge({getToken:()=>'a'.repeat(28),now:()=>110000,sleep:async()=>{},
 fetchImpl:async(url,opts)=>{
   calls.push({url,opts});
   if(opts.method==='POST'){enqueued=true;return {ok:true,json:async()=>({command:{id:'cmd_one',type:'computer.browser.canary',status:'queued'}})};}
   return {ok:true,json:async()=>({devices:[{...device,recentCommands:enqueued?[{id:'cmd_one',type:'computer.browser.canary',status:'succeeded',result:{browserCanary:proof}}]:[]}]})};
 }});
 const result=await bridge.canary({deviceId:device.id,confirmed:true,maxPoll:2,pollMs:0});
 assert.equal(result.verified,true);
 assert.equal(calls.filter(x=>x.opts.method==='POST').length,1);
 assert.equal(JSON.parse(calls.find(x=>x.opts.method==='POST').opts.body).type,'computer.browser.canary');
 assert.ok(calls.every(x=>x.url.startsWith('https://ekodi.kr/api/control/devices')));
 assert.ok(calls.every(x=>x.opts.headers.authorization==='Bearer '+ 'a'.repeat(28)));
});
test('does not enqueue on stale agent',async()=>{
 let writes=0;const bridge=createAuthenticatedAgentBridge({getToken:()=>'a'.repeat(28),now:()=>300000,
 fetchImpl:async(_,opts)=>{if(opts.method==='POST')writes++;return {ok:true,json:async()=>({devices:[device]})};}});
 await assert.rejects(bridge.canary({deviceId:device.id,confirmed:true}),/native_agent_not_ready/);
 assert.equal(writes,0);
});
