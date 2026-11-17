import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { institutionAiApi, institutionAiStore } from '../institution-ai-api.js';
import {
  encryptInstitutionPayload, decryptInstitutionPayload, institutionExternalModelAllowed,
  INSTITUTION_AI_MAX_BODY_BYTES,
} from '../institution-ai-security.js';

globalThis.crypto ||= webcrypto;
const KEY = suffix => ('K'.repeat(40) + suffix);
const tenantKeys = keys => ({ status: 'active', keys: { submit: [KEY(keys + '-submit')], read: [KEY(keys + '-read')], approve: [KEY(keys + '-approve')], execute: [KEY(keys + '-execute')] } });
const secrets = () => ({
  INSTITUTION_AI_TENANTS_JSON: JSON.stringify({ campus1: tenantKeys('c1'), campus2: tenantKeys('c2') }),
  INSTITUTION_AI_KEYRING_JSON: JSON.stringify({ v1: 'master-secret-tenant-encryption-v1-1234567890', v2: 'master-secret-tenant-encryption-v2-1234567890' }),
  INSTITUTION_AI_ACTIVE_KEY_VERSION: 'v1',
  INSTITUTION_AI_HMAC_KEY: 'independent-persistent-hmac-secret-1234567890',
});
function fakeStorage() {
  const values = new Map();
  return {
    values,
    async get(key) { return values.get(key); },
    async put(key, value) { values.set(key, structuredClone(value)); },
    async list({ prefix }) { return new Map([...values].filter(([k]) => k.startsWith(prefix))); },
    async transaction(fn) { return fn(this); },
  };
}
function setup() {
  const storage = fakeStorage(), env = secrets();
  env.REVENUE_STORE = { idFromName: () => 'central', get: () => ({
    fetch: (url, init) => institutionAiStore(new Request(url, init), storage),
  }) };
  return { storage, env };
}
function request(body, role = 'submit', keyTenant = 'campus1', path = 'submit', more = {}) {
  return new Request('https://biz.ekodi.kr/api/institution-ai/v1/' + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ekodi-institution-key': KEY((keyTenant === 'campus1' ? 'c1' : 'c2') + '-' + role),
      ...more,
    },
    body: JSON.stringify(body),
  });
}
async function call(env, body, role = 'submit', keyTenant = 'campus1', action = 'submit', extra = {}) {
  const req = request(body, role, keyTenant, action, extra);
  return institutionAiApi(req, new URL(req.url), env);
}
const draft = (operationId = 'draft0001') => ({
  tenantId: 'campus1', operationId, taskType: 'draft', classification: 'internal',
  payload: { documentTitle: '교내 행사 계획', text: '기관 기밀 내용' },
});
const external = (operationId = 'payment0001') => ({
  tenantId: 'campus1', operationId, taskType: 'payment', classification: 'restricted',
  payload: { amount: 20000, description: 'not a real charge' },
});
test('locked health has no secrets and no account status', async () => {
  const { env } = setup();
  const req = new Request('https://biz.ekodi.kr/api/institution-ai/v1/health');
  const response = await institutionAiApi(req, new URL(req.url), {});
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.externalExecutionEnabled, false);
  assert.equal(JSON.stringify(result).includes('campus1'), false);
  delete env.INSTITUTION_AI_KEYRING_JSON;
  const denied = await call(env, draft());
  assert.equal(denied.status, 503);
});
test('tenant and role isolation: no origin, no key, no cross-tenant access', async () => {
  const { env } = setup();
  const noKey = new Request('https://biz.ekodi.kr/api/institution-ai/v1/submit', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft()),
  });
  assert.equal((await institutionAiApi(noKey, new URL(noKey.url), env)).status, 403);
  assert.equal((await call(env, draft(), 'submit', 'campus2')).status, 403);
  assert.equal((await call(env, draft(), 'read', 'campus1')).status, 403);
  assert.equal((await call(env, draft(), 'submit', 'campus1', 'submit', { origin: 'https://evil.example' })).status, 403);
  const badMethod = new Request('https://biz.ekodi.kr/api/institution-ai/v1/status', { method: 'GET' });
  assert.equal((await institutionAiApi(badMethod, new URL(badMethod.url), env)).status, 404);
});
test('idempotent encrypted creation, authorized status, export and rotation', async () => {
  const { env, storage } = setup();
  const first = await call(env, draft());
  assert.equal(first.status, 201);
  assert.equal((await first.json()).job.status, 'queued');
  const raw = JSON.stringify([...storage.values.values()]);
  assert.equal(raw.includes('기관 기밀 내용'), false);
  const repeated = await call(env, draft());
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).idempotent, true);
  const different = { ...draft(), payload: { text: 'replaced' } };
  assert.equal((await call(env, different)).status, 409);
  const body = { tenantId: 'campus1', operationId: 'draft0001' };
  const read = await call(env, body, 'read', 'campus1', 'status');
  assert.equal((await read.json()).payload.text, '기관 기밀 내용');
  const exported = await call(env, body, 'read', 'campus1', 'export');
  assert.equal((await exported.json()).format, 'ekodi.institution-ai.work/v1');
  // Encryption key rotation must retain decryption of previously stored records.
  env.INSTITUTION_AI_ACTIVE_KEY_VERSION = 'v2';
  const afterRotation = await call(env, body, 'read', 'campus1', 'status');
  assert.equal((await afterRotation.json()).payload.text, '기관 기밀 내용');
  assert.equal((await call(env, draft())).status, 200);
});
test('write checkpoints are versioned and recorded; completion requires evidence', async () => {
  const { env } = setup();
  await call(env, draft());
  const id = { tenantId: 'campus1', operationId: 'draft0001' };
  const started = await call(env, { ...id, expectedVersion: 1, nextStatus: 'processing' }, 'execute', 'campus1', 'checkpoint');
  assert.equal((await started.json()).job.version, 2);
  assert.equal((await call(env, { ...id, expectedVersion: 1, nextStatus: 'completed' }, 'execute', 'campus1', 'checkpoint')).status, 409);
  assert.equal((await call(env, { ...id, expectedVersion: 2, nextStatus: 'completed' }, 'execute', 'campus1', 'checkpoint')).status, 409);
  const complete = await call(env, { ...id, expectedVersion: 2, nextStatus: 'completed', evidenceRef: 'archive:doc:12345678' }, 'execute', 'campus1', 'checkpoint');
  assert.equal((await complete.json()).job.status, 'completed');
  const read = await call(env, id, 'read', 'campus1', 'status');
  const result = await read.json();
  assert.equal(result.audit.length, 3);
  assert.equal(result.audit[2].prevHash, result.audit[1].hash);
  assert.equal(result.audit[1].prevHash, result.audit[0].hash);
  assert.equal(result.job.auditHead, result.audit[2].hash);
});
test('high impact remains approval gated, never executes or falsely completes', async () => {
  const { env } = setup();
  const start = await call(env, external());
  assert.equal((await start.json()).job.status, 'awaiting_approval');
  const id = { tenantId: 'campus1', operationId: 'payment0001' };
  assert.equal((await call(env, { ...id, expectedVersion: 1 }, 'submit', 'campus1', 'approve')).status, 403);
  assert.equal((await call(env, { ...id, expectedVersion: 1 }, 'approve', 'campus1', 'approve')).status, 409);
  const approved = await call(env, { ...id, expectedVersion: 1, evidenceRef: 'approval:review:123456' }, 'approve', 'campus1', 'approve');
  assert.equal((await approved.json()).job.status, 'approved');
  const begun = await call(env, { ...id, expectedVersion: 2, nextStatus: 'processing' }, 'execute', 'campus1', 'checkpoint');
  assert.equal((await begun.json()).job.status, 'processing');
  assert.equal((await call(env, { ...id, expectedVersion: 3, nextStatus: 'completed', evidenceRef: 'receipt:1234567890' }, 'execute', 'campus1', 'checkpoint')).status, 409);
  const ambiguous = await call(env, { ...id, expectedVersion: 3, nextStatus: 'needs_reconciliation' }, 'execute', 'campus1', 'checkpoint');
  assert.equal((await ambiguous.json()).job.status, 'needs_reconciliation');
  assert.equal((await call(env, { ...id, expectedVersion: 4, nextStatus: 'processing' }, 'execute', 'campus1', 'checkpoint')).status, 409);
});
test('AES-GCM refuses wrong tenant/record associated data or tampering', async () => {
  const env = secrets();
  const sealed = await encryptInstitutionPayload(env, 'campus1', 'draft0001', { private: 'yes' });
  assert.deepEqual(await decryptInstitutionPayload(env, 'campus1', 'draft0001', sealed), { private: 'yes' });
  await assert.rejects(decryptInstitutionPayload(env, 'campus2', 'draft0001', sealed));
  await assert.rejects(decryptInstitutionPayload(env, 'campus1', 'draft0002', sealed));
  const tampered = { ...sealed, ciphertext: sealed.ciphertext.slice(0, -3) + 'AAA' };
  await assert.rejects(decryptInstitutionPayload(env, 'campus1', 'draft0001', tampered));
});
test('oversized submissions and model transfer without policy fail closed', async () => {
  const { env } = setup();
  const huge = { ...draft(), payload: { content: 'a'.repeat(INSTITUTION_AI_MAX_BODY_BYTES) } };
  assert.equal((await call(env, huge)).status, 413);
  assert.equal(institutionExternalModelAllowed('restricted', ['openai'], 'openai'), false);
  assert.equal(institutionExternalModelAllowed('confidential', ['openai'], 'openai'), false);
  assert.equal(institutionExternalModelAllowed('internal', [], 'openai'), false);
  assert.equal(institutionExternalModelAllowed('internal', ['openai'], 'openai'), true);
});

test('tampered audit entries fail closed instead of silently exporting', async () => {
  const { env, storage } = setup();
  await call(env, draft());
  const id = { tenantId: 'campus1', operationId: 'draft0001' };
  assert.equal((await call(env, id, 'read', 'campus2', 'status')).status, 403);
  const auditKey = [...storage.values.keys()].find(key => key.startsWith('institution:audit:'));
  const entry = storage.values.get(auditKey);
  storage.values.set(auditKey, { ...entry, role: 'untrusted_modified' });
  const read = await call(env, id, 'read', 'campus1', 'status');
  assert.equal(read.status, 503);
  assert.equal((await read.json()).code, 'AUDIT_INTEGRITY_FAILURE');
});
