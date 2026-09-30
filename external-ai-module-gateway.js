import { storeEkodiDurableRecord } from './storage-gateway.js';
import { projectForExternalAi, projectionStamp } from './secure-projection.js';
import { handleAiProviderControl } from './ai-provider-control.js';

const PREFIX = '/api/ai-modules/v1';
const CONTRACT_VERSION = '1.0.0';
const GUARDRAIL_POLICY_VERSION = '2026-09-08';
const CAPABILITY_GRANT_TTL_MS = 60_000;
const MODULE_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const CALLER_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const encoder = new TextEncoder();
const circuits = new Map();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function secureEqual(a, b) {
  const aa = encoder.encode(String(a || ''));
  const bb = encoder.encode(String(b || ''));
  if (aa.length !== bb.length || aa.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i += 1) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

function gatewayAuthorized(request, env) {
  return secureEqual(request.headers.get('x-ekodi-ai-gateway-key'), env.EKODI_AI_MODULE_GATEWAY_KEY);
}

function registeredCallers(env) {
  return new Set(String(env.EKODI_AI_MODULE_CALLERS || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(value => CALLER_ID.test(value)));
}

function callerId(request, env) {
  const id = String(request.headers.get('x-ekodi-caller-id') || '').trim().toLowerCase();
  return CALLER_ID.test(id) && registeredCallers(env).has(id) ? id : '';
}

function registry(env) {
  let parsed = [];
  try { parsed = JSON.parse(String(env.EKODI_AI_MODULE_REGISTRY_JSON || '[]')); }
  catch { return []; }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(item => {
    if (!item || typeof item !== 'object') return false;
    if (!MODULE_ID.test(String(item.id || ''))) return false;
    if (!/^https:\/\//.test(String(item.endpoint || ''))) return false;
    if (!Array.isArray(item.capabilities) || item.capabilities.length === 0) return false;
    if (!String(item.secretBinding || '').trim()) return false;
    return true;
  });
}

function validateExecution(body) {
  if (!body || typeof body !== 'object') throw new Error('AI_MODULE_INVALID_BODY');
  if (!MODULE_ID.test(String(body.moduleId || ''))) throw new Error('AI_MODULE_INVALID_ID');
  if (!String(body.capability || '').trim()) throw new Error('AI_MODULE_CAPABILITY_REQUIRED');
  if (!body.context || typeof body.context !== 'object') throw new Error('AI_MODULE_CONTEXT_REQUIRED');
  for (const key of ['spaceId', 'serviceId', 'actorId', 'role']) {
    if (!String(body.context[key] || '').trim()) throw new Error(`AI_MODULE_CONTEXT_${key.toUpperCase()}_REQUIRED`);
  }
  if (!Array.isArray(body.context.capabilities)) throw new Error('AI_MODULE_CONTEXT_CAPABILITIES_REQUIRED');
  if (!Object.prototype.hasOwnProperty.call(body, 'input')) throw new Error('AI_MODULE_INPUT_REQUIRED');
}

function publicRegistry(items) {
  return items.map(item => ({
    id: item.id,
    name: item.name || item.id,
    version: item.version || 'unknown',
    capabilities: item.capabilities,
    enabled: item.enabled !== false,
    retrySafe: item.retrySafe === true,
  }));
}

function circuitPolicy(module) {
  return {
    threshold: clamp(module.circuitBreakerThreshold, 2, 20, 3),
    cooldownMs: clamp(module.circuitBreakerCooldownMs, 1000, 120000, 30_000),
  };
}

function circuitOpen(module) {
  const state = circuits.get(module.id);
  if (!state?.openedUntil) return false;
  if (state.openedUntil <= Date.now()) {
    circuits.delete(module.id);
    return false;
  }
  return true;
}

function recordCircuitFailure(module) {
  const policy = circuitPolicy(module);
  const state = circuits.get(module.id) || { failures: 0, openedUntil: 0 };
  state.failures += 1;
  if (state.failures >= policy.threshold) state.openedUntil = Date.now() + policy.cooldownMs;
  circuits.set(module.id, state);
}

function recordCircuitSuccess(module) {
  circuits.delete(module.id);
}

function transientFailure(error) {
  const message = String(error?.message || error || '');
  return message.includes('AI_MODULE_TIMEOUT')
    || /AI_MODULE_HTTP_(429|502|503|504)\b/.test(message);
}

function circuitFailure(error) {
  const message = String(error?.message || error || '');
  return message.includes('AI_MODULE_TIMEOUT') || /AI_MODULE_HTTP_(429|5\d\d)\b/.test(message)
    || message.includes('AI_MODULE_INVALID_RESPONSE') || message.includes('AI_MODULE_RESPONSE_CONTRACT_VIOLATION')
    || message.includes('AI_MODULE_PROVIDER_ERROR') || message.includes('AI_MODULE_RESPONSE_TOO_LARGE');
}

async function readLimitedText(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new Error('AI_MODULE_RESPONSE_TOO_LARGE');
  if (!response.body?.getReader) {
    const text = await response.text();
    if (encoder.encode(text).byteLength > maxBytes) throw new Error('AI_MODULE_RESPONSE_TOO_LARGE');
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0; let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value?.byteLength || 0;
    if (total > maxBytes) { await reader.cancel('response-too-large').catch(() => {}); throw new Error('AI_MODULE_RESPONSE_TOO_LARGE'); }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function sleep(ms) {
  return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();
}

function makeCapabilityGrant({ requestId, module, capability, caller, attempt }) {
  const issued = Date.now();
  return {
    grantId: `${requestId}:${attempt}`,
    audience: module.id,
    capability,
    issuedAt: new Date(issued).toISOString(),
    expiresAt: new Date(issued + CAPABILITY_GRANT_TTL_MS).toISOString(),
    singleUseIntent: true,
    ekodiApiToken: false,
    attestedBy: `ekodi:${caller}`,
  };
}

async function executeProviderAttempt(module, body, env, caller, state) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), state.timeoutMs);
  try {
    const endpoint = new URL('/v1/execute', module.endpoint).toString();
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${state.secret}`,
        'x-ekodi-contract-version': CONTRACT_VERSION,
        'x-ekodi-request-id': state.requestId,
        'x-ekodi-idempotency-key': state.requestId,
      },
      body: JSON.stringify({
        contractVersion: CONTRACT_VERSION,
        requestId: state.requestId,
        moduleId: module.id,
        capability: body.capability,
        context: {
          spaceId: state.projected.context.spaceId,
          serviceId: body.context.serviceId,
          actorId: state.projected.context.actorId,
          role: state.projected.context.role,
          capabilities: [body.capability],
          attestedBy: `ekodi:${caller}`,
          projection: projectionStamp(state.projectionProfile, state.projectionPurpose),
        },
        capabilityGrant: makeCapabilityGrant({
          requestId: state.requestId,
          module,
          capability: body.capability,
          caller,
          attempt: state.attempt,
        }),
        dataPolicy: {
          retention: 'transient',
          trainingAllowed: false,
          secondaryUseAllowed: false,
          canonicalStorageOwnedByEkodi: true,
        },
        input: state.projected.input,
      }),
    });
    const raw = await readLimitedText(response, state.responseMaxBytes);
    if (!response.ok) throw new Error(`AI_MODULE_HTTP_${response.status}`);
    let payload;
    try { payload = JSON.parse(raw); }
    catch { throw new Error('AI_MODULE_INVALID_RESPONSE'); }
    if (payload.contractVersion !== CONTRACT_VERSION || payload.requestId !== state.requestId || typeof payload.ok !== 'boolean') {
      throw new Error('AI_MODULE_RESPONSE_CONTRACT_VIOLATION');
    }
    if (!payload.ok) throw new Error(`AI_MODULE_PROVIDER_ERROR:${String(payload.error?.code || 'unknown')}`);
    return payload;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('AI_MODULE_TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function invokeModule(module, body, env, caller) {
  if (module.enabled === false) throw new Error('AI_MODULE_DISABLED');
  if (!module.capabilities.includes(body.capability)) throw new Error('AI_MODULE_CAPABILITY_NOT_SUPPORTED');
  if (!body.context.capabilities.includes(body.capability) && !body.context.capabilities.includes('ai:*')) {
    throw new Error('AI_MODULE_CAPABILITY_FORBIDDEN');
  }
  if (circuitOpen(module)) throw new Error('AI_MODULE_CIRCUIT_OPEN');

  const secret = String(env[module.secretBinding] || '').trim();
  if (!secret) throw new Error('AI_MODULE_SECRET_MISSING');

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const projectionProfile = String(body.capability || '').startsWith('marketing') ? 'ai_marketing' : 'ai_minimum';
  const projectionPurpose = `external-ai-module:${body.capability}`;
  const projected = await projectForExternalAi({
    context: { spaceId: body.context.spaceId, actorId: body.context.actorId, role: body.context.role },
    input: body.input,
  }, { profile: projectionProfile, purpose: projectionPurpose, salt: requestId });

  const timeoutMs = clamp(module.timeoutMs, 1000, 30000, 12000);
  const responseMaxBytes = clamp(module.responseMaxBytes, 1024, 2097152, 1048576);
  const maxAttempts = module.retrySafe === true ? clamp(module.retryMaxAttempts, 1, 2, 2) : 1;
  const retryBackoffMs = clamp(module.retryBackoffMs, 0, 2000, 250);
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const payload = await executeProviderAttempt(module, body, env, caller, {
        requestId, timeoutMs, responseMaxBytes, secret, projected,
        projectionProfile, projectionPurpose, attempt,
      });
      recordCircuitSuccess(module);
      return {
        requestId,
        output: payload.output,
        usage: payload.usage || null,
        providerMeta: payload.meta || null,
        latencyMs: Date.now() - startedAt,
        attempts: attempt,
        idempotencyKey: requestId,
      };
    } catch (error) {
      lastError = error;
      const canRetry = attempt < maxAttempts && transientFailure(error);
      if (canRetry) {
        await sleep(retryBackoffMs * attempt);
        continue;
      }
      if (circuitFailure(error)) recordCircuitFailure(module);
      throw error;
    }
  }
  throw lastError || new Error('AI_MODULE_PROVIDER_ERROR');
}

async function persistResult(env, body, moduleId, execution) {
  if (!body.persist) return null;
  const persist = body.persist;
  return storeEkodiDurableRecord(env, {
    spaceId: body.context.spaceId,
    serviceId: body.context.serviceId,
    storageRoute: persist.storageRoute,
    recordType: persist.recordType || `ai.${body.capability}`,
    createdBy: body.context.actorId,
    retentionClass: persist.retentionClass || 'business_record',
    title: persist.title || `${moduleId}-${body.capability}-${new Date().toISOString()}.json`,
    mimeType: persist.mimeType || 'application/json',
    sourceModuleId: moduleId,
    contentText: typeof execution.output === 'string' ? execution.output : JSON.stringify(execution.output, null, 2),
  }, { requestId: execution.requestId });
}

async function audit(env, body, moduleId, execution, status, caller, detail = {}) {
  if (!env.DB) return;
  await env.DB.prepare(`INSERT INTO ai_module_audit_logs
    (request_id, module_id, capability, space_id, service_id, actor_id, caller_id,
     provider_model, latency_ms, storage_status, guardrail_policy_version, error_code, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      execution?.requestId || crypto.randomUUID(),
      moduleId || String(body?.moduleId || ''),
      String(body?.capability || ''),
      String(body?.context?.spaceId || ''),
      String(body?.context?.serviceId || ''),
      String(body?.context?.actorId || ''),
      String(caller || ''),
      String(execution?.providerMeta?.model || ''),
      Number(execution?.latencyMs || 0),
      String(detail.storageStatus || 'not_requested'),
      GUARDRAIL_POLICY_VERSION,
      String(detail.errorCode || ''),
      status,
      new Date().toISOString(),
    ).run();
}

function statusFor(message) {
  if (message.includes('FORBIDDEN')) return 403;
  if (message.includes('NOT_REGISTERED')) return 404;
  if (message.includes('NOT_SUPPORTED') || message.includes('DISABLED')) return 409;
  if (message.includes('CIRCUIT_OPEN')) return 503;
  if (message.includes('TIMEOUT')) return 504;
  if (message.includes('MISSING') || message.includes('REQUIRED') || message.includes('INVALID')) return 400;
  if (message.includes('HTTP_') || message.includes('PROVIDER_ERROR') || message.includes('CONTRACT_VIOLATION') || message.includes('RESPONSE_TOO_LARGE')) return 502;
  if (message.includes('CANONICAL_STORAGE')) return 502;
  return 500;
}

export async function handleExternalAiModuleGateway(request, env = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return null;

  if (url.pathname.startsWith(`${PREFIX}/providers`)) {
    try {
      const providerResponse = await handleAiProviderControl(request, env);
      if (providerResponse) return providerResponse;
    } catch (error) {
      console.error('AI Provider Control error', error);
      return json({ error: 'AI Provider 처리에 실패했습니다.', code: 'AI_PROVIDER_CONTROL_ERROR' }, 500);
    }
  }

  const modules = registry(env);

  if (request.method === 'GET' && url.pathname === `${PREFIX}/health`) {
    return json({
      ok: true,
      contractVersion: CONTRACT_VERSION,
      guardrailPolicyVersion: GUARDRAIL_POLICY_VERSION,
      registeredModuleCount: modules.length,
      registeredCallerCount: registeredCallers(env).size,
      directProviderStorageAccess: false,
      providerTrainingAllowed: false,
    });
  }

  if (!gatewayAuthorized(request, env)) {
    return json({ error: 'AI Module Gateway 인증이 필요합니다.', code: 'AI_MODULE_UNAUTHORIZED' }, 401);
  }

  if (request.method === 'GET' && url.pathname === `${PREFIX}/modules`) {
    return json({ contractVersion: CONTRACT_VERSION, guardrailPolicyVersion: GUARDRAIL_POLICY_VERSION, modules: publicRegistry(modules) });
  }

  if (request.method === 'POST' && url.pathname === `${PREFIX}/execute`) {
    const caller = callerId(request, env);
    if (!caller) return json({ error: '등록된 EKODI 내부 호출자가 아닙니다.', code: 'AI_MODULE_CALLER_FORBIDDEN' }, 403);
    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'JSON 요청이 필요합니다.', code: 'AI_MODULE_INVALID_JSON' }, 400); }

    let execution;
    let storageStatus = body?.persist ? 'pending' : 'not_requested';
    try {
      validateExecution(body);
      const module = modules.find(item => item.id === body.moduleId);
      if (!module) throw new Error('AI_MODULE_NOT_REGISTERED');
      execution = await invokeModule(module, body, env, caller);
      const stored = await persistResult(env, body, module.id, execution);
      storageStatus = body.persist ? (stored ? 'stored' : 'completed') : 'not_requested';
      await audit(env, body, module.id, execution, 'success', caller, { storageStatus });
      return json({
        ok: true,
        contractVersion: CONTRACT_VERSION,
        guardrailPolicyVersion: GUARDRAIL_POLICY_VERSION,
        requestId: execution.requestId,
        moduleId: module.id,
        capability: body.capability,
        output: execution.output,
        usage: execution.usage,
        storage: stored,
        execution: {
          attempts: execution.attempts,
          latencyMs: execution.latencyMs,
          idempotencyKey: execution.idempotencyKey,
        },
      });
    } catch (error) {
      console.error('External AI Module Gateway error', error);
      const message = String(error?.message || 'AI_MODULE_ERROR');
      if (body?.persist && storageStatus === 'pending') storageStatus = 'failed';
      await audit(env, body || {}, body?.moduleId || '', execution, 'failed', caller, {
        storageStatus,
        errorCode: message.split(':')[0],
      }).catch(() => {});
      return json({ error: '외부 AI 모듈 처리에 실패했습니다.', code: message.split(':')[0] }, statusFor(message));
    }
  }

  return json({ error: 'AI Module Gateway endpoint not found', code: 'AI_MODULE_NOT_FOUND' }, 404);
}

export function resetExternalAiModuleCircuitsForTest() {
  circuits.clear();
}

export const EXTERNAL_AI_MODULE_GATEWAY_CONTRACT = Object.freeze({
  version: CONTRACT_VERSION,
  guardrailPolicyVersion: GUARDRAIL_POLICY_VERSION,
  prefix: PREFIX,
  executionTrust: 'registered_ekodi_internal_caller',
  providerDirectDriveAccess: false,
  providerDirectDatabaseAccess: false,
  providerTrainingAllowed: false,
  capabilityGrantTtlSeconds: CAPABILITY_GRANT_TTL_MS / 1000,
  durableOutputStore: 'ekodi_managed_canonical_store',
});
