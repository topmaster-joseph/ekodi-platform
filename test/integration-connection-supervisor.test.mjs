import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONNECTION_RECOVERY_POLICY,
  classifyConnectionFailure,
  connectionRecoverySnapshot,
  retryAfterMs,
  superviseConnection,
} from '../integration-connection-supervisor.js';

test('connection policy defaults to automatic safe recovery',()=>{
  assert.equal(CONNECTION_RECOVERY_POLICY.automatic,true);
  assert.equal(CONNECTION_RECOVERY_POLICY.explicitDisconnectWins,true);
  assert.equal(CONNECTION_RECOVERY_POLICY.refreshBeforeReauth,true);
  const snapshot=connectionRecoverySnapshot({state:'reauth_required'});
  assert.equal(snapshot.requiresUserAction,true);
});

test('explicit disconnect wins over automatic reconnect',async()=>{
  let probes=0;
  const result=await superviseConnection({
    explicitlyDisconnected:true,
    probe:async()=>{probes+=1;return {ok:true};},
  });
  assert.equal(result.state,'disconnected');
  assert.equal(probes,0);
});

test('transient outage is retried and verified automatically',async()=>{
  let probes=0;
  const sleeps=[];
  const result=await superviseConnection({
    probe:async()=>{
      probes+=1;
      if(probes<3) return {ok:false,status:503};
      return {ok:true,status:200};
    },
    delaysMs:[10,20,30],
    sleep:async ms=>sleeps.push(ms),
  });
  assert.equal(result.ok,true);
  assert.equal(result.recovered,true);
  assert.equal(probes,3);
  assert.deepEqual(sleeps,[10,20]);
});

test('expired access token refreshes once before user reauth',async()=>{
  let probes=0;
  let refreshes=0;
  const result=await superviseConnection({
    probe:async()=>{
      probes+=1;
      return probes===1 ? {ok:false,status:401} : {ok:true,status:200};
    },
    refresh:async()=>{refreshes+=1;return {ok:true,status:200};},
    sleep:async()=>{},
  });
  assert.equal(result.ok,true);
  assert.equal(refreshes,1);
  assert.equal(probes,2);
});
test('revoked refresh token stops at reauth_required',async()=>{
  const result=await superviseConnection({
    probe:async()=>{throw Object.assign(new Error('invalid_grant'),{providerCode:'invalid_grant',status:400});},
    sleep:async()=>{},
  });
  assert.equal(result.ok,false);
  assert.equal(result.state,'reauth_required');
  assert.equal(result.attempts,1);
});

test('permission mismatch is not retried as an outage',async()=>{
  let probes=0;
  const result=await superviseConnection({
    probe:async()=>{probes+=1;return {ok:false,status:403,code:'insufficient_scope'};},
    sleep:async()=>{},
  });
  assert.equal(result.state,'permission_required');
  assert.equal(probes,1);
});

test('rate limits respect Retry-After before retrying',async()=>{
  let probes=0;
  const sleeps=[];
  const result=await superviseConnection({
    probe:async()=>{
      probes+=1;
      return probes===1 ? new Response('{}',{status:429,headers:{'retry-after':'2'}}) : {ok:true,status:200};
    },
    sleep:async ms=>sleeps.push(ms),
  });
  assert.equal(result.ok,true);
  assert.deepEqual(sleeps,[2000]);
});
test('repeated transient failure opens the bounded circuit',async()=>{
  let probes=0;
  const result=await superviseConnection({
    probe:async()=>{probes+=1;return {ok:false,status:503};},
    maxAttempts:3,
    delaysMs:[0,0,0],
    sleep:async()=>{},
  });
  assert.equal(result.state,'circuit_open');
  assert.equal(probes,3);
});

test('failure classifier keeps authorization distinct from outages',()=>{
  assert.equal(classifyConnectionFailure({status:401}),'refresh_required');
  assert.equal(classifyConnectionFailure({status:400,providerCode:'invalid_grant'}),'reauth_required');
  assert.equal(classifyConnectionFailure({status:403,code:'insufficient_scope'}),'permission_required');
  assert.equal(classifyConnectionFailure({status:503}),'transient');
  assert.equal(classifyConnectionFailure({explicitlyDisconnected:true}),'disconnected');
});

test('Retry-After parser accepts seconds and dates',()=>{
  assert.equal(retryAfterMs('3',0),3000);
  assert.equal(retryAfterMs('Thu, 01 Jan 1970 00:00:05 GMT',0),5000);
});
