import test from 'node:test';
import assert from 'node:assert/strict';
import {runDevotionalPushSchedule} from '../message/devotion-push-scheduler.js';
const due=new Date('2026-10-28T22:00:00Z');
test('refuses to send outside Seoul 7am or without adapters',async()=>{
  assert.equal((await runDevotionalPushSchedule({now:new Date('2026-10-28T22:01:00Z')})).status,'not_due');
  assert.equal((await runDevotionalPushSchedule({now:due})).status,'not_configured');
});
test('only sends published devotion and claims once',async()=>{
  const claimed=new Set(),sends=[];
  const storage={
    listActive:async()=>[{id:'s1',endpointId:'abcdefghijklmnop'}],
    claimDelivery:async({key})=>{if(claimed.has(key))return false;claimed.add(key);return true;},
    markDelivery:async()=>{}
  };
  const opts={now:due,storage,send:async(_,payload,policy)=>{sends.push(payload);assert.equal(policy.paidTransportEnabled,false);},devotionPublished:async site=>site==='mission'};
  const first=await runDevotionalPushSchedule(opts),second=await runDevotionalPushSchedule(opts);
  assert.equal(first.sent,1);assert.equal(second.sent,0);assert.equal(sends.length,1);
  assert.equal(sends[0].site,'mission');
});
