import { isAllowedOrigin } from './auth-worker.js';
import { authorizeEkodiAction, adminAuthorityForRole } from './ekodi-authorization.js';
import { principalFromSupabaseRequest } from './ekodi-principal.js';
import { accessScopeDescriptor, accessScopeDirectory, normalizeAccessScope } from './access-scope-registry.js';
import { UNIVERSAL_ACCESS_ROLES, universalGrantAuthority, validateUniversalGrant } from './universal-access-policy.js';

const encoder = new TextEncoder();
const LOCAL_ASSIGNABLE_ROLES = new Set(['manager', 'ai_manager', 'external_developer', 'staff', 'viewer']);

function clean(value, max = 320) { return String(value ?? '').trim().slice(0, max); }
function lower(value, max = 320) { return clean(value, max).toLowerCase(); }
async function sha256(value) {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(String(value || '')));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function tokenFrom(request) {
  const auth = String(request.headers.get('authorization') || '');
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  return token && token.length <= 8192 ? token : '';
}
function cors(origin, env) {
  const headers = { 'access-control-allow-headers':'content-type, authorization', 'access-control-allow-methods':'GET, POST, DELETE, OPTIONS', 'access-control-max-age':'86400', vary:'Origin' };
  if (origin && isAllowedOrigin(origin, env)) headers['access-control-allow-origin'] = origin;
  return headers;
}
function json(data, status, request, env) {
  return new Response(JSON.stringify(data), { status, headers:{ 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff', ...cors(request.headers.get('origin'), env) } });
}
async function bodyJson(request) { try { return await request.json(); } catch { return null; } }
function parseList(value) {
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(String(value || '[]')); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
function publicGrant(row) {
  const scope = { type: row.scope_type, key: row.scope_key };
  return {
    id: row.id,
    email: row.email,
    principalType: row.principal_type,
    githubUsername: row.github_username || '',
    scope,
    scopeInfo: accessScopeDescriptor(scope),
    role: row.role,
    capabilities: parseList(row.capabilities_json),
    deniedCapabilities: parseList(row.denied_capabilities_json),
    enabled: Number(row.enabled) === 1,
    expiresAt: row.expires_at || '',
    note: row.note || '',
    sourceRef: row.source_ref || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function platformGate(request, env, capability) {
  const token = tokenFrom(request);
  if (!env.DB || !token || token.length > 256) return null;
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const admin = await env.DB.prepare(`SELECT a.id,a.email,a.role FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>?`).bind(tokenHash, now).first();
  if (!admin) return null;
  const elevatedRow = await env.DB.prepare(`SELECT expires_at FROM admin_privileged_sessions WHERE token_hash=? AND admin_id=? AND expires_at>?`).bind(tokenHash, admin.id, now).first().catch(() => null);
  const authority = adminAuthorityForRole(admin.role, { scope:{ type:'platform', id:'global' }, elevated:Boolean(elevatedRow?.expires_at), elevatedUntil:elevatedRow?.expires_at || null });
  const decision = authorizeEkodiAction({ authority, requiredCapabilities:[capability], resourceScope:{ type:'platform', id:'global' } });
  return { kind:'platform', admin, authority, decision, actorEmail:admin.email };
}

function scopeCapability(scope, write = false) {
  if (scope.type === 'service') return `service:access.${write ? 'review' : 'read'}`;
  if (scope.type === 'workspace') return `workspace:access.${write ? 'review' : 'read'}`;
  return '';
}

async function scopedGate(request, env, scope, write = false) {
  if (!env.DB || !scope || !['service','workspace'].includes(scope.type)) return null;
  const principal = await principalFromSupabaseRequest(request);
  if (!principal?.email) return null;
  const row = await env.DB.prepare(`SELECT * FROM access_scope_grants WHERE email=? AND scope_type=? AND scope_key=? AND enabled=1`).bind(lower(principal.email, 254), scope.type, scope.key).first().catch(() => null);
  const authority = universalGrantAuthority(row);
  if (!authority) return null;
  const capability = scopeCapability(scope, write);
  const decision = authorizeEkodiAction({ authority, requiredCapabilities:[capability], resourceScope:scope });
  return { kind:'scoped', principal, grant:row, authority, decision, actorEmail:principal.email };
}

async function accessGate(request, env, scope, write = false) {
  const platform = await platformGate(request, env, write ? 'admin:accounts.write' : 'admin:accounts.read');
  if (platform?.decision?.allowed) return platform;
  const scoped = await scopedGate(request, env, scope, write);
  if (scoped?.decision?.allowed) return scoped;
  return platform || scoped || null;
}

function gateError(gate, request, env) {
  const code = gate?.decision?.code || 'AUTH_REQUIRED';
  const status = code === 'AUTH_REQUIRED' ? 401 : 403;
  const error = code === 'ELEVATION_REQUIRED' ? '권한 변경에는 최고관리자 추가 인증이 필요합니다.' : '이 범위의 권한을 관리할 권한이 없습니다.';
  return json({ error, code }, status, request, env);
}

async function writeAudit(env, grantId, actorEmail, action, scope, targetEmail, detail = {}) {
  await env.DB.prepare(`INSERT INTO access_scope_grant_audit(grant_id,actor_email,action,scope_type,scope_key,target_email,detail_json,created_at) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(grantId || null, lower(actorEmail, 254), action, scope.type, scope.key, lower(targetEmail, 254), JSON.stringify(detail).slice(0, 2000), new Date().toISOString()).run();
}

async function listGrants(request, env, scope) {
  const gate = await accessGate(request, env, scope, false);
  if (!gate?.decision?.allowed) return gateError(gate, request, env);
  const url = new URL(request.url);
  const email = lower(url.searchParams.get('email'), 254);
  const clauses = [], args = [];
  if (scope) { clauses.push('scope_type=?', 'scope_key=?'); args.push(scope.type, scope.key); }
  if (email) { clauses.push('email=?'); args.push(email); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await env.DB.prepare(`SELECT * FROM access_scope_grants ${where} ORDER BY scope_type,scope_key,email`).bind(...args).all();
  return json({ schemaVersion:1, scopes:accessScopeDirectory(), roles:Object.keys(UNIVERSAL_ACCESS_ROLES), grants:(rows.results || []).map(publicGrant) }, 200, request, env);
}

async function upsertGrant(request, env) {
  const body = await bodyJson(request);
  const validation = validateUniversalGrant(body || {});
  if (!validation.ok) return json({ error:'권한 설정 값을 확인해 주세요.', code:'INVALID_GRANT', errors:validation.errors }, 400, request, env);
  const grant = validation.value;
  const gate = await accessGate(request, env, grant.scope, true);
  if (!gate?.decision?.allowed) return gateError(gate, request, env);
  if (gate.kind === 'scoped') {
    if (!LOCAL_ASSIGNABLE_ROLES.has(grant.role)) return json({ error:'하위 관리자는 동일 범위의 실무·조회·AI·외부개발자 권한만 위임할 수 있습니다.', code:'ROLE_DELEGATION_FORBIDDEN' }, 403, request, env);
    if (grant.capabilities.length || grant.deniedCapabilities.length) return json({ error:'세부 capability 직접 지정은 최고관리자만 가능합니다.', code:'CUSTOM_CAPABILITY_FORBIDDEN' }, 403, request, env);
  }
  const id = `grant:${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const existing = await env.DB.prepare(`SELECT id,created_at,created_by FROM access_scope_grants WHERE email=? AND scope_type=? AND scope_key=?`).bind(grant.email, grant.scope.type, grant.scope.key).first();
  const grantId = existing?.id || id;
  await env.DB.prepare(`INSERT INTO access_scope_grants(id,email,principal_type,github_username,scope_type,scope_key,role,capabilities_json,denied_capabilities_json,enabled,expires_at,note,source_ref,created_at,created_by,updated_at,updated_by)
    VALUES(?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?)
    ON CONFLICT(email,scope_type,scope_key) DO UPDATE SET principal_type=excluded.principal_type,github_username=excluded.github_username,role=excluded.role,capabilities_json=excluded.capabilities_json,denied_capabilities_json=excluded.denied_capabilities_json,enabled=1,expires_at=excluded.expires_at,note=excluded.note,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
    .bind(grantId, grant.email, grant.principalType, grant.githubUsername, grant.scope.type, grant.scope.key, grant.role, JSON.stringify(grant.capabilities), JSON.stringify(grant.deniedCapabilities), grant.expiresAt || null, clean(body?.note, 500), 'universal-access-api', existing?.created_at || now, existing?.created_by || gate.actorEmail, now, gate.actorEmail).run();
  await writeAudit(env, grantId, gate.actorEmail, existing ? 'grant.updated' : 'grant.created', grant.scope, grant.email, { role:grant.role, principalType:grant.principalType, expiresAt:grant.expiresAt || null });
  const row = await env.DB.prepare('SELECT * FROM access_scope_grants WHERE id=?').bind(grantId).first();
  return json({ ok:true, grant:publicGrant(row) }, existing ? 200 : 201, request, env);
}

async function revokeGrant(request, env) {
  const body = await bodyJson(request);
  const scope = normalizeAccessScope({ type:body?.scopeType ?? body?.scope_type, key:body?.scopeKey ?? body?.scope_key });
  const email = lower(body?.email, 254);
  if (!scope || !email) return json({ error:'범위와 이메일을 확인해 주세요.', code:'INVALID_REVOKE' }, 400, request, env);
  const gate = await accessGate(request, env, scope, true);
  if (!gate?.decision?.allowed) return gateError(gate, request, env);
  const row = await env.DB.prepare(`SELECT id,role FROM access_scope_grants WHERE email=? AND scope_type=? AND scope_key=?`).bind(email, scope.type, scope.key).first();
  if (!row) return json({ error:'권한을 찾을 수 없습니다.', code:'GRANT_NOT_FOUND' }, 404, request, env);
  if (gate.kind === 'scoped' && !LOCAL_ASSIGNABLE_ROLES.has(String(row.role || ''))) return json({ error:'하위 관리자는 상위 관리자 권한을 회수할 수 없습니다.', code:'ROLE_DELEGATION_FORBIDDEN' }, 403, request, env);
  await env.DB.prepare(`UPDATE access_scope_grants SET enabled=0,updated_at=?,updated_by=? WHERE id=?`).bind(new Date().toISOString(), gate.actorEmail, row.id).run();
  await writeAudit(env, row.id, gate.actorEmail, 'grant.revoked', scope, email, { previousRole:row.role });
  return json({ ok:true, id:row.id }, 200, request, env);
}

export async function handleUniversalAccessControl(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/access-governance')) return null;
  if (!env.DB) return json({ error:'데이터베이스 연결이 설정되지 않았습니다.' }, 503, request, env);
  const origin = request.headers.get('origin');
  if (origin && !isAllowedOrigin(origin, env)) return json({ error:'허용되지 않은 요청입니다.' }, 403, request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:cors(origin, env) });
  const scope = normalizeAccessScope({ type:url.searchParams.get('scope_type'), key:url.searchParams.get('scope_key') });
  if (request.method === 'GET' && url.pathname === '/api/access-governance/scopes') {
    const gate = await platformGate(request, env, 'admin:accounts.read');
    if (!gate?.decision?.allowed) return gateError(gate, request, env);
    return json({ contract:'person-scope-role-capability', scopes:accessScopeDirectory(), roles:Object.keys(UNIVERSAL_ACCESS_ROLES) }, 200, request, env);
  }
  if (request.method === 'GET' && url.pathname === '/api/access-governance/grants') return listGrants(request, env, scope);
  if (request.method === 'POST' && url.pathname === '/api/access-governance/grants') return upsertGrant(request, env);
  if (request.method === 'POST' && url.pathname === '/api/access-governance/revoke') return revokeGrant(request, env);
  return json({ error:'권한관리 경로를 찾을 수 없습니다.', code:'ACCESS_ROUTE_NOT_FOUND' }, 404, request, env);
}
