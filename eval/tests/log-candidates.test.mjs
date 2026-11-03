import test from 'node:test';
import assert from 'node:assert/strict';
import {createReviewBatch} from '../log-candidates.mjs';

const rows=Array.from({length:62},(_,i)=>({id:'private-task-'+i,
  goal:`홍길동 담당자 010-1234-5678 관련 에코디 한국어 홍보 게시글 번호 ${i+1}을 작성하고 검증해 주세요`,
  state:i%3===0?'verified':i%3===1?'degraded':'queued',risk:'normal'}));

test('50 distinct real-source review candidates: 40 calibration, 10 private hold-out candidates',()=>{
  let id=0;const batch=createReviewBatch(rows,{idFactory:()=>String(++id).padStart(6,'0')});
  assert.equal(batch.calibration.length,40);
  assert.equal(batch.holdout.length,10);
  assert.equal(batch.mapping.length,50);
  assert.equal(new Set(batch.mapping.map(x=>x.sourceId)).size,50);
  const exported=JSON.stringify([...batch.calibration,...batch.holdout]);
  assert(!exported.includes('홍길동'));
  assert(!exported.includes('010-1234-5678'));
  assert(!exported.includes('private-task-'));
  assert(batch.calibration.every(x=>x.eligibleForGolden===false&&x.humanPrivacyReviewRequired===true));
  assert(batch.holdout.every(x=>x.expectedRoute===null));
  assert.equal(new Set(batch.calibration.map(x=>x.id).concat(batch.holdout.map(x=>x.id))).size,50);
});
test('rejects corpus that cannot supply fifty distinct Korean production goals',()=>{
  assert.throws(()=>createReviewBatch(rows.slice(0,49)),/INSUFFICIENT_DISTINCT/);
  assert.throws(()=>createReviewBatch(rows.map(x=>({...x,goal:'same Korean message 대한민국 홍보 작업'}))),/INSUFFICIENT_DISTINCT/);
  assert.throws(()=>createReviewBatch(rows.map(x=>({...x,goal:'hello123'}))),/INSUFFICIENT_DISTINCT/);
});
test('never allows zero holdout or premature golden promotion',()=>{
  assert.throws(()=>createReviewBatch(rows,{holdoutCount:0}),/EVAL_CANDIDATE_CONFIG/);
  assert.throws(()=>createReviewBatch(rows,{total:49}),/EVAL_CANDIDATE_CONFIG/);
});
