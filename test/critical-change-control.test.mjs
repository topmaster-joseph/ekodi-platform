import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CRITICAL_CHANGE_POLICY,
  buildRestorePoint,
  classifyCriticalChange,
  retainRecentRestorePoints,
  planCriticalChange,
} from '../critical-change-control.js';

test('mass site deletion is always a critical human-gated change',()=>{
  const r=classifyCriticalChange('에코디 사이트를 모두 삭제해',{production:true});
  assert.equal(r.critical,true);
  assert.equal(r.approvalRequired,true);
  assert.equal(r.restorePointRequired,true);
  assert.equal(r.directProductionMutationAllowed,false);
});

test('large structural change requires restore point and staging',()=>{
  const r=classifyCriticalChange('전체 구조 변경 후 운영 반영');
  assert.equal(r.critical,true);
  assert.equal(r.stagingRequired,true);
  assert.equal(r.gate,'critical_change_super_admin');
});

test('restore point history keeps only newest ten unique points',()=>{
  const points=Array.from({length:12},(_,i)=>buildRestorePoint({
    id:`rp-${i}`,
    createdAt:new Date(Date.UTC(2026,8,1,i)).toISOString(),
    commitSha:`sha${i}`,
  }));
  const kept=retainRecentRestorePoints(points);
  assert.equal(kept.length,CRITICAL_CHANGE_POLICY.restorePointRetention);
  assert.equal(kept[0].id,'rp-11');
  assert.equal(kept.at(-1).id,'rp-2');
});

test('permanent deletion requires a separate approval step',()=>{
  const p=planCriticalChange('운영 사이트 전체 영구삭제',{production:true},[]);
  assert.equal(p.classification.critical,true);
  assert.equal(p.permanentDeleteRequiresSeparateApproval,true);
  assert.equal(p.retention,10);
});
