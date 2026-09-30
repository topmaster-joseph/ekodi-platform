import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SECURE_PROJECTION_POLICY,
  projectForExternalAi,
  projectionProfileForPrincipal,
  projectionStamp,
  projectValue,
  sanitizeProjectionText,
} from '../secure-projection.js';

test('secure projection never emits secret or internal-topology fields', () => {
  const projected = projectValue({
    workspaceId: 'workspace-001',
    email: 'person@example.com',
    phone: '010-1234-5678',
    apiKey: 'sk-proj-abcdefghijklmnop1234',
    repository: 'topmaster-joseph/ekodi-platform',
    branch: 'main',
    nested: { password: 'super-secret', status: 'active' },
  }, { profile: 'experience_public', purpose: 'experience' });

  assert.match(projected.workspaceId, /^ref_/);
  assert.equal(projected.email, 'p***@example.com');
  assert.equal(projected.phone, '***-****-5678');
  assert.equal(projected.apiKey, undefined);
  assert.equal(projected.repository, undefined);
  assert.equal(projected.branch, undefined);
  assert.equal(projected.nested.password, undefined);
  assert.equal(projected.nested.status, 'active');
});

test('self projection preserves user-owned contact data but never secrets or topology', () => {
  const projected = projectValue({
    email: 'person@example.com',
    phone: '010-1234-5678',
    endpoint: 'https://private.internal.example',
    accessToken: 'token-value',
  }, { profile: 'user_self', purpose: 'self' });

  assert.equal(projected.email, 'person@example.com');
  assert.equal(projected.phone, '010-1234-5678');
  assert.equal(projected.endpoint, undefined);
  assert.equal(projected.accessToken, undefined);
});

test('safe admin projection removes recovery artifacts and masks personal data', () => {
  const projected = projectValue({
    customerEmail: 'owner@example.com',
    recovery: {
      verified: true,
      artifactName: 'core-export-20260903.sql',
      checksumSha256: 'abc123',
      restoreIntegrity: 'ok',
    },
  }, { profile: 'admin_safe', purpose: 'admin-recovery-status' });

  assert.equal(projected.customerEmail, 'o***@example.com');
  assert.equal(projected.recovery.artifactName, undefined);
  assert.equal(projected.recovery.checksumSha256, undefined);
  assert.equal(projected.recovery.restoreIntegrity, 'ok');
});

test('external AI projection drops structured PII, redacts free-text leakage, and pseudonymizes scope IDs', async () => {
  const projected = await projectForExternalAi({
    workspaceId: 'workspace-001',
    actorId: 'user-123',
    email: 'owner@example.com',
    endpoint: 'https://internal.example',
    secret: 'never-send-me',
    prompt: 'Contact owner@example.com or 010-1234-5678. Host 10.0.0.4. Bearer abcdefghijklmnopqrstuvwxyz',
  }, { profile: 'ai_minimum', purpose: 'test-ai', salt: 'request-1' });

  assert.match(projected.workspaceId, /^ref_[a-f0-9]{16}$/);
  assert.match(projected.actorId, /^ref_[a-f0-9]{16}$/);
  assert.notEqual(projected.workspaceId, 'workspace-001');
  assert.equal(projected.email, undefined);
  assert.equal(projected.endpoint, undefined);
  assert.equal(projected.secret, undefined);
  assert.match(projected.prompt, /\[REDACTED_EMAIL\]/);
  assert.match(projected.prompt, /\[REDACTED_PHONE\]/);
  assert.match(projected.prompt, /\[REDACTED_IP\]/);
  assert.doesNotMatch(projected.prompt, /abcdefghijklmnopqrstuvwxyz/);
});

test('projection profiles default to safe views by surface and role', () => {
  assert.equal(projectionProfileForPrincipal(null, { surface: 'experience' }), 'experience_public');
  assert.equal(projectionProfileForPrincipal({ kind: 'customer' }, { surface: 'self' }), 'user_self');
  assert.equal(projectionProfileForPrincipal({ kind: 'admin' }), 'admin_safe');
  assert.equal(projectionProfileForPrincipal({ kind: 'admin' }, { elevated: true }), 'admin_diagnostic');
  assert.equal(projectionProfileForPrincipal({ kind: 'customer' }, { surface: 'ai' }), 'ai_minimum');
  const stamp = projectionStamp('admin_safe', 'test');
  assert.equal(stamp.policyVersion, SECURE_PROJECTION_POLICY.version);
  assert.equal(stamp.minimumDisclosure, true);
  assert.equal(stamp.secretsProjected, false);
  assert.equal(stamp.sourceTopologyProjected, false);
});

test('strict text sanitization removes provider secrets and local paths', () => {
  const text = sanitizeProjectionText('password=secret123 C:\\work\\ekodi\\file.js sk-proj-abcdefghijklmnop', { strict: true });
  assert.match(text, /password=\[REDACTED\]/);
  assert.match(text, /\[REDACTED_PATH\]/);
  assert.match(text, /\[REDACTED_KEY\]/);
});
