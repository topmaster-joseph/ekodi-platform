import { handleStorageGateway } from './storage-gateway.js';

const PREFIX = '/api/ai-modules/v1';
const MODULE_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;

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

function secureEqual(a, b) {
  const aa = new TextEncoder().encode(String(a || ''));
  const bb = new TextEncoder().encode(String(b || ''));
  if (aa.length !== bb.length || aa.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i += 1) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

function gatewayAuthorized(request, env) {
  return secureEqual(request.headers.get('x-ekodi-ai-gateway-key'), env.EKODI_AI_MODULE_GATEWAY_KEY);
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
  }));
}

async function invokeModule(module, body, env) {
  if (module.enabled === false) throw new Error('AI_MODULE_DISABLED');
  if (!module.capabilities.includes(body.capability)) throw new Error('AI_MODULE_CAPABILITY_NOT_SUPPORTED');
  if (!body.context.capabilities.includes(body.capability) && !body.context.capabilities.includes('ai:*')) {
    throw new Error('AI_MODULE_CAPABILITY_FORBIDDEN');
  }
  const secret = String(env[module.secretBinding] || '').trim();
  if (!secret) throw new Error('AI_MODULE_SECRET_MISSING');

  const requestId = crypto.randomUUID();
  const timeoutMs = Math.max(1000, Math.min(30000, Number(module.timeoutMs || 12000)));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    const endpoint = new URL('/v1/execute', module.endpoint).toString();
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${secret}`,
        'x-ekodi-contract-version': '1.0.0',
        'x-ekodi-request-id': requestId,
      },
      body: JSON.stringify({
        contractVersion: '1.0.0',
        requestId,
        moduleId: module.id,
        capability: body.capability,
        context: {
          spaceId: body.context.spaceId,
          serviceId: body.context.serviceId,
          actorId: body.context.actorId,
          role: body.context.role,
          capabilities: body.context.capabilities,
        },
        input: body.input,
      }),
    });
    const raw = await response.text();
    let payload;
    try { payload = JSON.parse(raw); }
    catch { throw new Error('AI_MODULE_INVALID_RESPONSE'); }
    if (!response.ok) throw new Error(`AI_MODULE_HTTP_${response.status}`);
    if (payload.contractVersion !== '1.0.0' || payload.requestId !== requestId || typeof payload.ok !== 'boolean') {
      throw new Error('AI_MODULE_RESPONSE_CONTRACT_VIOLATION');
    }
    if (!payload.ok) throw new Error(`AI_MODULE_PROVIDER_ERROR:${String(payload.error?.code || 'unknown')}`);
    return { requestId, output: payload.output, usage: payload.usage || null, providerMeta: payload.meta || null };
  } finally {
    clearTimeout(timer);
  }
}

async function persistResult(request, env, body, moduleId, execution) {
  if (!body.persist) return null;
  const persist = body.persist;
  const storageRequest = new Request(new URL('/api/storage/v1/records', request.url), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ekodi-storage-key': String(env.EKODI_STORAGE_GATEWAY_KEY || ''),
      'x-request-id': execution.requestId,
    },
    body: JSON.stringify({
      spaceId: body.context.spaceId,
      serviceId: body.context.serviceId,
      recordType: persist.recordType || `ai.${body.capability}`,
      createdBy: body.context.actorId,
      retentionClass: persist.retentionClass || 'business_record',
      title: persist.title || `${moduleId}-${body.capability}-${new Date().toISOString()}.json`,
      mimeType: persist.mimeType || 'application/json',
      parentFolderId: persist.parentFolderId,
      root: persist.root,
      sourceModuleId: moduleId,
      contentText: typeof execution.output === 'string' ? execution.output : JSON.stringify(execution.output, null, 2),
    }),
  });
  const stored = await handleStorageGateway(storageRequest, env);
  if (!stored?.ok) {
    const payload = stored ? await stored.json().catch(() => ({})) : {};
    throw new Error(`AI_MODULE_PERSIST_FAILED:${payload.code || 'unknown'}`);
  }
  return stored.json();
}

async function audit(env, body, moduleId, execution, status) {
  if (!env.DB) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ai_module_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL,
    module_id TEXT NOT NULL,
    capability TEXT NOT NULL,
    space_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`).run();
  await env.DB.prepare(`INSERT INTO ai_module_audit_logs
    (request_id, module_id, capability, space_id, service_id, actor_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      execution?.requestId || crypto.randomUUID(), moduleId || String(body?.moduleId || ''),
      String(body?.capability || ''), String(body?.context?.spaceId || ''), String(body?.context?.serviceId || ''),
      String(body?.context?.actorId || ''), status, new Date().toISOString(),
    ).run();
}

function statusFor(message) {
  if (message.includes('FORBIDDEN')) return 403;
  if (message.includes('NOT_SUPPORTED') || message.includes('DISABLED')) return 409;
  if (message.includes('MISSING') || message.includes('REQUIRED') || message.includes('INVALID')) return 400;
  if (message.includes('HTTP_') || message.includes('PROVIDER_ERROR') || message.includes('CONTRACT_VIOLATION')) return 502;
  if (message.includes('PERSIST_FAILED')) return 502;
  return 500;
}

export async function handleExternalAiModuleGateway(request, env = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return null;
  const modules = registry(env);

  if (request.method === 'GET' && url.pathname === `${PREFIX}/health`) {
    return json({ ok: true, contractVersion: '1.0.0', registeredModules: publicRegistry(modules) });
  }

  if (!gatewayAuthorized(request, env)) {
    return json({ error: 'AI Module Gateway 인증이 필요합니다.', code: 'AI_MODULE_UNAUTHORIZED' }, 401);
  }

  if (request.method === 'GET' && url.pathname === `${PREFIX}/modules`) {
    return json({ contractVersion: '1.0.0', modules: publicRegistry(modules) });
  }

  if (request.method === 'POST' && url.pathname === `${PREFIX}/execute`) {
    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'JSON 요청이 필요합니다.', code: 'AI_MODULE_INVALID_JSON' }, 400); }
    let execution;
    try {
      validateExecution(body);
      const module = modules.find(item => item.id === body.moduleId);
      if (!module) throw new Error('AI_MODULE_NOT_REGISTERED');
      execution = await invokeModule(module, body, env);
      const stored = await persistResult(request, env, body, module.id, execution);
      await audit(env, body, module.id, execution, 'success');
      return json({
        ok: true,
        contractVersion: '1.0.0',
        requestId: execution.requestId,
        moduleId: module.id,
        capability: body.capability,
        output: execution.output,
        usage: execution.usage,
        storage: stored,
      });
    } catch (error) {
      console.error('External AI Module Gateway error', error);
      await audit(env, body || {}, body?.moduleId || '', execution, 'failed').catch(() => {});
      const message = String(error?.message || 'AI_MODULE_ERROR');
      return json({ error: '외부 AI 모듈 처리에 실패했습니다.', code: message.split(':')[0] }, statusFor(message));
    }
  }

  return json({ error: 'AI Module Gateway endpoint not found', code: 'AI_MODULE_NOT_FOUND' }, 404);
}

export const EXTERNAL_AI_MODULE_GATEWAY_CONTRACT = Object.freeze({
  version: '1.0.0',
  prefix: PREFIX,
  providerDirectDriveAccess: false,
  providerDirectDatabaseAccess: false,
  durableOutputStore: 'google_workspace_shared_drive',
});
