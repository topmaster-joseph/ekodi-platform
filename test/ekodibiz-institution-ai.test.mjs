import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { institutionAiApi, institutionAiStore } from '../institution-ai-api.js';
import { planInstitutionProviderFallback } from '../institution-ai-routing.js';
import {
  encryptInstitutionPayload, decryptInstitutionPayload, institutionExternalModelAllowed,
  INSTITUTION_AI_MAX_BODY_BYTES,
} from '../institution-ai-security.js';

globalThis.crypto ||= webcrypto;
const KEY = suffix => ('K'.repeat(40) + suffix);
const tenantKeys = keys => ({ status: 'active', keys: { submit: [KEY(keys + '-submit')], assistant: [KEY(keys + '-assistant')], read: [KEY(keys + '-read')], approve: [KEY(keys + '-approve')], execute: [KEY(keys + '-execute')], backup: [KEY(keys + '-backup')], restore: [KEY(keys + '-restore')], route: [KEY(keys + '-route')] } });
const secrets = () => ({
  EKODIBIZ_MODE: 'isolated-staging',
  INSTITUTION_AI_STAGING_PILOT_ENABLED: 'true',
  INSTITUTION_AI_TENANTS_JSON: JSON.stringify({ campus1: tenantKeys('c1'), campus2: tenantKeys('c2') }),
  INSTITUTION_AI_KEYRING_JSON: JSON.stringify({ v1: 'master-secret-tenant-encryption-v1-1234567890', v2: 'master-secret-tenant-encryption-v2-1234567890' }),
  INSTITUTION_AI_ACTIVE_KEY_VERSION: 'v1',
  INSTITUTION_AI_HMAC_KEY: 'independent-persistent-hmac-secret-1234567890',
  INSTITUTION_AI_BACKUP_KEYS_JSON: JSON.stringify({ v1: 'independent-backup-master-secret-v1-1234567890', v2: 'independent-backup-master-secret-v2-1234567890' }),
  INSTITUTION_AI_BACKUP_KEY_VERSION: 'v1',
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
  const storage = fakeStorage(), env = secrets(), storages = new Map();
  env.REVENUE_STORE = { idFromName: name => name, get: name => ({
    fetch: (url, init) => {
      if (!storages.has(name)) storages.set(name, name === 'institution-ai:campus1' ? storage : fakeStorage());
      return institutionAiStore(new Request(url, init), storages.get(name));
    },
  }) };
  return { storage, env, storages };
}
function request(body, role = 'submit', keyTenant = 'campus1', path = 'submit', more = {}) {
  return new Request('https://ekodi.kr/ekodibiz/api/institution-ai/v1/' + path, {
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
  const req = new Request('https://ekodi.kr/ekodibiz/api/institution-ai/v1/health');
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
  const noKey = new Request('https://ekodi.kr/ekodibiz/api/institution-ai/v1/submit', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft()),
  });
  assert.equal((await institutionAiApi(noKey, new URL(noKey.url), env)).status, 403);
  assert.equal((await call(env, draft(), 'submit', 'campus2')).status, 403);
  assert.equal((await call(env, draft(), 'read', 'campus1')).status, 403);
  assert.equal((await call(env, draft(), 'submit', 'campus1', 'submit', { origin: 'https://evil.example' })).status, 403);
  const badMethod = new Request('https://ekodi.kr/ekodibiz/api/institution-ai/v1/status', { method: 'GET' });
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

test('portable conversation persists with unique message ids across AI model switches', async () => {
  const { env, storage } = setup();
  await call(env, draft());
  const id = { tenantId: 'campus1', operationId: 'draft0001' };
  const message = { ...id, messageId: 'message00001', expectedVersion: 1, sender: 'user', text: '이전 AI 대화를 이어가 주세요' };
  const first = await call(env, message, 'submit', 'campus1', 'message');
  assert.equal(first.status, 201);
  assert.equal((await first.json()).job.messageCount, 1);
  assert.equal((await call(env, message, 'submit', 'campus1', 'message')).status, 200);
  assert.equal((await call(env, { ...message, text: '교체 공격' }, 'submit', 'campus1', 'message')).status, 409);
  assert.equal((await call(env, { ...message, messageId: 'message00002', expectedVersion: 1 }, 'submit', 'campus1', 'message')).status, 409);
  const assistant = { ...message, messageId: 'message00002', expectedVersion: 2, sender: 'assistant', text: '맥락을 보존한 초안입니다.' };
  assert.equal((await call(env, assistant, 'submit', 'campus1', 'message')).status, 403);
  assert.equal((await call(env, assistant, 'assistant', 'campus1', 'message')).status, 201);
  const contents = JSON.stringify([...storage.values.values()]);
  assert.equal(contents.includes('이전 AI 대화를'), false);
  assert.equal(contents.includes('맥락을 보존한'), false);
  env.INSTITUTION_AI_ACTIVE_KEY_VERSION = 'v2';
  const result = await (await call(env, id, 'read', 'campus1', 'export')).json();
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].sender, 'user');
  assert.equal(result.messages[1].text, '맥락을 보존한 초안입니다.');
  assert.equal(result.job.messageCount, 2);
  assert.equal(result.audit.length, 3);
  assert.equal((await call(env, id, 'read', 'campus2', 'export')).status, 403);
});

test('each institution routes to a separate Durable Object instance', async () => {
  const { env, storages } = setup();
  await call(env, draft('scoped0001'));
  await call(env, { ...draft('scoped0002'), tenantId: 'campus2' }, 'submit', 'campus2');
  assert.equal(storages.has('institution-ai:campus1'), true);
  assert.equal(storages.has('institution-ai:campus2'), true);
  assert.notEqual(storages.get('institution-ai:campus1'), storages.get('institution-ai:campus2'));
});

test('job snapshot tampering fails closed even when audit-event hashes remain intact', async () => {
  const { env, storage } = setup();
  const created = await call(env, draft('digest0001'));
  assert.equal(created.status, 201);
  const id = { tenantId: 'campus1', operationId: 'digest0001' };
  const recordKey = 'institution:job:campus1:digest0001';
  const original = structuredClone(storage.values.get(recordKey));
  const changes = [
    { ...original, status: 'completed' },
    { ...original, classification: 'public' },
    { ...original, sealed: { ...original.sealed, iv: 'AAAA' } },
    { ...original, messages: [{ messageId: 'forged00001' }] },
  ];
  for (const modified of changes) {
    storage.values.set(recordKey, modified);
    const response = await call(env, id, 'read', 'campus1', 'export');
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'AUDIT_INTEGRITY_FAILURE');
  }
  storage.values.set(recordKey, original);
  const restored = await call(env, id, 'read', 'campus1', 'export');
  assert.equal(restored.status, 200);
  const payload = await restored.json();
  assert.equal(payload.audit.length, 1);
  assert.match(payload.audit[0].stateHash, /^[a-f0-9]{64}$/);
});

test('assistant role cannot forge user messages and submission role cannot forge assistant messages', async () => {
  const { env } = setup();
  assert.equal((await call(env, draft())).status, 201);
  const id = { tenantId: 'campus1', operationId: 'draft0001', messageId: 'rolecheck0001', expectedVersion: 1 };
  assert.equal((await call(env, { ...id, sender: 'assistant', text: 'forged AI output' }, 'submit', 'campus1', 'message')).status, 403);
  assert.equal((await call(env, { ...id, sender: 'user', text: 'forged user input' }, 'assistant', 'campus1', 'message')).status, 403);
  assert.equal((await call(env, { ...id, sender: 'user', text: 'actual user input' }, 'submit', 'campus1', 'message')).status, 201);
  const next = { ...id, messageId: 'rolecheck0002', expectedVersion: 2, sender: 'assistant', text: 'model output' };
  assert.equal((await call(env, next, 'assistant', 'campus1', 'message')).status, 201);
  const state = await (await call(env, { tenantId: 'campus1', operationId: 'draft0001' }, 'read', 'campus1', 'status')).json();
  assert.deepEqual(state.messages.map(m => m.sender), ['user', 'assistant']);
  assert.deepEqual(state.audit.map(e => e.role), ['submit', 'submit', 'assistant']);
});

test('pilot gate denies production and disabled staging even with otherwise valid credentials', async () => {
  const { env } = setup();
  assert.equal((await call(env, draft('pilot00001'))).status, 201);
  const prod = { ...env, EKODIBIZ_MODE: 'operational-mvp' };
  const result = await call(prod, draft('pilot00002'));
  assert.equal(result.status, 503);
  assert.equal((await result.json()).code, 'INSTITUTION_AI_PILOT_DISABLED');
  const stopped = { ...env, INSTITUTION_AI_STAGING_PILOT_ENABLED: 'false' };
  assert.equal((await call(stopped, draft('pilot00003'))).status, 503);
  const unset = { ...env };
  delete unset.INSTITUTION_AI_STAGING_PILOT_ENABLED;
  assert.equal((await call(unset, draft('pilot00004'))).status, 503);
  const otherMode = { ...env, EKODIBIZ_MODE: 'unknown' };
  assert.equal((await call(otherMode, draft('pilot00005'))).status, 503);
});

test('sealed backup and create-only restore preserve encrypted conversation and audit', async () => {
  const original = setup();
  assert.equal((await call(original.env, draft('recovery0001'))).status, 201);
  const id = { tenantId: 'campus1', operationId: 'recovery0001' };
  const firstMsg = await call(original.env, { ...id, messageId: 'replay00001', expectedVersion: 1, sender: 'user', text: '민감한 기관 대화' },
    'submit', 'campus1', 'message');
  assert.equal(firstMsg.status, 201);
  const result = await call(original.env, id, 'backup', 'campus1', 'backup');
  assert.equal(result.status, 200);
  const { archive } = await result.json();
  assert.equal(archive.format, 'ekodi.institution-ai.encrypted-backup/v1');
  assert.equal(JSON.stringify(archive).includes('민감한 기관 대화'), false);
  assert.equal(JSON.stringify(archive).includes('기관 기밀 내용'), false);
  assert.ok(archive.ciphertext.length > 100);
  // Backups must not disclose work-data encryption keys, even to their holder.
  assert.equal(JSON.stringify(archive).includes('master-secret'), false);
  assert.equal((await call(original.env, id, 'restore', 'campus1', 'restore-check', {})).status, 503);
  const recovery = setup();
  const restoreBody = { ...id, archive };
  const preflight = await call(recovery.env, restoreBody, 'restore', 'campus1', 'restore-check');
  assert.equal(preflight.status, 200);
  assert.equal((await preflight.json()).restoreEligible, true);
  assert.equal((await call(recovery.env, restoreBody, 'backup', 'campus1', 'restore')).status, 403);
  const disabled = await call(recovery.env, restoreBody, 'restore', 'campus1', 'restore');
  assert.equal(disabled.status, 503);
  assert.equal((await disabled.json()).code, 'RESTORE_DISABLED');
  recovery.env.INSTITUTION_AI_RESTORE_ENABLED = 'true';
  assert.equal((await call(recovery.env, restoreBody, 'restore', 'campus1', 'restore')).status, 201);
  const read = await call(recovery.env, id, 'read', 'campus1', 'status');
  assert.equal(read.status, 200);
  const current = await read.json();
  assert.equal(current.messages[0].text, '민감한 기관 대화');
  assert.equal(current.payload.text, '기관 기밀 내용');
  assert.equal(current.audit.length, 2);
  assert.equal(current.job.version, 2);
  assert.equal((await call(recovery.env, restoreBody, 'restore', 'campus1', 'restore')).status, 409);
  assert.equal((await call(recovery.env, restoreBody, 'restore', 'campus1', 'restore-check')).status, 409);
});

test('backup restore rejects tampering, cross-tenant replay and missing key versions', async () => {
  const original = setup();
  await call(original.env, draft('archive0001'));
  const id = { tenantId: 'campus1', operationId: 'archive0001' };
  const archive = (await (await call(original.env, id, 'backup', 'campus1', 'backup')).json()).archive;
  const newStore = setup();
  const changed = { ...archive, ciphertext: (archive.ciphertext[0] === 'A' ? 'B' : 'A') + archive.ciphertext.slice(1) };
  assert.equal((await call(newStore.env, { ...id, archive: changed }, 'restore', 'campus1', 'restore-check')).status, 503);
  assert.equal((await call(newStore.env, { ...id, archive, tenantId: 'campus2' }, 'restore', 'campus2', 'restore-check')).status, 503);
  assert.equal((await call(newStore.env, { ...id, archive, operationId: 'archive0002' }, 'restore', 'campus1', 'restore-check')).status, 503);
  const noKey = setup();
  delete noKey.env.INSTITUTION_AI_BACKUP_KEYS_JSON;
  assert.equal((await call(noKey.env, { ...id, archive }, 'restore', 'campus1', 'restore-check')).status, 503);
  // A key rotation is compatible when the previous version remains in the keyring.
  newStore.env.INSTITUTION_AI_BACKUP_KEY_VERSION = 'v2';
  assert.equal((await call(newStore.env, { ...id, archive }, 'restore', 'campus1', 'restore-check')).status, 200);
  const disabledMode = { ...newStore.env, EKODIBIZ_MODE: 'operational-mvp', INSTITUTION_AI_RESTORE_ENABLED: 'true' };
  assert.equal((await call(disabledMode, { ...id, archive }, 'restore', 'campus1', 'restore')).status, 503);
});

test('backup refuses records exceeding the bounded pilot archive rather than truncating transcripts', async () => {
  const { env } = setup();
  const id = { tenantId: 'campus1', operationId: 'large00001' };
  assert.equal((await call(env, { ...draft(id.operationId), payload: { text: 'x'.repeat(7000) } })).status, 201);
  const result = await call(env, id, 'backup', 'campus1', 'backup');
  // Small pilot archive is bounded at 12KiB; large content remains private and intact.
  assert.equal(result.status, 200);
  const append = { ...id, messageId: 'large-msg001', expectedVersion: 1, sender: 'user', text: 'y'.repeat(4000) };
  assert.equal((await call(env, append, 'submit', 'campus1', 'message')).status, 201);
  const rejected = await call(env, id, 'backup', 'campus1', 'backup');
  assert.equal(rejected.status, 413);
  assert.equal((await rejected.json()).code, 'BACKUP_TOO_LARGE');
  const stillThere = await (await call(env, id, 'read', 'campus1', 'status')).json();
  assert.equal(stillThere.messages[0].text.length, 4000);
});

const routeProvider = (id, model, costClass = 'free-preferred') => ({
  id, model, available: true, officialPath: true, automationAllowed: true,
  capabilities: ['text', 'reasoning'], costClass, fundingSource: 'ekodi', resourceClass: 'hosted-ai',
});
const approvedRoute = (id, model, costClass = 'free-preferred') => ({
  id, model, costClass, classifications: ['public', 'internal'],
  capabilities: ['text'], dataTransferApproved: true, tenantEntitlementVerified: true,
});
const routePolicy = (providers, more = {}) => ({
  status: 'active', dataTransferApproved: true, allowFailover: true, billingApproved: false,
  providers, ...more,
});
const routingEnv = policies => ({
  INSTITUTION_AI_PROVIDER_PLAN_ENABLED: 'true',
  INSTITUTION_AI_PROVIDER_POLICIES_JSON: JSON.stringify(policies),
});
const routingJob = (change = {}) => ({
  tenantId: 'campus1', operationId: 'routes0001', classification: 'internal',
  taskType: 'draft', status: 'queued', ...change,
});

test('explicit tenant provider policy plans read-only failover with no model calls', () => {
  const env = routingEnv({ campus1: routePolicy([
    approvedRoute('provider-a', 'approved-v1'),
    approvedRoute('provider-b', 'approved-v2'),
  ]) });
  const observed = [
    routeProvider('provider-a', 'approved-v1'),
    routeProvider('provider-b', 'approved-v2'),
    routeProvider('other-unapproved', 'whatever'),
  ];
  const decision = planInstitutionProviderFallback(env, 'campus1', routingJob(), observed);
  assert.equal(decision.mode, 'configuration_only');
  assert.equal(decision.plannedFailover, true);
  assert.deepEqual(decision.eligibleProviderIds, ['provider-a', 'provider-b']);
  assert.equal(decision.readyForLiveInvocation, false);
  assert.equal(decision.externalCallsMade, 0);
  assert.equal(JSON.stringify(decision).includes('whatever'), false);
});

test('plan refuses tenant mismatch, secret absence, changed classification, side effects and paid fallback', () => {
  const paid = approvedRoute('provider-paid', 'paid-v1', 'paid-opt-in');
  const free = approvedRoute('provider-free', 'free-v1');
  const registry = [routeProvider('provider-free', 'free-v1'),
    routeProvider('provider-paid', 'paid-v1', 'paid-opt-in')];
  const env = routingEnv({ campus1: routePolicy([paid, free]) });
  const plan = (job = routingJob(), e = env) =>
    planInstitutionProviderFallback(e, 'campus1', job, registry);
  assert.equal(plan(routingJob({ tenantId: 'campus2' })).mode, 'core_only');
  assert.equal(plan(routingJob({ classification: 'restricted' })).reason, 'EXTERNAL_TRANSFER_DENIED');
  assert.equal(plan(routingJob({ classification: 'confidential' })).reason, 'EXTERNAL_TRANSFER_DENIED');
  assert.equal(plan(routingJob({ taskType: 'payment' })).reason, 'EXTERNAL_TRANSFER_DENIED');
  assert.equal(plan(routingJob({ status: 'completed' })).reason, 'JOB_NOT_ROUTABLE');
  assert.deepEqual(plan().eligibleProviderIds, ['provider-free']);
  assert.deepEqual(plan(routingJob(), routingEnv({
    campus1: routePolicy([paid, free], { billingApproved: true }),
  })).eligibleProviderIds, ['provider-paid', 'provider-free']);
  assert.equal(plan(routingJob(), { ...env, INSTITUTION_AI_PROVIDER_PLAN_ENABLED: 'false' }).mode, 'core_only');
  assert.throws(() => plan(routingJob(), { INSTITUTION_AI_PROVIDER_PLAN_ENABLED: 'true' }),
    /INSTITUTION_ROUTING_NOT_CONFIGURED/);
  assert.deepEqual(plan(routingJob(), routingEnv({
    campus1: routePolicy([free], { status: 'suspended' }),
  })).eligibleProviderIds, []);
});

test('provider model, entitlement, status, cost, funding and permission must exactly match', () => {
  const entry = approvedRoute('provider-a', 'v1');
  const env = routingEnv({ campus1: routePolicy([entry]) });
  const approved = routeProvider('provider-a', 'v1');
  const call = statuses => planInstitutionProviderFallback(env, 'campus1', routingJob(), statuses);
  for (const modified of [
    { ...approved, available: false },
    { ...approved, officialPath: false },
    { ...approved, automationAllowed: false },
    { ...approved, model: 'unreviewed-v2' },
    { ...approved, costClass: 'paid-opt-in' },
    { ...approved, fundingSource: 'personal' },
    { ...approved, resourceClass: 'personal-api' },
    { ...approved, capabilities: ['vision'] },
  ]) {
    assert.equal(call([modified]).reason, 'NO_APPROVED_PROVIDER');
  }
  assert.equal(planInstitutionProviderFallback(routingEnv({
    campus1: routePolicy([{ ...entry, dataTransferApproved: false }]),
  }), 'campus1', routingJob(), [approved]).reason, 'PROVIDER_POLICY_INVALID');
  assert.equal(planInstitutionProviderFallback(routingEnv({
    campus1: routePolicy([{ ...entry, tenantEntitlementVerified: false }]),
  }), 'campus1', routingJob(), [approved]).reason, 'PROVIDER_POLICY_INVALID');
  assert.equal(planInstitutionProviderFallback(routingEnv({
    campus1: routePolicy([entry, entry]),
  }), 'campus1', routingJob(), [approved]).reason, 'PROVIDER_POLICY_INVALID');
});

test('route-plan gateway needs a dedicated role and refuses request classification downgrade', async () => {
  const { env } = setup();
  const id = { tenantId: 'campus1', operationId: 'payment0009' };
  assert.equal((await call(env, external(id.operationId))).status, 201);
  assert.equal((await call(env, id, 'read', 'campus1', 'provider-plan')).status, 403);
  env.INSTITUTION_AI_PROVIDER_PLAN_ENABLED = 'true';
  env.INSTITUTION_AI_PROVIDER_POLICIES_JSON = JSON.stringify({
    campus1: routePolicy([approvedRoute('gemini', 'fake-approved-model')]),
  });
  const denied = await call(env, { ...id, classification: 'public', taskType: 'draft' },
    'route', 'campus1', 'provider-plan');
  assert.equal(denied.status, 200);
  const result = await denied.json();
  assert.equal(result.mode, 'core_only');
  assert.equal(result.reason, 'EXTERNAL_TRANSFER_DENIED');
  assert.equal(result.externalCallsMade, 0);
  assert.equal((await call(env, id, 'route', 'campus2', 'provider-plan')).status, 403);
  assert.equal((await call({ ...env, EKODIBIZ_MODE: 'operational-mvp' }, id,
    'route', 'campus1', 'provider-plan')).status, 503);
});
