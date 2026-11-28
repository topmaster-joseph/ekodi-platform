import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCheonggyeCandidates as prepare} from '../cheonggye-event-candidate-policy.js';
const base={title:'청계 주민 음악회',organizer:'주최기관',location:'청계면',summary:'주민 참여 공연',startsOn:'2026-12-10',
  sourceId:'muan',url:'https://www.muan.go.kr/www/openmuan/new/notice?idx=10&utm_source=test',sourceRole:'organizer',
  verifiedOriginal:true,residentEligible:true,regionRelevant:true,connectionReason:'청계 주민 참여',time:'15:00'};
const run=(records,extra={})=>prepare(records,{today:'2026-11-28',...extra});
test('private only, canonical original, no side effects',()=>{
  const r=run([base,{...base,sourceId:'mokpoEvents',sourceRole:'official_repost',url:'https://event.mokpo.ac.kr/detail?id=2'}]);
  assert.equal(r.candidates.length,1);const c=r.candidates[0];
  assert.equal(c.visibility,'private');assert.equal(c.payload.reviewState,'pending');
  assert.equal(c.targetUrl,'https://www.muan.go.kr/www/openmuan/new/notice?idx=10');
  assert.equal(c.payload.automationMayPublish,false);assert.equal(r.publications,0);assert.equal(r.deliveries,0);
});
test('unverified, unrelated, missing facts and untrusted host held',()=>{
  for(const patch of [{verifiedOriginal:false},{regionRelevant:false},{residentEligible:false},{organizer:''},{startsOn:'2026-02-30'},{url:'https://evil.test/notice'},{url:'https://www.muan.go.kr.evil.test/notice'},{endsOn:'2026-02-30'},{connectionReason:''}]){
    const r=run([{...base,...patch}]);assert.equal(r.candidates.length,0);assert.equal(r.held.length,1);
  }
});
test('expired, closed, cancelled and expired registration are excluded',()=>{
  for(const patch of [{startsOn:'2026-11-27'},{status:'closed'},{status:'cancelled'},{deadline:'2026-11-27'}])
    assert.equal(run([{...base,...patch}]).candidates.length,0);
});
test('repost alone and conflicting detail held, separate occurrences preserved',()=>{
  assert.equal(run([{...base,sourceRole:'official_repost'}]).held[0].reason,'organizer_original_missing');
  assert.equal(run([base,{...base,time:'16:00'}]).held[0].reason,'conflicting_event_facts');
  assert.equal(run([{...base,occurrence:'1'},{...base,occurrence:'2'}]).candidates.length,2);
});
test('end window and source errors do not imply no new events',()=>{
  assert.equal(run([base],{today:'2026-12-23'}).state,'outside_authorized_window');
  assert.equal(run([],{sourceFailures:['muan']}).coverage,'partial');
  assert.equal(run([]).coverage,'not_independently_verified');
  assert.throws(()=>run([],{today:'invalid'}));
});
