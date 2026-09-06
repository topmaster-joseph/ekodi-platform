import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendDelivery, calculateSettlement, buildOperationsBrief } from '../delivery/core.js';

test('balanced mode recommends the best cost-time-reliability balance without dispatching',()=>{
  const result=recommendDelivery({order:{amount:32000,priority:'balanced'},providers:[
    {id:'a',name:'A',fee:3800,etaMinutes:28,reliability:.9},
    {id:'b',name:'B',fee:4200,etaMinutes:19,reliability:.92},
    {id:'c',name:'C',fee:3500,etaMinutes:34,reliability:.86},
  ]});
  assert.equal(result.ok,true);
  assert.equal(result.dispatchExecuted,false);
  assert.equal(result.humanConfirmationRequired,true);
  assert.ok(['a','b','c'].includes(result.recommendedProviderId));
  assert.equal(result.ranked.length,3);
});

test('speed priority selects the fastest provider for the reference case',()=>{
  const result=recommendDelivery({order:{amount:32000,priority:'speed'},providers:[
    {id:'a',fee:3800,etaMinutes:28,reliability:.9},
    {id:'b',fee:4200,etaMinutes:19,reliability:.92},
    {id:'c',fee:3500,etaMinutes:34,reliability:.86},
  ]});
  assert.equal(result.recommendedProviderId,'b');
});

test('cost priority selects the cheapest provider for the reference case',()=>{
  const result=recommendDelivery({order:{amount:32000,priority:'cost'},providers:[
    {id:'a',fee:3800,etaMinutes:28,reliability:.9},
    {id:'b',fee:4200,etaMinutes:19,reliability:.92},
    {id:'c',fee:3500,etaMinutes:34,reliability:.86},
  ]});
  assert.equal(result.recommendedProviderId,'c');
});

test('settlement preview never executes settlement and keeps shares consistent',()=>{
  const result=calculateSettlement([{orderAmount:30000,deliveryFee:4000,subsidy:1000,customerShare:500}]);
  assert.equal(result.settlementExecuted,false);
  assert.equal(result.totals.deliveryFee,4000);
  assert.equal(result.totals.subsidy,1000);
  assert.equal(result.totals.customerShare,500);
  assert.equal(result.totals.merchantShare,2500);
});

test('operations brief reports delay risk from registered planning data',()=>{
  const brief=buildOperationsBrief([{status:'planned',deliveryFee:4100,etaMinutes:50,targetMinutes:45},{status:'done',deliveryFee:3900,etaMinutes:20,targetMinutes:45}]);
  assert.equal(brief.count,2);
  assert.equal(brief.delayed,1);
  assert.equal(brief.averageDeliveryFee,4000);
  assert.equal(brief.generatedBy,'local-rule-engine');
});
