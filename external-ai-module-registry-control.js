import { handleAdminSessionFastPath } from './admin-session-fastpath.js';

const PREFIX = '/api/ai-modules/v1';
const ADMIN_BASE = `${PREFIX}/admin/registry`;
const CONTRACT_VERSION = '1.0.0';
const MODULE_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const CAPABILITY = /^[a-z0-9][a-z0-9._:-]{1,79}$/;
const STATUSES = new Set(['draft', 'validating', 'staging', 'production', 'blocked']);
const encoder = new TextEncoder();

function clean(value, max = 1200) { return String(value ?? '').trim().slice(0, max); }
function split(value) { return clean(value, 12000).split(',').map(v => v.trim()).filter(Boolean); }
function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.trunc(number))) : fallback;
}
function allowedOrigin(request, env = {}) {
  const origin = clean(request.headers.get('origin'), 240);
  return origin && new Set(split(env.ALLOWED_ORIGINS)).has(origin) ? origin : '';
}
function corsHeaders(request, env = {}) {
  const headers = new Headers({
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-ekodi-confirm-impact',
    'access-control-max-age': '86400', vary: 'Origin',
  });
  const origin = allowedOrigin(request, env); if (origin) headers.set('access-control-allow-origin', origin);
  return headers;
}function json(request, env, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...Object.fromEntries(corsHeaders(request, env)), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}
function managerAdmins(env = {}) {
  return new Set([clean(env.ADMIN_EMAIL, 240), ...split(env.ADMIN_GOOGLE_BOOTSTRAP_EMAILS)].map(v => v.toLowerCase()).filter(Boolean));
}
async function adminSession(request, env) {
  const url = new URL(request.url); url.pathname = '/api/session'; url.search = '';
  const response = await handleAdminSessionFastPath(new Request(url.toString(), { method: 'GET', headers: request.headers }), env);
  if (!response?.ok) return null;
  const session = await response.clone().json().catch(() => null);
  if (!session?.authenticated || !managerAdmins(env).has(clean(session.email, 240).toLowerCase())) return null;
  return session;
}
function secretBindingFor(id) {
  const stem = id.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);
  return `EKODI_EXT_AI_${stem}_SECRET`;
}
function privateIpv4(host) {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some(v => !Number.isInteger(v) || v < 0 || v > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}
export function isSafeExternalAiEndpoint(value) {
  try {
    const url = new URL(clean(value, 1000));
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return host !== 'localhost' && !host.endsWith('.local') && !privateIpv4(host) && host !== '::1' && !host.startsWith('fc') && !host.startsWith('fd') && !host.startsWith('fe8');
  } catch { return false; }
}function normalizeCapabilities(value) {
  const list = Array.isArray(value) ? value : split(value);
  return [...new Set(list.map(v => clean(v, 80).toLowerCase()).filter(v => CAPABILITY.test(v)))].slice(0, 16);
}
export function normalizeExternalAiModuleInput(body = {}) {
  const id = clean(body.id, 64).toLowerCase();
  const name = clean(body.name, 120);
  const vendor = clean(body.vendor, 120);
  const endpoint = clean(body.endpoint, 1000).replace(/\/$/, '');
  const capabilities = normalizeCapabilities(body.capabilities);
  if (!MODULE_ID.test(id)) throw new Error('AI_MODULE_REGISTRY_INVALID_ID');
  if (name.length < 2) throw new Error('AI_MODULE_REGISTRY_NAME_REQUIRED');
  if (vendor.length < 2) throw new Error('AI_MODULE_REGISTRY_VENDOR_REQUIRED');
  if (!isSafeExternalAiEndpoint(endpoint)) throw new Error('AI_MODULE_REGISTRY_UNSAFE_ENDPOINT');
  if (!capabilities.length) throw new Error('AI_MODULE_REGISTRY_CAPABILITY_REQUIRED');
  return {
    id, name, vendor, endpoint, capabilities,
    version: clean(body.version, 40) || CONTRACT_VERSION,
    secretBinding: secretBindingFor(id),
    timeoutMs: clamp(body.timeoutMs, 1000, 30000, 12000),
    retrySafe: body.retrySafe === true,
    retryMaxAttempts: body.retrySafe === true ? clamp(body.retryMaxAttempts, 1, 2, 2) : 1,
    retryBackoffMs: clamp(body.retryBackoffMs, 0, 2000, 250),
    responseMaxBytes: clamp(body.responseMaxBytes, 1024, 2097152, 1048576),
    circuitBreakerThreshold: clamp(body.circuitBreakerThreshold, 2, 20, 3),
    circuitBreakerCooldownMs: clamp(body.circuitBreakerCooldownMs, 1000, 120000, 30000),
  };
}
function rowToModule(row) {
  return {
    id: row.module_id, name: row.display_name, vendor: row.vendor_name, version: row.module_version,
    endpoint: row.endpoint, capabilities: JSON.parse(row.capabilities_json || '[]'), secretBinding: row.secret_binding || '',
    timeoutMs: Number(row.timeout_ms || 12000), retrySafe: Number(row.retry_safe || 0) === 1,
    retryMaxAttempts: Number(row.retry_max_attempts || 1), retryBackoffMs: Number(row.retry_backoff_ms || 250),
    responseMaxBytes: Number(row.response_max_bytes || 1048576), circuitBreakerThreshold: Number(row.circuit_breaker_threshold || 3),
    circuitBreakerCooldownMs: Number(row.circuit_breaker_cooldown_ms || 30000), status: row.status || 'draft',
    health: row.health_status || 'unknown', lastCheckedAt: row.last_checked_at || '', lastError: row.last_error || '',
    reference: Number(row.reference_module || 0) === 1, source: 'managed',
  };
}function legacyRegistry(env = {}) {
  let parsed = [];
  try { parsed = JSON.parse(clean(env.EKODI_AI_MODULE_REGISTRY_JSON, 120000) || '[]'); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(item => item && MODULE_ID.test(clean(item.id, 64)) && isSafeExternalAiEndpoint(item.endpoint)
    && Array.isArray(item.capabilities) && item.capabilities.length && clean(item.secretBinding, 120)).map(item => ({ ...item, source: 'environment', status: 'production', reference: false }));
}
async function managedRows(env) {
  if (!env.DB?.prepare) return [];
  const result = await env.DB.prepare('SELECT * FROM external_ai_module_registry ORDER BY reference_module DESC, updated_at DESC, module_id').all();
  return result?.results || [];
}
export async function loadExternalAiModules(env = {}, { scope = 'production' } = {}) {
  const merged = new Map(legacyRegistry(env).map(item => [item.id, item]));
  for (const row of await managedRows(env)) {
    const item = rowToModule(row);
    if (scope === 'all' || item.status === 'production') merged.set(item.id, item);
    else if (item.status === 'blocked') merged.delete(item.id);
  }
  return [...merged.values()].filter(item => item.reference || (isSafeExternalAiEndpoint(item.endpoint) && item.capabilities?.length && item.secretBinding));
}
async function registryAudit(env, session, action, moduleId, detail = '') {
  if (!env.DB?.prepare) return;
  await env.DB.prepare('INSERT INTO external_ai_module_registry_audit (id,admin_email,action,module_id,detail,created_at) VALUES (?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), clean(session?.email, 240), action, clean(moduleId, 64), clean(detail, 2000), new Date().toISOString()).run().catch(() => {});
}
function runtimeScriptName(env = {}) { return clean(env.ENVIRONMENT, 40).toLowerCase() === 'production' ? 'ekodi-auth-api' : 'ekodi-auth-api-staging'; }
function secretSyncReady(env = {}) { return Boolean(clean(env.CLOUDFLARE_SECRET_MANAGER_TOKEN, 8192) && clean(env.CLOUDFLARE_ACCOUNT_ID, 240)); }
async function putRuntimeSecret(env, name, value) {
  if (!secretSyncReady(env)) throw new Error('AI_MODULE_SECRET_MANAGER_UNAVAILABLE');
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(clean(env.CLOUDFLARE_ACCOUNT_ID, 240))}/workers/scripts/${encodeURIComponent(runtimeScriptName(env))}/secrets`;
  const response = await fetch(endpoint, { method: 'PUT', headers: { authorization: `Bearer ${env.CLOUDFLARE_SECRET_MANAGER_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ name, text: String(value), type: 'secret_text' }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) throw new Error(`AI_MODULE_SECRET_SYNC_${response.status}`);
}async function snapshot(env) {
  const managed = (await managedRows(env)).map(row => {
    const item = rowToModule(row);
    return { ...item, secretConfigured: item.reference || Boolean(clean(env[item.secretBinding], 8192)), secretValueReturned: false };
  });
  return {
    ok: true, contract: 'ekodi.external-ai-registry.v1', contractVersion: CONTRACT_VERSION,
    statuses: ['draft', 'validating', 'staging', 'production', 'blocked'],
    secretManagerReady: secretSyncReady(env), modules: managed,
    legacyModules: legacyRegistry(env).map(item => ({ ...item, secretConfigured: Boolean(clean(env[item.secretBinding], 8192)), secretValueReturned: false })),
    generatedAt: new Date().toISOString(),
  };
}
async function createModule(request, env, session) {
  const body = await request.json().catch(() => ({}));
  let item; try { item = normalizeExternalAiModuleInput(body); } catch (error) { return json(request, env, { error: error.message }, 400); }
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(`INSERT INTO external_ai_module_registry
      (module_id,display_name,vendor_name,module_version,endpoint,capabilities_json,secret_binding,timeout_ms,retry_safe,retry_max_attempts,retry_backoff_ms,response_max_bytes,circuit_breaker_threshold,circuit_breaker_cooldown_ms,status,health_status,last_checked_at,last_error,reference_module,created_at,created_by,updated_at,updated_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft','unknown','','',0,?,?,?,?,?)`)
      .bind(item.id,item.name,item.vendor,item.version,item.endpoint,JSON.stringify(item.capabilities),item.secretBinding,item.timeoutMs,item.retrySafe?1:0,item.retryMaxAttempts,item.retryBackoffMs,item.responseMaxBytes,item.circuitBreakerThreshold,item.circuitBreakerCooldownMs,now,clean(session.email,240),now,clean(session.email,240)).run();
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('unique')) return json(request, env, { error: 'AI_MODULE_REGISTRY_ALREADY_EXISTS' }, 409);
    throw error;
  }
  await registryAudit(env, session, 'module.register', item.id, JSON.stringify({ vendor:item.vendor, endpoint:item.endpoint, capabilities:item.capabilities }));
  return json(request, env, await snapshot(env), 201);
}
async function updateModule(request, env, session, id) {
  const current = await env.DB.prepare('SELECT * FROM external_ai_module_registry WHERE module_id=?').bind(id).first();
  if (!current) return json(request, env, { error:'AI_MODULE_REGISTRY_NOT_FOUND' }, 404);
  if (Number(current.reference_module || 0) === 1) return json(request, env, { error:'AI_MODULE_REFERENCE_IMMUTABLE' }, 409);
  const body = await request.json().catch(() => ({}));
  let item; try { item = normalizeExternalAiModuleInput({ ...body, id }); } catch (error) { return json(request, env, { error:error.message }, 400); }
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE external_ai_module_registry SET display_name=?,vendor_name=?,module_version=?,endpoint=?,capabilities_json=?,timeout_ms=?,retry_safe=?,retry_max_attempts=?,retry_backoff_ms=?,response_max_bytes=?,circuit_breaker_threshold=?,circuit_breaker_cooldown_ms=?,health_status='unknown',last_error='',updated_at=?,updated_by=? WHERE module_id=?`)
    .bind(item.name,item.vendor,item.version,item.endpoint,JSON.stringify(item.capabilities),item.timeoutMs,item.retrySafe?1:0,item.retryMaxAttempts,item.retryBackoffMs,item.responseMaxBytes,item.circuitBreakerThreshold,item.circuitBreakerCooldownMs,now,clean(session.email,240),id).run();
  await registryAudit(env, session, 'module.update', id, JSON.stringify({ endpoint:item.endpoint, capabilities:item.capabilities }));
  return json(request, env, await snapshot(env));
}export function externalAiModuleStatusTransitionAllowed(from, to, { healthy = false, secretConfigured = false, reference = false } = {}) {
  if (!STATUSES.has(from) || !STATUSES.has(to) || from === to) return false;
  if (to === 'blocked') return true;
  if (from === 'blocked' && to === 'draft') return true;
  if (from === 'draft' && to === 'validating') return true;
  if (from === 'validating' && to === 'draft') return true;
  if (from === 'validating' && to === 'staging') return healthy && secretConfigured;
  if (from === 'staging' && to === 'validating') return true;
  if (from === 'staging' && to === 'production') return healthy && secretConfigured && !reference;
  if (from === 'production' && to === 'staging') return true;
  return false;
}
async function connectSecret(request, env, session, id) {
  if (request.headers.get('x-ekodi-confirm-impact') !== 'external-ai-module-secret-connect') return json(request, env, { error:'confirmation_required' }, 428);
  const row = await env.DB.prepare('SELECT * FROM external_ai_module_registry WHERE module_id=?').bind(id).first();
  if (!row) return json(request, env, { error:'AI_MODULE_REGISTRY_NOT_FOUND' }, 404);
  if (Number(row.reference_module || 0) === 1) return json(request, env, { error:'AI_MODULE_REFERENCE_HAS_NO_SECRET' }, 409);
  const body = await request.json().catch(() => ({})); const value = clean(body.value, 8192);
  if (value.length < 16) return json(request, env, { error:'AI_MODULE_SECRET_TOO_SHORT' }, 400);
  try { await putRuntimeSecret(env, row.secret_binding, value); }
  catch (error) { return json(request, env, { error:clean(error?.message || error, 160) }, 503); }
  await env.DB.prepare("UPDATE external_ai_module_registry SET health_status='unknown',last_error='',updated_at=?,updated_by=? WHERE module_id=?")
    .bind(new Date().toISOString(), clean(session.email, 240), id).run();
  await registryAudit(env, session, 'module.secret.connect', id, JSON.stringify({ binding:row.secret_binding, valueReturned:false }));
  return json(request, env, { ok:true, moduleId:id, binding:row.secret_binding, secretValueReturned:false });
}
async function probeHealth(module) {
  if (module.reference) return { ok:true, model:'ekodi-reference-v1', responseMs:0 };
  const started = Date.now();
  const response = await fetch(new URL('/v1/health', module.endpoint).toString(), { method:'GET', headers:{ accept:'application/json', 'x-ekodi-contract-version':CONTRACT_VERSION }, signal:AbortSignal.timeout(8000) });
  const declared = Number(response.headers.get('content-length') || 0); if (declared > 65536) throw new Error('AI_MODULE_HEALTH_RESPONSE_TOO_LARGE');
  const text = await response.text(); if (encoder.encode(text).byteLength > 65536) throw new Error('AI_MODULE_HEALTH_RESPONSE_TOO_LARGE');
  if (!response.ok) throw new Error(`AI_MODULE_HEALTH_HTTP_${response.status}`);
  const data = JSON.parse(text); if (data?.ok !== true) throw new Error('AI_MODULE_HEALTH_CONTRACT_INVALID');
  if (data.contractVersion && data.contractVersion !== CONTRACT_VERSION) throw new Error('AI_MODULE_HEALTH_VERSION_MISMATCH');
  return { ok:true, model:clean(data.model,120), responseMs:Date.now()-started };
}async function checkModule(request, env, session, id, executeProbe) {
  const row = await env.DB.prepare('SELECT * FROM external_ai_module_registry WHERE module_id=?').bind(id).first();
  if (!row) return json(request, env, { error:'AI_MODULE_REGISTRY_NOT_FOUND' }, 404);
  const module = rowToModule(row); const configured = module.reference || Boolean(clean(env[module.secretBinding], 8192));
  const now = new Date().toISOString();
  if (!configured) {
    await env.DB.prepare("UPDATE external_ai_module_registry SET status=CASE WHEN status='draft' THEN 'validating' ELSE status END,health_status='unconfigured',last_checked_at=?,last_error='secret_not_configured',updated_at=?,updated_by=? WHERE module_id=?")
      .bind(now, now, clean(session.email,240), id).run();
    await registryAudit(env, session, 'module.check', id, 'secret_not_configured');
    return json(request, env, { ok:false, moduleId:id, status:'unconfigured', code:'AI_MODULE_SECRET_NOT_CONFIGURED' }, 409);
  }
  try {
    const health = await probeHealth(module);
    const execution = typeof executeProbe === 'function' ? await executeProbe(module, session) : null;
    await env.DB.prepare("UPDATE external_ai_module_registry SET status=CASE WHEN status='draft' THEN 'validating' ELSE status END,health_status='healthy',last_checked_at=?,last_error='',updated_at=?,updated_by=? WHERE module_id=?")
      .bind(now, now, clean(session.email,240), id).run();
    await registryAudit(env, session, 'module.check', id, JSON.stringify({ health, execution:{ requestId:execution?.requestId || '', attempts:execution?.attempts || 0 } }));
    return json(request, env, { ok:true, moduleId:id, status:'healthy', health, execution:{ requestId:execution?.requestId || '', attempts:execution?.attempts || 0 } });
  } catch (error) {
    const code = clean(error?.message || error, 160);
    await env.DB.prepare("UPDATE external_ai_module_registry SET status=CASE WHEN status='draft' THEN 'validating' ELSE status END,health_status='error',last_checked_at=?,last_error=?,updated_at=?,updated_by=? WHERE module_id=?")
      .bind(now, code, now, clean(session.email,240), id).run();
    await registryAudit(env, session, 'module.check', id, code);
    return json(request, env, { ok:false, moduleId:id, status:'error', code }, 502);
  }
}
async function changeStatus(request, env, session, id) {
  if (request.headers.get('x-ekodi-confirm-impact') !== 'external-ai-module-status-change') return json(request, env, { error:'confirmation_required' }, 428);
  const row = await env.DB.prepare('SELECT * FROM external_ai_module_registry WHERE module_id=?').bind(id).first();
  if (!row) return json(request, env, { error:'AI_MODULE_REGISTRY_NOT_FOUND' }, 404);
  const body = await request.json().catch(() => ({})); const next = clean(body.status, 20).toLowerCase();
  const module = rowToModule(row); const secretConfigured = module.reference || Boolean(clean(env[module.secretBinding],8192));
  const allowed = externalAiModuleStatusTransitionAllowed(module.status, next, { healthy:module.health === 'healthy', secretConfigured, reference:module.reference });
  if (!allowed) return json(request, env, { error:'AI_MODULE_STATUS_TRANSITION_FORBIDDEN', from:module.status, to:next, healthy:module.health === 'healthy', secretConfigured }, 409);
  await env.DB.prepare('UPDATE external_ai_module_registry SET status=?,updated_at=?,updated_by=? WHERE module_id=?')
    .bind(next,new Date().toISOString(),clean(session.email,240),id).run();
  await registryAudit(env, session, 'module.status', id, JSON.stringify({ from:module.status, to:next }));
  return json(request, env, await snapshot(env));
}export async function handleExternalAiModuleRegistryControl(request, env = {}, { executeProbe } = {}) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith(ADMIN_BASE)) return null;
  if (request.method === 'OPTIONS') {
    const headers = corsHeaders(request, env);
    if (!headers.get('access-control-allow-origin')) return json(request, env, { error:'origin_forbidden' }, 403);
    return new Response(null, { status:204, headers });
  }
  const session = await adminSession(request, env);
  if (!session) return json(request, env, { error:'admin_authentication_required' }, 401);
  if (!env.DB?.prepare) return json(request, env, { error:'database_unavailable' }, 503);
  if (path === ADMIN_BASE && request.method === 'GET') return json(request, env, await snapshot(env));
  if (path === ADMIN_BASE && request.method === 'POST') return createModule(request, env, session);

  const moduleMatch = path.match(/^\/api\/ai-modules\/v1\/admin\/registry\/([a-z0-9._-]+)$/);
  if (moduleMatch && request.method === 'PUT') return updateModule(request, env, session, moduleMatch[1]);
  const secretMatch = path.match(/^\/api\/ai-modules\/v1\/admin\/registry\/([a-z0-9._-]+)\/secret$/);
  if (secretMatch && request.method === 'POST') return connectSecret(request, env, session, secretMatch[1]);
  const checkMatch = path.match(/^\/api\/ai-modules\/v1\/admin\/registry\/([a-z0-9._-]+)\/check$/);
  if (checkMatch && request.method === 'POST') return checkModule(request, env, session, checkMatch[1], executeProbe);
  const statusMatch = path.match(/^\/api\/ai-modules\/v1\/admin\/registry\/([a-z0-9._-]+)\/status$/);
  if (statusMatch && request.method === 'POST') return changeStatus(request, env, session, statusMatch[1]);
  return json(request, env, { error:'not_found' }, 404);
}

export const EXTERNAL_AI_MODULE_REGISTRY_CONTRACT = Object.freeze({
  version: 'ekodi.external-ai-registry.v1',
  adminBase: ADMIN_BASE,
  statuses: Object.freeze(['draft','validating','staging','production','blocked']),
  referenceModuleId: 'ekodi.reference-module',
  secretValuesPersistedInDatabase: false,
  productionRequiresHealthyValidation: true,
});