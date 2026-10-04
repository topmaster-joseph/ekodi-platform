import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('..', import.meta.url);
const validator = 'scripts/validate-ekodi-ai-change-orchestration.mjs';
const taskId = 'orch_00000000-0000-4000-8000-000000000001';
const branchRef = `ai/chatgpt/${taskId}`;
const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();

function runReceipt(fixture, { branch = branchRef, explicitTaskId = '' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ekodi-release-receipt-'));
  const eventPath = path.join(dir, 'event.json');
  const fixturePath = path.join(dir, 'receipt.json');
  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 3223, head: { ref: branch } } }));
  fs.writeFileSync(fixturePath, JSON.stringify(fixture));
  const env = {
    ...process.env,
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_HEAD_REF: branch,
    GITHUB_REF_NAME: branch,
    GITHUB_REPOSITORY: 'topmaster-joseph/ekodi-platform',
    GITHUB_RUN_ID: 'release-receipt-fixture',
    GITHUB_SHA: head,
    GITHUB_ACTOR: 'topmaster-joseph',
    EKODI_ORCHESTRATOR_RELEASE_RECEIPT_FIXTURE: fixturePath,
  };
  if (explicitTaskId) env.EKODI_RELEASE_TASK_ID = explicitTaskId;
  const result = spawnSync(process.execPath, [validator, '--release'], { cwd: root, env, encoding: 'utf8' });
  const attestationPath = path.resolve(new URL('../artifacts/ekodi-ai-orchestration-attestation.json', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'));
  const attestation = result.status === 0 && fs.existsSync(attestationPath) ? fs.readFileSync(attestationPath, 'utf8') : '';
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, attestation };
}

const authorized = extra => ({
  status: 200,
  body: {
    authorized: true,
    taskId,
    branchRef,
    state: 'assigned',
    authority: 'ekodi-orchestrator',
    ...extra,
  },
});

test('authorized orchestrator receipt permits the production-bound PR gate', () => {
  const { result, attestation } = runReceipt(authorized());
  assert.equal(result.status, 0, result.stdout + '\n' + result.stderr);
  const body = JSON.parse(attestation);
  assert.deepEqual(body.releaseReceipt, {
    required: true,
    verified: true,
    taskId,
    branchRef,
    authority: 'ekodi-orchestrator',
    state: 'assigned',
  });
});

for (const [name, fixture, expected] of [
  ['404 not_found', { status: 404, body: { authorized: false, reason: 'not_found' } }, /not_found/],
  ['branch mismatch', { status: 404, body: { authorized: false, reason: 'branch_mismatch' } }, /branch_mismatch/],
  ['non-deployment receipt', { status: 404, body: { authorized: false, reason: 'deployment_not_delegated' } }, /deployment_not_delegated/],
  ['non-releasable task', { status: 404, body: { authorized: false, reason: 'task_not_releasable' } }, /task_not_releasable/],
  ['network failure', { networkError: 'connection refused' }, /network error/],
  ['timeout', { timeout: true }, /timeout/],
]) {
  test(`release receipt gate fails closed for ${name}`, () => {
    const { result } = runReceipt(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expected);
  });
}

test('release receipt branch and explicit task id must match exactly', () => {
  const malformed = runReceipt(authorized(), { branch: 'ai/chatgpt/not-an-orchestrator-task' }).result;
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /must be orchestrator-issued/);

  const mismatched = runReceipt(authorized(), { explicitTaskId: 'orch_00000000-0000-4000-8000-000000000099' }).result;
  assert.notEqual(mismatched.status, 0);
  assert.match(mismatched.stderr, /taskId does not match/);
});

test('release attestation stores only bounded authority evidence', () => {
  const { result, attestation } = runReceipt(authorized({
    requester: 'private-requester',
    intent: 'private-intent',
    bearerToken: 'private-token',
    refreshToken: 'private-refresh',
  }));
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(attestation, /private-requester|private-intent|private-token|private-refresh/);
  assert.match(attestation, /"authority": "ekodi-orchestrator"/);
});
