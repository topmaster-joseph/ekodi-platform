import authWorker, { isAllowedOrigin } from './auth-worker.js';
import { getCoreAiGatewayStatus } from './core-ai-gateway.js';
import {
  CORE_ROLES,
  canonicalCoreRole,
  principalFromAdminSession,
  principalFromCustomerSession,
  principalFromSupabaseRequest,
} from './ekodi-principal.js';

export const CORE_API_PREFIX = '/api/core/v1';
export const CORE_API_VERSION = '1.0.0';

const CORE_ROLE_LABELS = Object.freeze({
  owner: '소유자/책임자',
  admin: '관리자',
  manager: '운영책임자',
  marketer: '마케팅담당자',
  accountant: '회계담당자',
  staff: '실무담당자',
  member: '회원',
  viewer: '조회자',
});

function cors(request, env) {
  const origin = request.headers.get('origin') || '';
  const headers = {
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  if (origin && isAllowedOrigin(origin, env)) headers['access-control-allow-origin'] = origin;
  return headers;
}

function json(request, env, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...cors(request, env),
    },
  });
}

function publicPrincipal(principal) {
  if (!principal) return null;
  return {
    id: principal.id,
    email: principal.email,
    kind: principal.kind,
    provider: principal.provider,
    role: principal.role,
    coreRole: principal.coreRole,
    subject: principal.subject,
    capabilities: principal.capabilities,
  };
}

async function resolveCorePrincipal(request, env) {
  const admin = await principalFromAdminSession(request, env, authWorker);
  if (admin.principal) return { principal: admin.principal, source: 'admin-session', admin: true };

  const customer = await principalFromCustomerSession(request, env);
  if (customer) return { principal: customer, source: 'customer-session', admin: false };

  const supabase = await principalFromSupabaseRequest(request);
  if (supabase) return { principal: supabase, source: 'supabase', admin: false };
  return null;
}

function organizationFromRow(row, role = null) {
  const sourceRole = role || row.role || '';
  return {
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
    domain: row.domain,
    status: row.status,
    ...(sourceRole ? {
      role: sourceRole,
      coreRole: canonicalCoreRole(sourceRole),
    } : {}),
  };
}

async function organizationsForPrincipal(env, resolved) {
  if (resolved.admin) {
    const rows = await env.DB.prepare(`SELECT id, slug, name, domain, status
      FROM customer_tenants
      ORDER BY name`).all();
    return (rows.results || []).map(row => organizationFromRow(row, 'admin'));
  }

  if (resolved.source === 'customer-session' && resolved.principal.subject.type === 'tenant') {
    const row = await env.DB.prepare(`SELECT id, slug, name, domain, status
      FROM customer_tenants WHERE slug = ?`).bind(resolved.principal.subject.key).first();
    return row ? [organizationFromRow(row, resolved.principal.role)] : [];
  }

  const rows = await env.DB.prepare(`SELECT
      t.id, t.slug, t.name, t.domain, t.status, g.role
    FROM customer_access_grants g
    JOIN customer_tenants t ON t.id = g.tenant_id
    WHERE lower(trim(g.email)) = ? AND g.enabled = 1 AND t.status = 'active'
    ORDER BY t.name`)
    .bind(resolved.principal.email.toLowerCase()).all();
  return (rows.results || []).map(row => organizationFromRow(row, row.role));
}

async function organizationForSlug(env, resolved, slug) {
  const row = await env.DB.prepare(`SELECT id, slug, name, domain, status
    FROM customer_tenants WHERE slug = ?`).bind(slug).first();
  if (!row) return null;
  if (resolved.admin) return organizationFromRow(row, 'admin');

  if (resolved.source === 'customer-session') {
    if (resolved.principal.subject.type !== 'tenant' || resolved.principal.subject.key !== slug) return null;
    return organizationFromRow(row, resolved.principal.role);
  }

  const grant = await env.DB.prepare(`SELECT role, enabled
    FROM customer_access_grants
    WHERE tenant_id = ? AND lower(trim(email)) = ?`)
    .bind(row.id, resolved.principal.email.toLowerCase()).first();
  if (!grant || Number(grant.enabled) !== 1) return null;
  return organizationFromRow(row, grant.role);
}

function coreStatus(env = {}) {
  const ai = getCoreAiGatewayStatus(env);
  return {
    ok: true,
    service: 'ekodi-core',
    apiVersion: CORE_API_VERSION,
    schemaVersion: 2,
    architecture: 'hybrid-cloud',
    canonicalHosts: {
      api: 'api.ekodi.kr',
      admin: 'admin.ekodi.kr',
      auth: 'auth.ekodi.kr',
    },
    principles: [
      'tenant-isolation',
      'provider-independence',
      'ai-optional',
      'data-portability',
      'graceful-degradation',
      'observable-operations',
    ],
    stores: ['cloudflare-d1', 'supabase-postgres', 'object-storage'],
    ai: {
      gateway: ai.gateway,
      providerIndependent: ai.providerIndependent,
      aiOptional: ai.aiOptional,
      mode: ai.mode,
      providerDisabled: ai.providerDisabled,
    },
  };
}

export async function handleCoreApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(CORE_API_PREFIX)) return null;

  const origin = request.headers.get('origin');
  if (origin && !isAllowedOrigin(origin, env)) return json(request, env, { error: '허용되지 않은 요청입니다.', code: 'CORE_ORIGIN_FORBIDDEN' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request, env) });
  if (request.method !== 'GET') return json(request, env, { error: '지원하지 않는 요청 방식입니다.', code: 'CORE_METHOD_NOT_ALLOWED' }, 405);

  if (url.pathname === `${CORE_API_PREFIX}/status`) {
    return json(request, env, coreStatus(env));
  }

  if (url.pathname === `${CORE_API_PREFIX}/ai/status`) {
    return json(request, env, getCoreAiGatewayStatus(env));
  }

  if (url.pathname === `${CORE_API_PREFIX}/roles`) {
    return json(request, env, {
      schemaVersion: 1,
      roles: CORE_ROLES.map(role => ({ role, label: CORE_ROLE_LABELS[role] || role })),
    });
  }

  if (!env.DB) return json(request, env, { error: 'Core 데이터베이스 연결이 설정되지 않았습니다.', code: 'CORE_DATABASE_UNAVAILABLE' }, 503);
  const resolved = await resolveCorePrincipal(request, env);
  if (!resolved) return json(request, env, { error: 'EKODI 통합인증이 필요합니다.', code: 'CORE_AUTH_REQUIRED' }, 401);

  if (url.pathname === `${CORE_API_PREFIX}/me`) {
    const organizations = await organizationsForPrincipal(env, resolved);
    return json(request, env, {
      schemaVersion: 1,
      principal: publicPrincipal(resolved.principal),
      authSource: resolved.source,
      organizations,
    });
  }

  if (url.pathname === `${CORE_API_PREFIX}/organizations`) {
    const organizations = await organizationsForPrincipal(env, resolved);
    return json(request, env, {
      schemaVersion: 1,
      principal: publicPrincipal(resolved.principal),
      organizations,
    });
  }

  const organizationMatch = url.pathname.match(/^\/api\/core\/v1\/organizations\/([a-z0-9-]+)$/);
  if (organizationMatch) {
    const organization = await organizationForSlug(env, resolved, organizationMatch[1]);
    if (!organization) return json(request, env, { error: '접근 가능한 조직이 아닙니다.', code: 'CORE_ORGANIZATION_FORBIDDEN' }, 403);
    return json(request, env, {
      schemaVersion: 1,
      principal: publicPrincipal(resolved.principal),
      organization,
    });
  }

  return json(request, env, { error: 'Core API endpoint not found', code: 'CORE_NOT_FOUND' }, 404);
}
