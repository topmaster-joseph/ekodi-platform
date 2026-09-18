import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateConflictSnapshot } from '../scripts/parallel-change-conflict-guard.mjs';

const config={
  policyId:'PARALLEL-RELATED-REVIEW-001',
  integrationOrderLabel:'integration-order-approved',
  reviewCompleteLabel:'related-change-review-complete',
  reviewEvidenceMarker:'[EKODI RELATED CHANGE REVIEW]',
  scopes:[{id:'admin-navigation',patterns:['^workspace-admin-page\\.js$','^store-admin-engine\\.js$']}],
};
const connection=(nodes,hasNextPage=false)=>({nodes,pageInfo:{hasNextPage}});
const pr=({number,branch='b',base='main',files=[],labels=[],body='',comments=[],reviews=[],mergeable='MERGEABLE',mergeStateStatus='CLEAN'})=>({
  number,headRefName:branch,baseRefName:base,body,mergeable,mergeStateStatus,
  files:connection(files.map(path=>({path}))),
  labels:connection(labels.map(name=>({name}))),
  comments:connection(comments.map(body=>({body}))),
  reviews:connection(reviews.map(body=>({body}))),
});

test('snapshot guard preserves exact/semantic review and winner requirements without per-PR API calls',()=>{
  const current=pr({
    number:10,branch:'ai/current',files:['workspace-admin-page.js'],
    labels:['integration-order-approved','related-change-review-complete'],
    comments:['[EKODI RELATED CHANGE REVIEW] reviewed #9'],
  });
  const other=pr({number:9,branch:'ai/other',files:['store-admin-engine.js']});
  const result=evaluateConflictSnapshot({data:{repository:{current,open:connection([current,other])}}},{config,prNumber:10,baseRef:'main',headRef:'ai/current'});
  assert.equal(result.ok,true);
  assert.deepEqual(result.related,[9,10]);
  assert.match(result.summary,/ALLOWED to merge first/);
});

test('snapshot guard fails closed on incomplete pagination or ambiguous winners',()=>{
  const current=pr({
    number:10,files:['workspace-admin-page.js'],
    labels:['integration-order-approved','related-change-review-complete'],
    comments:['[EKODI RELATED CHANGE REVIEW] reviewed #9'],
  });
  const other=pr({number:9,files:['workspace-admin-page.js'],labels:['integration-order-approved']});
  const ambiguous=evaluateConflictSnapshot({data:{repository:{current,open:connection([current,other])}}},{config,prNumber:10,baseRef:'main',headRef:'x'});
  assert.equal(ambiguous.ok,false);
  assert.ok(ambiguous.errors.includes('MULTIPLE_INTEGRATION_WINNERS'));

  const paged=evaluateConflictSnapshot({data:{repository:{current,open:connection([current],true)}}},{config,prNumber:10,baseRef:'main',headRef:'x'});
  assert.equal(paged.ok,false);
  assert.ok(paged.errors.includes('OPEN_PR_PAGE_LIMIT_REACHED'));
});

test('snapshot guard fails on actual merge conflict',()=>{
  const current=pr({number:10,files:['workspace-admin-page.js'],mergeable:'CONFLICTING'});
  const result=evaluateConflictSnapshot({data:{repository:{current,open:connection([current])}}},{config,prNumber:10,baseRef:'main',headRef:'x'});
  assert.equal(result.ok,false);
  assert.ok(result.errors.includes('ACTUAL_MERGE_CONFLICT'));
});
