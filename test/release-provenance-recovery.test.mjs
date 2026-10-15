import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('release provenance recovery requires exact-SHA policy-owner Human Gate evidence',async()=>{
  const source=await read('scripts/recover-release-provenance.mjs');
  for(const marker of [
    "APPROVAL_LABEL='orchestrator-human-gate-approved'",
    "APPROVAL_MARKER_PREFIX='EKODI-HUMAN-GATE-APPROVE:'",
    "waiting-human-approval-label",
    "waiting-exact-sha-human-approval",
    "approvalMarker",
    "sourceSha:headSha",
    "humanApproval",
    "intent,target,'high'",
    "human_gate_required",
    "exact_sha_human_gate_approved",
    "existing recovery branch does not match the exact approved source SHA",
  ]) assert.ok(source.includes(marker),marker);
  assert.match(source,/issues\/\$\{prNumber\}\/comments\?per_page=100/);
  assert.match(source,/policyOwners\.has\(login\).*body\.includes\(approvalMarker\)/s);
  assert.match(source,/github-owner:\$\{approvalActor\}/);
  assert.doesNotMatch(source,/intent,target,'normal','delegated'/);
  assert.doesNotMatch(source,/policyOwners\.has\(actor\)/);
});

test('trusted recovery workflow requires approval label and executes only default-branch runtime',async()=>{
  const workflow=await read('.github/workflows/recover-release-provenance.yml');
  assert.match(workflow,/pull_request_target:/);
  assert.match(workflow,/types: \[opened, reopened, synchronize, ready_for_review, labeled\]/);
  assert.match(workflow,/head\.repo\.full_name == github\.repository/);
  assert.match(workflow,/orchestrator-human-gate-approved/);
  assert.match(workflow,/!contains\(github\.event\.pull_request\.head\.ref, '\/orch_'\)/);
  assert.match(workflow,/ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(workflow,/CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(workflow,/CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/);
  assert.match(workflow,/node scripts\/recover-release-provenance\.mjs/);
  assert.doesNotMatch(workflow,/ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
});

test('exact-SHA recovery does not strand approved independent-board production release after token merge',async()=>{
  const [script,workflow]=await Promise.all([
    read('scripts/recover-release-provenance.mjs'),
    read('.github/workflows/recover-release-provenance.yml')
  ]);
  assert.match(workflow,/permissions:[\s\S]*actions: write/);
  assert.match(workflow,/independent_board_dispatch/);
  assert.match(script,/source file inspection failed before guarded merge/);
  assert.match(script,/sourceFiles\.some\(file=>/);
  for(const owner of [
    "file.startsWith('services/independent-board/')",
    "file==='wrangler.independent-board.toml'",
    "file==='sites/seonammedi/public/app.js'",
    "file==='.github/workflows/deploy-independent-board.yml'"
  ]) assert.ok(script.includes(owner),owner);
  assert.match(script,/if\(merge\.response\.ok&&independentBoardTouched\)\{/);
  assert.match(script,/merge\.data\?\.merged!==true/);
  assert.match(script,/main\.data\?\.commit\?\.sha/);
  assert.match(script,/main changed before exact board dispatch/);
  assert.match(script,/actions\/workflows\/deploy-independent-board\.yml\/dispatches/);
  assert.match(script,/release_branch_ref:branchRef,release_task_id:taskId/);
  assert.match(script,/dispatch\.response\.status!==204/);
  const guarded=script.indexOf('if(merge.response.ok&&independentBoardTouched){');
  const dispatch=script.indexOf('/actions/workflows/deploy-independent-board.yml/dispatches');
  assert.ok(guarded>=0&&dispatch>guarded,'dispatch must be behind verified immediate merge');
  assert.doesNotMatch(script,/sourceFiles\.some\([\s\S]*?\)\s*\?\s*await\s+github\(/);
});
