import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync('.github/workflows/converge-orchestrated-pr-merge.yml','utf8');
const script=readFileSync('scripts/converge-orchestrated-pr-merge.mjs','utf8');

test('official recovery PR creation starts trusted convergence without relying on suppressed GITHUB_TOKEN pushes',()=>{
  assert.match(workflow,/pull_request_target:\s*\n\s*types:\s*\[opened, reopened, synchronize, ready_for_review\]/);
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(workflow,/github\.event\.pull_request\.draft == false/);
  assert.match(workflow,/contains\(github\.event\.pull_request\.head\.ref, '\/orch_'\)/);
  assert.match(workflow,/ref: main/);
  assert.match(workflow,/persist-credentials: false/);
  assert.match(workflow,/EKODI_TRUSTED_BRANCH:/);
  assert.match(workflow,/EKODI_TRUSTED_HEAD_SHA:/);
  assert.match(workflow,/EKODI_TRUSTED_PR_NUMBER:/);
  assert.match(workflow,/statuses: read/);
  assert.match(workflow,/checks: read/);
  assert.doesNotMatch(workflow,/secrets\.(?:SUPABASE|CLOUDFLARE|GH_TOKEN|GITHUB_TOKEN)/);
  assert.doesNotMatch(workflow,/ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
});

test('exact owner-approved SHA, authoritative release receipt and live PR identity remain hard gates',()=>{
  assert.match(script,/receipt\.data\?\.authorized!==true/);
  assert.match(script,/release receipt head SHA does not match checked commit/);
  assert.match(script,/unverified orchestrator head SHA/);
  assert.match(script,/expectedPrNumber && pr\.number!==expectedPrNumber/);
  assert.match(script,/if\(p\?\.head\?\.sha!==headSha\)/);
  assert.match(script,/if\(p\?\.draft===true\)/);
  assert.match(script,/PR HEAD changed after required checks/);
  assert.match(script,/PR head SHA mismatches authorized trigger/);
});

test('guarded merge never treats a synthetic pass-status as an actually executed GitHub Actions check run',()=>{
  assert.match(script,/async function verifiedCheckRuns\(sha\)/);
  assert.match(script,/\/check-runs\?per_page=100/);
  assert.match(script,/run\.app\?\.slug==='github-actions'/);
  assert.match(script,/run\.status==='completed'/);
  assert.match(script,/if\(!await verifiedCheckRuns\(headSha\)\)/);
  assert.match(script,/if\(!await verifiedCheckRuns\(mergeSha\)\)/);
  assert.doesNotMatch(script,/\/statuses\/'\+mergeSha/);
  assert.doesNotMatch(script,/\/pulls\/'\+pr\.number\+'\/update-branch'/);
  assert.match(script,/merged\.r\.ok&&merged\.data\?\.merged===true/);
  assert.match(script,/dispatchPostMergeDeploys\(\)/);
});
