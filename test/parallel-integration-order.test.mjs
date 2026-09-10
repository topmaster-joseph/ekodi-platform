import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadReviewScopes, semanticScopeOverlaps } from '../scripts/detect-related-change-overlap.mjs';

const workflow=fs.readFileSync('.github/workflows/ai-conflict-guard.yml','utf8');
const docs=fs.readFileSync('docs/PARALLEL-INTEGRATION-ORDER.md','utf8');
const policy=JSON.parse(fs.readFileSync('config/ai-change-orchestration-policy.json','utf8'));
const scopes=loadReviewScopes('config/parallel-change-review-scopes.json');

test('parallel conflict guard requires cross-review and one central winner for related work',()=>{
  assert.match(workflow,/detect-related-change-overlap\.mjs/);
  assert.match(workflow,/reviewCompleteLabel/);
  assert.match(workflow,/reviewEvidenceMarker/);
  assert.match(workflow,/integrationOrderLabel/);
  assert.match(workflow,/approved_count.*-eq 1/);
  assert.match(workflow,/approved_winner.*PR_NUMBER/);
  assert.match(workflow,/every detected related PR/);
  assert.match(workflow,/must refresh\/rebase on main after this winner merges/);
});

test('admin menu changes in different files are detected as related',()=>{
  const overlaps=semanticScopeOverlaps(['workspace-admin-page.js'],['admin-shell.css'],scopes);
  assert.deepEqual(overlaps.map(item=>item.scope),['admin-navigation']);
  assert.deepEqual(overlaps[0].leftFiles,['workspace-admin-page.js']);
  assert.deepEqual(overlaps[0].rightFiles,['admin-shell.css']);
});

test('admin route registry changes are related while unrelated service work stays independent',()=>{
  const routing=semanticScopeOverlaps(['ekodi-service-manifest.js'],['workspace-route-policy.js'],scopes);
  assert.deepEqual(routing.map(item=>item.scope),['admin-routing-registry']);
  const independent=semanticScopeOverlaps(['mail-contact.js'],['tax-service-worker.js'],scopes);
  assert.deepEqual(independent,[]);
});

test('machine-readable orchestration policy requires related-change review',()=>{
  const review=policy.governance.parallelChangeReview;
  assert.equal(review.required,true);
  assert.equal(review.policyId,'PARALLEL-RELATED-REVIEW-001');
  assert.equal(review.detectExactFileOverlap,true);
  assert.equal(review.detectRelatedScopeOverlap,true);
  assert.equal(review.reviewCompleteLabel,'related-change-review-complete');
  assert.equal(review.integrationOrderLabel,'integration-order-approved');
  assert.equal(review.remainingPrsMustRefreshAfterWinner,true);
});

test('integration order never bypasses actual GitHub merge conflicts',()=>{
  assert.match(workflow,/mergeable.*== 'false'/);
  assert.match(workflow,/actual merge conflict with the base branch/);
  assert.match(docs,/do not waive tests, reviews, branch protection, authorization or deployment safeguards/);
});
