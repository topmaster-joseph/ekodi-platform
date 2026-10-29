import test from 'node:test';
import assert from 'node:assert/strict';
import publishingWorker from '../publishing-worker.js';
import { privateSchedulerReady, runConfiguredPublishingReleaseTick } from '../publishing/human/private-release-scheduler.js';

const now='2026-10-29T10:00:00.000Z';
test('Publishing API is invisible by default to anonymous users',async()=>{
  const request=new Request('https://ekodi.kr/api/private-releases');
  const response=await publishingWorker.fetch(request,{});
  assert.equal(response.status,404);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
});
test('Publishing scheduler has no effect without explicitly verified private bindings',async()=>{
  const empty=await runConfiguredPublishingReleaseTick({},now);
  assert.deepEqual(empty,{disabled:true,processed:0,results:[]});
  const missing={PUBLISHING_PRIVATE_RELEASE_ENABLED:'true',
    PUBLISHING_RELEASE_DB:{prepare(){}},
    PUBLISHING_RELEASE_VERIFIER:{loadCandidate(){},verifyApprovalEvidence(){}},
    PUBLISHING_RELEASE_CHANNELS:{prepare(){},activate(){}}};
  assert.equal(privateSchedulerReady(missing),false);
  assert.equal((await runConfiguredPublishingReleaseTick(missing,now)).processed,0);
});
test('Worker scheduled handler exits safely without config or real cron',async()=>{
  await publishingWorker.scheduled({scheduledTime:Date.now()},{});
  await publishingWorker.scheduled({scheduledTime:Date.now()},
    {PUBLISHING_PRIVATE_RELEASE_ENABLED:'false'});
});
test('scheduler requires explicit verification of both channel acknowledgements',()=>{
  const base={
    PUBLISHING_PRIVATE_RELEASE_ENABLED:'true',
    PUBLISHING_RELEASE_DB:{prepare(){}},
    PUBLISHING_RELEASE_VERIFIER:{
      loadCandidate(){},verifyApprovalEvidence(){},verifyChannelAck(){}},
    PUBLISHING_RELEASE_CHANNELS:{prepare(){},activate(){}},
  };
  assert.equal(privateSchedulerReady(base),true);
  assert.equal(privateSchedulerReady({...base,PUBLISHING_RELEASE_VERIFIER:{
    loadCandidate(){},verifyApprovalEvidence(){}}}),false);
  assert.equal(privateSchedulerReady({...base,PUBLISHING_RELEASE_CHANNELS:{
    prepare(){}}}),false);
});
