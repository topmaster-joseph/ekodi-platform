import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFarmDemand,summarizeFarmDemands} from './demand-domain.mjs';

const sample={crop:'onion',workers:12,start_month:'2026-11',duration_months:5,housing_status:'ready'};
test('accepts and normalizes valid demand',()=>assert.deepEqual({...validateFarmDemand(sample)},sample));
test('rejects invalid crop',()=>assert.throws(()=>validateFarmDemand({...sample,crop:'unknown'}),/invalid_crop/));
test('rejects noninteger or excessive workers',()=>{
  for(const workers of [0,1001,1.5,'2',NaN]) assert.throws(()=>validateFarmDemand({...sample,workers}),/invalid_workers/);
});
test('rejects invalid months and durations',()=>{
  for(const start_month of ['2026-00','2026-13','2026-1','2026-11-01']) assert.throws(()=>validateFarmDemand({...sample,start_month}),/invalid_start_month/);
  for(const duration_months of [0,9,'5']) assert.throws(()=>validateFarmDemand({...sample,duration_months}),/invalid_duration/);
});
test('rejects invalid housing and payload',()=>{
  assert.throws(()=>validateFarmDemand({...sample,housing_status:'unverified'}),/invalid_housing/);
  assert.throws(()=>validateFarmDemand(null),/invalid_payload/);
});
test('aggregates submitted and approved requests',()=>{
  const r=summarizeFarmDemands([{...sample,status:'submitted'},{...sample,workers:3,duration_months:2,status:'approved'}]);
  assert.equal(r.total,2);assert.equal(r.submitted,1);assert.equal(r.approved,1);
  assert.equal(r.requested_workers,15);assert.equal(r.requested_person_months,66);
});
test('rejects unrecognized workflow status',()=>assert.throws(()=>summarizeFarmDemands([{...sample,status:'unknown'}]),/invalid_status/));
