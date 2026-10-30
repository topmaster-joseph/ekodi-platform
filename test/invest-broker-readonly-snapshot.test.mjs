import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBrokerReadOnlySnapshot,compareBrokerReadOnlySnapshots} from '../invest-broker-readonly-snapshot.js';
const A='a11e5b10-7a2e-47bb-8e4c-15d10dc78a0c';
const B='b11e5b10-7a2e-47bb-8e4c-15d10dc78a0c';
const X='ddde5b10-7a2e-47bb-8e4c-15d10dc78a0c';
const Y='e11e5b10-7a2e-47bb-8e4c-15d10dc78a0c';
const NOW=Date.UTC(2026,9,30,1,0,0);
const base=(patch={})=>({
 brokerId:'kis',environment:'paper',accountRef:A,snapshotRef:X,
 capturedAt:'2026-10-30T00:59:00.000Z',currency:'KRW',cashAmount:'1000.50',
 reportedTotal:'1550.50',
 positions:[
  {symbol:'005930',market:'KR',currency:'KRW',quantity:'2',marketValue:'500.00'},
  {symbol:'069500',market:'KR',currency:'KRW',quantity:'0.125',marketValue:'50.00'}
 ],...patch
});
const run=(data)=>normalizeBrokerReadOnlySnapshot(data,{now:NOW});
test('KIS paper read-only account snapshot normalizes using exact cents, with no connection claim',()=>{
 const normalized=run(base());
 assert.equal(normalized.accepted,true);
 assert.equal(normalized.totalMinor,'155050');
 assert.equal(normalized.cashMinor,'100050');
 assert.equal(normalized.holdingsMinor,'55000');
 assert.equal(normalized.positions.length,2);
 assert.equal(Object.isFrozen(normalized.positions),true);
 assert.equal(Object.isFrozen(normalized.positions[0]),true);
 assert.equal(normalized.sourceAuthenticated,false);
 assert.equal(normalized.ownerBindingVerified,false);
 assert.equal(normalized.connected,false);
 assert.equal(normalized.networkCallPerformed,false);
 assert.equal(normalized.liveOrdersEnabled,false);
});
test('untrusted payloads and all credential material fail closed and are not echoed',()=>{
 const forbidden=[
  {access_token:'secret-1'},
  {secret:'secret-2'},
  {accountNumber:'123456789'},
  {headers:{Authorization:'secret-3'}},
  {client_id:'secret-4'},
  {host:'https://untrusted.example'},
 ];
 for(const patch of forbidden){
  const out=run(base(patch));
  assert.equal(out.accepted,false);
  assert.equal(JSON.stringify(out).includes('secret'),false);
 }
 assert.equal(run(null).accepted,false);
 assert.equal(run(base({accountRef:'123-123-123'})).error,'OPAQUE_REFERENCES_REQUIRED');
 assert.equal(run(base({snapshotRef:'123-123-123'})).error,'OPAQUE_REFERENCES_REQUIRED');
});
test('stale, future, invalid and mismatched broker environment snapshots are blocked',()=>{
 assert.equal(run(base({capturedAt:'2026-10-30T00:54:00.000Z'})).error,'STALE_OR_FUTURE_SNAPSHOT');
 assert.equal(run(base({capturedAt:'2026-10-30T01:01:00.000Z'})).error,'STALE_OR_FUTURE_SNAPSHOT');
 assert.equal(run(base({capturedAt:'not-a-time'})).error,'INVALID_CAPTURE_TIME');
 assert.equal(run(base({capturedAt:'2026-02-30T00:59:00.000Z'})).error,'INVALID_CAPTURE_TIME');
 assert.equal(normalizeBrokerReadOnlySnapshot(base({capturedAt:'2026-10-29T00:59:00.000Z'}),{now:NOW,maxAgeMs:86400000}).error,'STALE_OR_FUTURE_SNAPSHOT');
 assert.equal(run(base({brokerId:'ibkr'})).error,'BROKER_ENVIRONMENT_NOT_ALLOWED');
 assert.equal(run(base({brokerId:'toss',environment:'paper'})).error,'BROKER_ENVIRONMENT_NOT_ALLOWED');
 assert.equal(run(base({environment:'test'})).error,'BROKER_ENVIRONMENT_NOT_ALLOWED');
});
test('duplicate symbols, negative amounts, market/value mismatch and cross currency are blocked',()=>{
 assert.equal(run(base({positions:[base().positions[0],base().positions[0]]})).error,'DUPLICATE_POSITION');
 assert.equal(run(base({cashAmount:'-1'})).error,'INVALID_CASH_AMOUNT');
 assert.equal(run(base({cashAmount:'1e6'})).error,'INVALID_CASH_AMOUNT');
 assert.equal(run(base({cashAmount:'0.001'})).error,'INVALID_CASH_AMOUNT');
 assert.equal(run(base({reportedTotal:'1550.49'})).error,'BROKER_TOTAL_MISMATCH');
 assert.equal(run(base({positions:[{...base().positions[0],currency:'USD'}]})).error,'CROSS_CURRENCY_SNAPSHOT');
 assert.equal(run(base({positions:[{...base().positions[0],symbol:'AAPL?'}]})).error,'INVALID_INSTRUMENT');
 assert.equal(run(base({positions:[{...base().positions[0],marketValue:'-10'}]})).error,'INVALID_MARKET_VALUE');
 assert.equal(run(base({positions:[{...base().positions[0],quantity:'1e12'}]})).error,'INVALID_QUANTITY');
 assert.equal(run(base({positions:[{...base().positions[0],account_id:'not-allowed'}]})).error,'UNEXPECTED_POSITION_FIELDS');
});
test('comparison is limited to the same account, currency, environment, and increasing time',()=>{
 const original=run(base());
 const changed=run(base({snapshotRef:Y,capturedAt:'2026-10-30T00:59:30.000Z',cashAmount:'1100.50',reportedTotal:'1650.50'}));
 assert.equal(changed.accepted,true);
 const diff=compareBrokerReadOnlySnapshots(original,changed);
 assert.equal(diff.compared,true);
 assert.equal(diff.totalChangeMinor,'10000');
 assert.equal(diff.cashChangeMinor,'10000');
 assert.equal(diff.orderExecutionPerformed,false);
 for(const patch of [
  {accountRef:B},{environment:'live'},{currency:'USD',positions:base().positions.map(p=>({...p,currency:'USD'}))},
 ]){
  const swapped=run(base({...patch,snapshotRef:Y,capturedAt:'2026-10-30T00:59:30.000Z'}));
  // Currency change requires a valid total in its own currency; account/environment comparison still isolates.
  assert.equal(swapped.accepted,true);
  assert.equal(compareBrokerReadOnlySnapshots(original,swapped).error,'CROSS_ACCOUNT_OR_ENVIRONMENT');
 }
 assert.equal(compareBrokerReadOnlySnapshots(original,original).error,'DUPLICATE_SNAPSHOT');
 assert.equal(compareBrokerReadOnlySnapshots({...original,scheme:'forged'},changed).error,'SNAPSHOT_NOT_ACCEPTED');
 for(const bad of ['oops','-1','1e12','123abc',null,{},'9'.repeat(100)]){
  assert.equal(compareBrokerReadOnlySnapshots({...original,totalMinor:bad},changed).error,'INVALID_NORMALIZED_SNAPSHOT');
 }
 assert.equal(compareBrokerReadOnlySnapshots({...original,cashMinor:'1'},changed).error,'INCONSISTENT_NORMALIZED_TOTAL');
 assert.equal(compareBrokerReadOnlySnapshots({...original,accountRef:'not-a-uuid'},changed).error,'INVALID_NORMALIZED_SNAPSHOT');
 const earlier=run(base({snapshotRef:Y,capturedAt:'2026-10-30T00:58:00.000Z'}));
 assert.equal(compareBrokerReadOnlySnapshots(original,earlier).error,'NON_MONOTONIC_SNAPSHOT');
});
