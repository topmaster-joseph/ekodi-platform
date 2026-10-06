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
