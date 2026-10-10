import test from 'node:test';
import assert from 'node:assert/strict';
import {observeNativeDeviceReadiness,summarizeNativeDeviceReadiness} from '../scripts/observe-native-device-readiness.mjs';

const now=Date.parse('2026-10-10T14:00:00.000Z');
const online={hostname:'USER3',platform:'Windows 11',management:{source:'agent',type:'pc'},
  revokedAt:null,status:'online',lastSeenAt:new Date(now-12000).toISOString(),
  capabilities:{backgroundBrowser:true,isolatedDesktop:false,localAI:false},
  id:'do-not-expose-device-id',deviceToken:'do-not-expose-token'};
test('native observer verifies only a recent enrolled agent heartbeat and publishes no identifiers',()=>{
  const a=summarizeNativeDeviceReadiness([online],{now,hostname:'user3'});
  assert.equal(a.registered,true);
  assert.equal(a.heartbeatHealthy,true);
  assert.equal(a.capabilities.backgroundBrowser,true);
  assert.equal(a.capabilities.isolatedDesktop,false);
  assert.equal(a.nativeCutoverVerified,false);
  assert.equal(a.remoteCommandIssued,false);
  assert.doesNotMatch(JSON.stringify(a),/do-not-expose/);
});
test('Desktop Commander connectivity and other hostnames never count as native agent',()=>{
  const external={...online,management:{source:'desktop-commander',type:'pc'}};
  const other={...online,hostname:'user30'};
  const a=summarizeNativeDeviceReadiness([external,other],{now,hostname:'user3'});
  assert.equal(a.registered,false);
  assert.equal(a.heartbeatHealthy,false);
  assert.equal(a.verificationState,'NATIVE_AGENT_NOT_REGISTERED');
});
test('a stale or revoked native agent never claims to be online',()=>{
  const stale={...online,lastSeenAt:new Date(now-90001).toISOString()};
  assert.equal(summarizeNativeDeviceReadiness([stale],{now}).heartbeatHealthy,false);
  assert.equal(summarizeNativeDeviceReadiness([{...online,revokedAt:'2026-10-10T12:00:00Z'}],{now}).registered,false);
});
test('live observation uses only authenticated GET and never submits commands',async()=>{
  const calls=[];
  const fakeFetch=async(url,init)=>{
    calls.push({url,init});
    return new Response(JSON.stringify({devices:[online]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const a=await observeNativeDeviceReadiness({token:'temporary-session-token-long-enough',hostname:'user3',now,fetchImpl:fakeFetch});
  assert.equal(a.heartbeatHealthy,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://ekodi.kr/api/control/devices');
  assert.equal(calls[0].init.method,'GET');
  assert.equal(calls[0].init.headers.authorization,'Bearer temporary-session-token-long-enough');
});
test('missing administrator session is rejected before any API request',async()=>{
  let n=0;
  await assert.rejects(observeNativeDeviceReadiness({token:'',fetchImpl:async()=>{n++;}}),/trusted_admin_session_required/);
  assert.equal(n,0);
});
