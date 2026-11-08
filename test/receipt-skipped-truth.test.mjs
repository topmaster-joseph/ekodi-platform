// The scheduled deploy-site-core run failed every day from 2026-11-01 to
// 2026-11-08 — eight days — and it failed precisely when the platform was
// healthy.
//
// A scheduled run is a retry. scheduled_release_gate reports proceed=false when
// the latest meaningful release already deployed successfully, so staging_gate,
// reliability_gate, deploy and every verifier are skipped by design. The receipt
// job runs with if: always(), and its rule treated any non-success result as
// 'blocked' with reason 'upstream-failure-or-quota-circuit' — so it recorded a
// healthy no-op as a blocked release and exited 1.
//
// A lane that is red when nothing is wrong teaches people to ignore red, and the
// 429 that killed admin verification on 2026-10-31 was sitting inside that noise.
// These tests pin the distinction between "no release was attempted" and
// "verification was blocked", and that the guard still bites when it should.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WORKFLOW = fs.readFileSync(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8');

// Run the receipt step's real script, extracted from the workflow, so the test
// exercises what CI runs rather than a restatement of it.
function runReceipt(env) {
  const start = WORKFLOW.indexOf("      - name: Record exact verifier results and blocked predecessors");
  assert.ok(start > 0, 'the receipt step must exist');
  const scriptStart = WORKFLOW.indexOf("node --input-type=module <<'NODE'", start);
  const scriptEnd = WORKFLOW.indexOf('          NODE', scriptStart);
  assert.ok(scriptStart > 0 && scriptEnd > scriptStart, 'the receipt script must be extractable');
  const body = WORKFLOW.slice(WORKFLOW.indexOf('\n', scriptStart) + 1, scriptEnd)
    .split('\n').map(line => line.replace(/^ {10}/, '')).join('\n');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-'));
  fs.mkdirSync(path.join(dir, 'artifacts'), { recursive: true });
  const file = path.join(dir, 'receipt.mjs');
  fs.writeFileSync(file, body);
  let status = 0;
  try {
    execFileSync(process.execPath, [file], {
      cwd: dir,
      env: { ...process.env, GITHUB_SHA: 'deadbeef', GITHUB_ACTIONS: '', ...env },
      stdio: 'pipe',
    });
  } catch (error) {
    status = error.status ?? 1;
  }
  const receipt = JSON.parse(fs.readFileSync(path.join(dir, 'artifacts/site-core-postdeploy-browser-verification.json'), 'utf8'));
  fs.rmSync(dir, { recursive: true, force: true });
  return { status, receipt };
}

const ALL_SKIPPED = {
  DEPLOY_RESULT: 'skipped',
  NATIVE_DESKTOP_RESULT: 'skipped',
  NATIVE_MOBILE_RESULT: 'skipped',
  RESEARCH_DESKTOP_RESULT: 'skipped',
  RESEARCH_MOBILE_RESULT: 'skipped',
  ADMIN_RESULT: 'skipped',
};

const ALL_SUCCESS = {
  DEPLOY_RESULT: 'success',
  NATIVE_DESKTOP_RESULT: 'success',
  NATIVE_MOBILE_RESULT: 'success',
  RESEARCH_DESKTOP_RESULT: 'success',
  RESEARCH_MOBILE_RESULT: 'success',
  ADMIN_RESULT: 'success',
};

test('a healthy scheduled no-op is no longer recorded as a blocked release', () => {
  // The exact shape of all eight failed days.
  const { status, receipt } = runReceipt({
    ...ALL_SKIPPED,
    GATE_PROCEED: 'false',
    GATE_REASON: 'latest-meaningful-release-succeeded',
  });
  assert.equal(status, 0, 'a day on which nothing needed releasing must not fail the lane');
  assert.equal(receipt.conclusion, 'not_attempted');
  assert.equal(receipt.firstFailure, null);
  assert.equal(receipt.gate.reason, 'latest-meaningful-release-succeeded');
  for (const row of receipt.evidence) {
    assert.equal(row.verification, 'not_attempted');
    assert.notEqual(row.reason, 'upstream-failure-or-quota-circuit', 'the old wrong reason must be gone');
  }
});

test('the other no-release reason is treated the same way', () => {
  const { status, receipt } = runReceipt({
    ...ALL_SKIPPED,
    GATE_PROCEED: 'false',
    GATE_REASON: 'no-meaningful-prior-release',
  });
  assert.equal(status, 0);
  assert.equal(receipt.conclusion, 'not_attempted');
  assert.equal(receipt.gate.reason, 'no-meaningful-prior-release');
});

test('a release that was attempted and blocked still fails the lane', () => {
  // The guard's whole purpose. proceed=true with skipped verifiers means the
  // release was tried and verification did not happen.
  const { status, receipt } = runReceipt({
    ...ALL_SKIPPED,
    GATE_PROCEED: 'true',
    GATE_REASON: 'normal-trigger',
  });
  assert.equal(status, 1, 'an attempted release with no verification must stay red');
  assert.equal(receipt.conclusion, 'blocked');
  assert.equal(receipt.firstFailure, 'deploy');
  assert.equal(receipt.evidence[0].reason, 'upstream-failure-or-quota-circuit');
});

test('a verifier that actually failed still fails the lane', () => {
  const { status, receipt } = runReceipt({
    ...ALL_SUCCESS,
    ADMIN_RESULT: 'failure',
    GATE_PROCEED: 'true',
    GATE_REASON: 'normal-trigger',
  });
  assert.equal(status, 1);
  assert.equal(receipt.conclusion, 'blocked');
  assert.equal(receipt.firstFailure, 'authenticated_admin_surface_verification');
  const admin = receipt.evidence.find(row => row.name === 'authenticated_admin_surface_verification');
  assert.equal(admin.verification, 'failed');
  assert.equal(admin.reason, 'see-failed-job-evidence');
});

test('a deployed and fully verified release is verified', () => {
  const { status, receipt } = runReceipt({ ...ALL_SUCCESS, GATE_PROCEED: 'true', GATE_REASON: 'normal-trigger' });
  assert.equal(status, 0);
  assert.equal(receipt.conclusion, 'verified');
  assert.equal(receipt.firstFailure, null);
  assert.ok(receipt.evidence.every(row => row.verification === 'verified'));
});

test('a missing gate output is treated as an attempted release, not waved through', () => {
  // Fail closed: if the gate value is absent for any reason, the receipt must
  // keep its old strictness rather than assume nothing was released.
  for (const gate of [{}, { GATE_PROCEED: '' }, { GATE_PROCEED: 'true' }, { GATE_PROCEED: 'TRUE' }, { GATE_PROCEED: 'maybe' }]) {
    const { status } = runReceipt({ ...ALL_SKIPPED, ...gate });
    assert.equal(status, 1, `absent or unrecognized gate output must stay strict: ${JSON.stringify(gate)}`);
  }
});

test('the receipt is written in every path, since the upload step always runs', () => {
  // if-no-files-found: error on the upload step, so a path that writes no file
  // would fail the job for the wrong reason.
  assert.match(WORKFLOW, /if-no-files-found: error/);
  for (const gate of [{ GATE_PROCEED: 'false', GATE_REASON: 'latest-meaningful-release-succeeded' }, { GATE_PROCEED: 'true' }]) {
    const { receipt } = runReceipt({ ...ALL_SKIPPED, ...gate });
    assert.ok(receipt.policyId, 'a receipt must exist on every path');
    assert.equal(receipt.receiptJobProductionRequests, 0, 'the receipt job still makes no production requests');
  }
});

test('the receipt job can see the gate it now depends on', () => {
  const job = WORKFLOW.slice(WORKFLOW.indexOf('  post_promotion_browser_verification_receipt:'));
  assert.match(job, /needs: \[scheduled_release_gate, deploy,/, 'the gate must be a declared dependency');
  assert.match(job, /GATE_PROCEED: \$\{\{ needs\.scheduled_release_gate\.outputs\.proceed \}\}/);
  assert.match(job, /GATE_REASON: \$\{\{ needs\.scheduled_release_gate\.outputs\.reason \}\}/);
  // And the gate really publishes them.
  const gate = WORKFLOW.slice(WORKFLOW.indexOf('  scheduled_release_gate:'), WORKFLOW.indexOf('  staging_gate:'));
  assert.match(gate, /proceed: \$\{\{ steps\.gate\.outputs\.proceed \}\}/);
  assert.match(gate, /reason: \$\{\{ steps\.gate\.outputs\.reason \}\}/);
});
