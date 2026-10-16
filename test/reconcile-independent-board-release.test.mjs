import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  boardOwnedFile,
  latestMergedOrchestratorCandidates,
  releaseRequired
} from '../scripts/reconcile-independent-board-release.mjs';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const official='ai/chatgpt/orch_recovery_1a3b4b6cd849aa0fca7e1898e98c4ec1';
const sha='a'.repeat(40);
const origin=pr=>({
  number:pr, state:'closed', merged_at:'2026-10-15T06:14:13Z',
  head:{ref:official},base:{ref:'main'},merge_commit_sha:sha
});

test('board release ownership is narrow and consistent with guarded board workflow',()=>{
  for(const name of [
    'services/independent-board/worker.js',
    'wrangler.independent-board.toml',
    'sites/seonammedi/public/app.js',
    '.github/workflows/deploy-independent-board.yml'
  ])assert.equal(boardOwnedFile(name),true,name);
  for(const name of [
    '.github/workflows/deploy-site-core.yml',
    'sites/seonammedi/public/index.html',
    'services/other-board/worker.js',
    'scripts/recover-release-provenance.mjs',
    'test/independent-board-seonammedi.test.mjs',
    ''
  ])assert.equal(boardOwnedFile(name),false,name);
});

test('only official merged orchestrator PRs on main are eligible, newest first',()=>{
  const newer={...origin(2),merged_at:'2026-10-15T06:45:00Z'};
  const result=latestMergedOrchestratorCandidates([
    origin(1),newer,
    {...origin(3),merged_at:null},
    {...origin(4),head:{ref:'ai/chatgpt/untrusted'}},
    {...origin(5),base:{ref:'dev'}},
    {...origin(6),state:'open'},
    {...origin(7),merge_commit_sha:'none'}
  ]);
  assert.deepEqual(result.map(p=>p.number),[2,1]);
});

test('never repeat attempted release and never dispatch during a previous active run',()=>{
  const date='2026-10-15T07:00:00Z';
  assert.equal(releaseRequired(date,null).required,true);
  assert.equal(releaseRequired(date,{created_at:'2026-10-15T06:04:00Z',status:'completed',conclusion:'failure'}).required,true);
  assert.equal(releaseRequired(date,{created_at:'2026-10-15T07:01:00Z',status:'completed',conclusion:'success'}).required,false);
  assert.equal(releaseRequired(date,{created_at:'2026-10-15T07:01:00Z',status:'completed',conclusion:'failure'}).required,false);
  assert.equal(releaseRequired(date,{created_at:'2026-10-15T06:04:00Z',status:'in_progress'}).required,false);
  assert.equal(releaseRequired(date,{created_at:'garbled',status:'completed'}).required,false);
  assert.equal(releaseRequired('',null).required,false);
});

test('trusted owner issue comment and hourly recovery never bypass canonical production gate',async()=>{
  const [workflow,source,board]=await Promise.all([
    read('.github/workflows/reconcile-independent-board-release.yml'),
    read('scripts/reconcile-independent-board-release.mjs'),
    read('.github/workflows/deploy-independent-board.yml')
  ]);
  for(const item of [
    'issue_comment:',
    'schedule:',
    'workflow_dispatch:',
    "github.event.issue.number == 4759",
    "github.event.comment.user.login == 'topmaster-joseph'",
    'environment: production',
    'actions: write',
    'ref: main',
    'node --check scripts/reconcile-independent-board-release.mjs',
    'node --test test/reconcile-independent-board-release.test.mjs'
  ])assert.ok(workflow.includes(item),item);
  assert.match(workflow,/GH_TOKEN: \$\{\{ github\.token \}\}/);
  for(const item of [
    "const ISSUE=4759",
    'EKODI-BOARD-DEPLOY-RECOVER:',
    '/issues/comments/',
    'owner comment provenance could not be verified',
    'main moved or approved issue comment SHA does not match current main',
    '/pulls?state=closed&base=main',
    '/files?per_page=100&page=',
    '/compare/',
    'missing successful required source check:',
    '/api/orchestrator/release-receipt',
    "j.authority!=='ekodi-orchestrator'",
    'main moved before production dispatch',
    'another-board-release-attempt-exists',
    "release_branch_ref:branch,release_task_id:task",
    'guarded-board-deployment-dispatched'
  ])assert.ok(source.includes(item),item);
  assert.match(board,/name: Deploy Independent Board/);
  assert.match(board,/environment: production/);
  assert.match(board,/Verify production board UI/);
  assert.match(board,/Verify production Google login-first API without credentials/);
  assert.match(board,/Production queue-create-list-reply canary and cleanup/);
  assert.doesNotMatch(source,/wrangler deploy|--force|skip.required/i);
  assert.doesNotMatch(workflow,/pull_request_target:/);
});
