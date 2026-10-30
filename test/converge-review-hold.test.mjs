import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pendingReviewBlocks} from '../scripts/lib/converge-review-hold.mjs';

const review=(who,state,author_association='OWNER')=>({user:{login:who},state,author_association});
test('change-request persists through COMMENTED and unrelated approvals',()=>{
  const xs=[review('topmaster-joseph','CHANGES_REQUESTED'),
    review('topmaster-joseph','COMMENTED'),review('another','APPROVED')];
  assert.deepEqual(pendingReviewBlocks(xs),['topmaster-joseph']);
});
test('unaffiliated public review cannot suspend a protected EKODI merge',()=>{
  assert.deepEqual(pendingReviewBlocks([
    review('external-user','CHANGES_REQUESTED','NONE'),
    review('first-time','CHANGES_REQUESTED','FIRST_TIME_CONTRIBUTOR'),
    review('employee','CHANGES_REQUESTED','COLLABORATOR')
  ]),['employee']);
  assert.deepEqual(pendingReviewBlocks([review('outsider','CHANGES_REQUESTED','CONTRIBUTOR')]),[]);
});
test('genuine same-owner APPROVED or dismissal clears earlier block',()=>{
  const a=[review('topmaster-joseph','CHANGES_REQUESTED')];
  assert.deepEqual(pendingReviewBlocks([...a,review('topmaster-joseph','APPROVED')]),[]);
  assert.deepEqual(pendingReviewBlocks([...a,review('topmaster-joseph','DISMISSED')]),[]);
});
test('explicit human review request holds even before review or after older approval',()=>{
  const requestedReviewers=[{login:'topmaster-joseph'}];
  assert.deepEqual(pendingReviewBlocks([],{requestedReviewers}),['topmaster-joseph']);
  assert.deepEqual(pendingReviewBlocks([review('topmaster-joseph','APPROVED')],{requestedReviewers}),['topmaster-joseph']);
  assert.deepEqual(pendingReviewBlocks([],{requestedReviewers:[{login:'external-user'}]}),[]);
});
test('newer owner re-request blocks after previous approval',()=>{
  assert.deepEqual(pendingReviewBlocks([review('topmaster-joseph','APPROVED'),
    review('topmaster-joseph','CHANGES_REQUESTED')]),['topmaster-joseph']);
  assert.throws(()=>pendingReviewBlocks(null),/REVIEW_EVIDENCE_UNAVAILABLE/);
});
test('existing workflow resumes ONLY on the human owners real approval event',()=>{
  const wf=readFileSync(new URL('../.github/workflows/converge-orchestrated-pr-merge.yml',import.meta.url),'utf8');
  const code=readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
  assert.match(wf,/pull_request_review:\s*\n    types: \[submitted\]/);
  assert.match(wf,/github.event.review.state == 'approved'/);
  assert.match(wf,/github.event.review.user.login == 'topmaster-joseph'/);
  assert.match(wf,/github.event.pull_request.head.repo.full_name == github.repository/);
  assert.match(wf,/github.event.pull_request.head.sha \|\| github.sha/);
  assert.match(wf,/group: ekodi-orchestrated-merge-\$\{\{ github.event.pull_request.head.ref \|\| github.ref_name \}\}/);
  assert.match(code,/pendingReviewBlocks\(reviews,\{requestedReviewers:pr\.requested_reviewers\}\)/);
  assert.ok(code.indexOf("if(unresolved.length)") < code.indexOf("const filesLookup="));
  assert.match(code,/release receipt is not authorized/);
});
