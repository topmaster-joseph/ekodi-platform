import {
  authorizeInstitutionServer, activeInstitutionKeyVersion, decryptInstitutionPayload,
  encryptInstitutionPayload, fingerprintInstitutionRequest, validateInstitutionJob,
  readInstitutionJson, INSTITUTION_AI_HIGH_IMPACT,
} from './institution-ai-security.js';
import { sealInstitutionBackup, openInstitutionBackup } from './institution-ai-backup.js';
import { planInstitutionProviderFallback } from './institution-ai-routing.js';
import { getEkodiAiProviderRegistryStatus } from './ekodi-ai-provider-registry.js';

const API_PREFIX = '/api/institution-ai/v1/';
const DO_PREFIX = '/institution-ai/';
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer' };
const JOB_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const TENANT_ID = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const EVIDENCE_REF = /^[a-zA-Z0-9][a-zA-Z0-9:/._-]{7,159}$/;
const checksum = async value => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
};
// Do not trust mutable job metadata solely because its event list has a valid
// hash chain. Bind the complete encrypted job snapshot to its last audit event.
function recordStateMaterial(record) {
  return JSON.stringify({
    tenantId: record.tenantId,
    operationId: record.operationId,
    taskType: record.taskType,
    classification: record.classification,
    sealed: record.sealed,
    fingerprint: record.fingerprint,
    status: record.status,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    messages: record.messages || [],
  });
}
const recordStateHash = record => checksum(recordStateMaterial(record));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
async function verifyAuditTrail(record, audit) {
  if (!Array.isArray(audit) || audit.length !== record.version || record.version < 1) return false;
  let previous = 'genesis';
  for (let i = 0; i < audit.length; i++) {
    const event = audit[i];
    if (event.seq !== i + 1 || event.prevHash !== previous) return false;
    const { seq, type, role, at, evidenceRef, prevHash, stateHash } = event;
    // Old/unanchored entries cannot be considered integrity-verified.
    if (!/^[a-f0-9]{64}$/.test(String(stateHash || ''))) return false;
    if (event.hash !== await checksum(JSON.stringify({ seq, type, role, at, evidenceRef, prevHash, stateHash }))) return false;
    previous = event.hash;
  }
  return record.auditHead === previous
    && record.updatedAt === audit[audit.length - 1]?.at
    && audit[audit.length - 1]?.stateHash === await recordStateHash(record);
}
const keyFor = (tenantId, operationId) => 'institution:job:' + tenantId + ':' + operationId;
const logPrefix = (tenantId, operationId) => 'institution:audit:' + tenantId + ':' + operationId + ':';
const publicJob = record => ({
  tenantId: record.tenantId, operationId: record.operationId, taskType: record.taskType,
  classification: record.classification, status: record.status, version: record.version,
  createdAt: record.createdAt, updatedAt: record.updatedAt, auditHead: record.auditHead,
  encryptionKeyVersion: record.sealed.version, messageCount: (record.messages || []).length, externalExecutionEnabled: false,
});

async function appendEvent(transaction, record, type, role, evidenceRef = '') {
  const seq = record.version;
  const item = {
    seq, type, role, at: record.updatedAt, evidenceRef: evidenceRef || null,
    prevHash: record.auditHead || 'genesis',
    stateHash: await recordStateHash(record),
  };
  item.hash = await checksum(JSON.stringify(item));
  await transaction.put(logPrefix(record.tenantId, record.operationId) + String(seq).padStart(9, '0'), item);
  record.auditHead = item.hash;
}
async function doGet(storage, tenantId, operationId) {
  const record = await storage.get(keyFor(tenantId, operationId));
  if (!record) return json({ code: 'NOT_FOUND' }, 404);
  const events = await storage.list({ prefix: logPrefix(tenantId, operationId) });
  return json({ ok: true, record, audit: [...events.values()] });
}
async function doSubmit(storage, body) {
  return storage.transaction(async tx => {
    const key = keyFor(body.tenantId, body.operationId);
    const existing = await tx.get(key);
    if (existing) return existing.fingerprint === body.fingerprint
      ? json({ ok: true, idempotent: true, job: publicJob(existing) })
      : json({ code: 'IDEMPOTENCY_CONFLICT' }, 409);
    const at = new Date().toISOString();
    const highImpact = INSTITUTION_AI_HIGH_IMPACT.includes(body.taskType);
    const record = {
      tenantId: body.tenantId, operationId: body.operationId, taskType: body.taskType,
      classification: body.classification, sealed: body.sealed, fingerprint: body.fingerprint,
      status: highImpact ? 'awaiting_approval' : 'queued', version: 1,
      createdAt: at, updatedAt: at, auditHead: '', messages: [],
    };
    await appendEvent(tx, record, 'submitted', 'submit');
    await tx.put(key, record);
    return json({ ok: true, idempotent: false, job: publicJob(record) }, 201);
  });
}
async function doAppendMessage(storage, body) {
  return storage.transaction(async tx => {
    const key = keyFor(body.tenantId, body.operationId);
    const record = await tx.get(key);
    if (!record) return json({ code: 'NOT_FOUND' }, 404);
    const messages = record.messages || [];
    const prior = messages.find(item => item.messageId === body.messageId);
    if (prior) return prior.fingerprint === body.fingerprint
      ? json({ ok: true, idempotent: true, job: publicJob(record) })
      : json({ code: 'MESSAGE_IDEMPOTENCY_CONFLICT' }, 409);
    if (['completed', 'blocked', 'needs_reconciliation'].includes(record.status)) {
      return json({ code: 'THREAD_READ_ONLY' }, 409);
    }
    if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion !== record.version) {
      return json({ code: 'VERSION_CONFLICT' }, 409);
    }
    if (messages.length >= 200) return json({ code: 'THREAD_CAPACITY_REACHED' }, 409);
    const at = new Date().toISOString();
    messages.push({ messageId: body.messageId, sealed: body.sealed, fingerprint: body.fingerprint, at });
    record.messages = messages;
    record.version += 1;
    record.updatedAt = at;
    await appendEvent(tx, record, 'message_appended', body.sender === 'assistant' ? 'assistant' : 'submit', body.messageId);
    await tx.put(key, record);
    return json({ ok: true, idempotent: false, job: publicJob(record) }, 201);
  });
}
// Staging-only disaster-recovery restore: create-only, atomic and never overwrites
// an existing canonical job or replays an external side effect.
async function doRestore(storage, body) {
  return storage.transaction(async tx => {
    const jobKey = keyFor(body.tenantId, body.operationId);
    if (await tx.get(jobKey)) return json({ code: 'RESTORE_TARGET_EXISTS' }, 409);
    const prefix = logPrefix(body.tenantId, body.operationId);
    const existingAudit = await tx.list({ prefix });
    if (existingAudit.size) return json({ code: 'RESTORE_AUDIT_CONFLICT' }, 409);
    for (const event of body.audit) {
      await tx.put(prefix + String(event.seq).padStart(9, '0'), event);
    }
    await tx.put(jobKey, body.record);
    return json({ ok: true, restored: true, operationId: body.operationId, status: body.record.status }, 201);
  });
}
async function doTransition(storage, body, kind) {
  return storage.transaction(async tx => {
    const key = keyFor(body.tenantId, body.operationId);
    const record = await tx.get(key);
    if (!record) return json({ code: 'NOT_FOUND' }, 404);
    if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion !== record.version) {
      return json({ code: 'VERSION_CONFLICT' }, 409);
    }
    const highImpact = INSTITUTION_AI_HIGH_IMPACT.includes(record.taskType);
    let next = '';
    let eventType = '';
    let role = '';
    if (kind === 'approve') {
      if (!highImpact || record.status !== 'awaiting_approval' || !EVIDENCE_REF.test(String(body.evidenceRef || ''))) {
        return json({ code: 'APPROVAL_NOT_ALLOWED' }, 409);
      }
      next = 'approved'; eventType = 'human_approval_attested'; role = 'approve';
    } else {
      role = 'execute'; next = String(body.nextStatus || '');
      if (record.status === 'needs_reconciliation' || record.status === 'completed' || record.status === 'blocked') {
        return json({ code: 'RECONCILIATION_REQUIRED' }, 409);
      }
      if (highImpact) {
        // No external adapter has been approved: record checkpoints only; never claim execution completed.
        if (next === 'completed') return json({ code: 'EXTERNAL_PROOF_ADAPTER_REQUIRED' }, 409);
        if (!(record.status === 'approved' && next === 'processing') &&
            !(record.status === 'processing' && next === 'needs_reconciliation') &&
            !(record.status === 'approved' && next === 'needs_reconciliation')) {
          return json({ code: 'INVALID_TRANSITION' }, 409);
        }
      } else if (!(
        (record.status === 'queued' && ['processing', 'blocked'].includes(next)) ||
        (record.status === 'processing' && ['completed', 'blocked', 'needs_reconciliation'].includes(next))
      )) return json({ code: 'INVALID_TRANSITION' }, 409);
      if (next === 'completed' && !EVIDENCE_REF.test(String(body.evidenceRef || ''))) {
        return json({ code: 'EVIDENCE_REQUIRED' }, 409);
      }
      eventType = 'checkpoint_' + next;
    }
    record.status = next;
    record.version += 1;
    record.updatedAt = new Date().toISOString();
    await appendEvent(tx, record, eventType, role, EVIDENCE_REF.test(String(body.evidenceRef || '')) ? body.evidenceRef : '');
    await tx.put(key, record);
    return json({ ok: true, job: publicJob(record) });
  });
}
export async function institutionAiStore(request, storage) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith(DO_PREFIX)) return null;
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);
  let body;
  try { body = await request.json(); }
  catch { return json({ code: 'INVALID_JSON' }, 400); }
  if (!TENANT_ID.test(String(body.tenantId || '')) || !JOB_ID.test(String(body.operationId || ''))) {
    return json({ code: 'INVALID_ID' }, 400);
  }
  if (path === DO_PREFIX + 'get') return doGet(storage, body.tenantId, body.operationId);
  if (path === DO_PREFIX + 'submit') return doSubmit(storage, body);
  if (path === DO_PREFIX + 'approve') return doTransition(storage, body, 'approve');
  if (path === DO_PREFIX + 'message') return doAppendMessage(storage, body);
  if (path === DO_PREFIX + 'restore') return doRestore(storage, body);
  if (path === DO_PREFIX + 'checkpoint') return doTransition(storage, body, 'checkpoint');
  return json({ code: 'NOT_FOUND' }, 404);
}
async function fetchStore(env, action, body) {
  if (!env.REVENUE_STORE) throw new Error('INSTITUTION_AI_STORE_UNAVAILABLE');
  const stub = env.REVENUE_STORE.get(env.REVENUE_STORE.idFromName('institution-ai:' + body.tenantId));
  const response = await stub.fetch('https://revenue-store.internal' + DO_PREFIX + action, {
    method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ code: 'INSTITUTION_AI_STORE_ERROR' }));
  return { status: response.status, payload };
}
function validateIdentity(body) {
  if (!TENANT_ID.test(String(body?.tenantId || '')) || !JOB_ID.test(String(body?.operationId || ''))) {
    throw new Error('INVALID_ID');
  }
}
export async function institutionAiApi(request, url, env) {
  const path = url.pathname.replace(/^\/ekodibiz(?=\/)/, '');
  if (!path.startsWith(API_PREFIX)) return null;
  const action = path.slice(API_PREFIX.length);
  if (action === 'health' && request.method === 'GET') {
    return json({ ok: true, service: 'institution-ai', stage: 'locked-by-default', apiVersion: 1,
      externalExecutionEnabled: false, browserKeysAllowed: false, livePaymentsEnabled: false });
  }
  if (request.method !== 'POST' || !['submit', 'message', 'status', 'approve', 'checkpoint', 'export', 'backup', 'restore-check', 'restore', 'provider-plan'].includes(action)) {
    return json({ code: 'NOT_FOUND' }, 404);
  }
  // This API must never become a live tenant-data service merely because keys
  // were provisioned. Require isolated staging AND a separate explicit pilot gate.
  // Production enablement requires a future protected release with identity,
  // offsite backup/restore and immutable-audit evidence.
  if (String(env?.EKODIBIZ_MODE || '') !== 'isolated-staging'
      || String(env?.INSTITUTION_AI_STAGING_PILOT_ENABLED || '').trim().toLowerCase() !== 'true') {
    return json({ code: 'INSTITUTION_AI_PILOT_DISABLED' }, 503);
  }
  // Internal-only pilot, never expose API keys through web/mobile JavaScript.
  if (request.headers.has('origin') || url.protocol !== 'https:') return json({ code: 'SERVER_TO_SERVER_ONLY' }, 403);
  try {
    activeInstitutionKeyVersion(env); // fail closed before authentication and storage access
    const body = await readInstitutionJson(request);
    validateIdentity(body);
    const role = { submit: 'submit', message: body.sender === 'assistant' ? 'assistant' : 'submit', status: 'read', approve: 'approve', checkpoint: 'execute', export: 'read', backup: 'backup', 'restore-check': 'restore', restore: 'restore', 'provider-plan': 'route' }[action];
    if (!authorizeInstitutionServer(request, env, body.tenantId, role)) return json({ code: 'FORBIDDEN' }, 403);
    if (action === 'submit') {
      validateInstitutionJob(body);
      const sealed = await encryptInstitutionPayload(env, body.tenantId, body.operationId, body.payload);
      const fingerprint = await fingerprintInstitutionRequest(env, body.tenantId, body.operationId,
        body.taskType, body.classification, body.payload);
      const result = await fetchStore(env, 'submit', { tenantId: body.tenantId, operationId: body.operationId,
        taskType: body.taskType, classification: body.classification, sealed, fingerprint });
      return json(result.payload, result.status);
    }
    if (action === 'message') {
      const messageId = String(body.messageId || '');
      if (!JOB_ID.test(messageId) || !['user', 'assistant'].includes(body.sender) ||
          typeof body.text !== 'string' || !body.text.trim() || body.text.length > 4000) {
        return json({ code: 'INVALID_MESSAGE' }, 400);
      }
      const message = { sender: body.sender, text: body.text };
      const sealed = await encryptInstitutionPayload(env, body.tenantId, body.operationId + ':message:' + messageId, message);
      const fingerprint = await fingerprintInstitutionRequest(env, body.tenantId, body.operationId,
        'message:' + messageId, body.sender, message);
      const result = await fetchStore(env, 'message', { tenantId: body.tenantId,
        operationId: body.operationId, messageId, sender: body.sender, sealed, fingerprint, expectedVersion: body.expectedVersion });
      return json(result.payload, result.status);
    }
    if (action === 'restore-check' || action === 'restore') {
      const restored = await openInstitutionBackup(env, body.tenantId, body.operationId, body.archive);
      const { record, audit } = restored;
      if (!await verifyAuditTrail(record, audit)) return json({ code: 'AUDIT_INTEGRITY_FAILURE' }, 503);
      // Verify both the independent archive key and the live work-data keyring
      // before asserting that a restored transcript would be readable.
      await decryptInstitutionPayload(env, body.tenantId, body.operationId, record.sealed);
      for (const message of record.messages || []) {
        const value = await decryptInstitutionPayload(env, body.tenantId,
          body.operationId + ':message:' + message.messageId, message.sealed);
        if (!['user', 'assistant'].includes(value?.sender) || typeof value?.text !== 'string') {
          return json({ code: 'BACKUP_INVALID_MESSAGE' }, 503);
        }
      }
      const existing = await fetchStore(env, 'get', { tenantId: body.tenantId, operationId: body.operationId });
      if (existing.status === 200) return json({ code: 'RESTORE_TARGET_EXISTS' }, 409);
      if (existing.status !== 404) return json({ code: 'RESTORE_CHECK_UNAVAILABLE' }, 503);
      if (action === 'restore-check') {
        return json({ ok: true, restoreEligible: true, dataVerified: true,
          tenantId: body.tenantId, operationId: body.operationId, version: record.version,
          messageCount: (record.messages || []).length, sideEffectsExecuted: false });
      }
      if (String(env.INSTITUTION_AI_RESTORE_ENABLED || '').trim().toLowerCase() !== 'true') {
        return json({ code: 'RESTORE_DISABLED' }, 503);
      }
      const write = await fetchStore(env, 'restore', { tenantId: body.tenantId,
        operationId: body.operationId, record, audit });
      return json(write.payload, write.status);
    }
    const storageAction = action === 'status' || action === 'export' || action === 'backup' || action === 'provider-plan' ? 'get' : action;
    const result = await fetchStore(env, storageAction, body);
    if (result.status !== 200) return json(result.payload, result.status);
    if (storageAction !== 'get') return json(result.payload);
    const { record, audit } = result.payload;
    if (!await verifyAuditTrail(record, audit)) return json({ code: 'AUDIT_INTEGRITY_FAILURE' }, 503);
    if (record.tenantId !== body.tenantId || record.operationId !== body.operationId) return json({ code: 'SCOPE_MISMATCH' }, 403);
    if (action === 'provider-plan') {
      // Only the stored, audit-verified classification and task type can govern
      // provider eligibility. No model call or plaintext exfiltration occurs.
      const capability = typeof body.capability === 'string' ? body.capability : 'text';
      const registry = getEkodiAiProviderRegistryStatus(env);
      const decision = planInstitutionProviderFallback(env, body.tenantId, record, registry, capability);
      return json({ ok: true, ...decision });
    }
    if (action === 'backup') {
      // Archive contains no work-data plaintext. It is encrypted under an
      // independent tenant-scoped backup key that is not exported.
      const archive = await sealInstitutionBackup(env, body.tenantId, body.operationId, record, audit);
      return json({ ok: true, archive });
    }
    const payload = await decryptInstitutionPayload(env, body.tenantId, body.operationId, record.sealed);
    const messages = await Promise.all((record.messages || []).map(async item => {
      const restored = await decryptInstitutionPayload(env, body.tenantId,
        body.operationId + ':message:' + item.messageId, item.sealed);
      if (!['user', 'assistant'].includes(restored?.sender) || typeof restored?.text !== 'string') {
        throw new Error('INSTITUTION_AI_INVALID_MESSAGE_RECORD');
      }
      return { messageId: item.messageId, sender: restored.sender, text: restored.text, at: item.at };
    }));
    const job = publicJob(record);
    return json(action === 'export'
      ? { exportVersion: 1, format: 'ekodi.institution-ai.work/v1', job, payload, messages, audit }
      : { ok: true, job, payload, messages, audit });
  } catch (error) {
    const code = String(error?.message || '');
    if (code === 'BODY_TOO_LARGE' || code === 'BACKUP_TOO_LARGE') return json({ code }, 413);
    if (/^(INVALID_|CONTENT_TYPE_REQUIRED|BODY_REQUIRED)/.test(code)) return json({ code }, 400);
    // Malformed credentials, unavailable keys, storage and corrupted records reveal no internal details.
    return json({ code: 'INSTITUTION_AI_UNAVAILABLE' }, 503);
  }
}
