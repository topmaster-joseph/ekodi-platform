import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGitOpsRequest } from '../scripts/resolve-cloud-control-request.mjs';

const now = Date.parse('2026-08-22T21:50:00Z');
const base = {
  schema: 'ekodi.cloud-control.request.v1',
  operation: 'workers-builds-trigger-disconnect',
  target: 'ekodi-platform',
  mode: 'plan',
  confirmation: '',
  reason: 'Verify the legacy Workers Builds trigger before disconnecting it.',
  requestId: 'workers-builds-plan-20260823-01',
  expiresAt: '2026-08-23T03:00:00Z',
};

test('GitOps Cloud Control plan request is accepted for the allowlisted operation only', () => {
  assert.deepEqual(validateGitOpsRequest(base, now), base);
  assert.throws(() => validateGitOpsRequest({ ...base, target: 'ekodi-control' }, now), /not allowlisted/);
  assert.throws(() => validateGitOpsRequest({ ...base, operation: 'delete-worker' }, now), /Unsupported Cloud Control operation/);
});

test('apply request requires the exact break-glass confirmation', () => {
  assert.throws(
    () => validateGitOpsRequest({ ...base, mode: 'apply', confirmation: '' }, now),
    /DISCONNECT_EKODI_PLATFORM_BUILDS/,
  );
  assert.equal(
    validateGitOpsRequest({ ...base, mode: 'apply', confirmation: 'DISCONNECT_EKODI_PLATFORM_BUILDS' }, now).mode,
    'apply',
  );
});

test('request expires and cannot have a TTL beyond 24 hours', () => {
  assert.throws(() => validateGitOpsRequest({ ...base, expiresAt: '2026-08-22T21:49:59Z' }, now), /expired/);
  assert.throws(() => validateGitOpsRequest({ ...base, expiresAt: '2026-08-24T21:50:01Z' }, now), /TTL exceeds 24 hours/);
});

test('plan request cannot smuggle an apply confirmation or multiline audit values', () => {
  assert.throws(
    () => validateGitOpsRequest({ ...base, confirmation: 'DISCONNECT_EKODI_PLATFORM_BUILDS' }, now),
    /must not include/,
  );
  assert.throws(() => validateGitOpsRequest({ ...base, reason: 'line1\nline2' }, now), /single-line/);
});
