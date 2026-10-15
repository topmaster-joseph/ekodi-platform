// EKODI Core contract for cooperative-local identity and grant evaluation.
import authWorker from './auth-worker.js';
import { principalFromSupabaseRequest } from './ekodi-principal.js';
import { accessGrantIsActive } from './access-governance.js';
import { tenantGrantCapabilityDecision } from './tenant-access-authority.js';

const normalize = value => String(value || '').trim().toLowerCase();

async function platformSession(request, env) {
  const url = new URL('/api/session', request.url);
  const response = await authWorker.fetch(new Request(url, { headers: request.headers }), env);
  if (!response.ok) return null;
  const session = await response.json().catch(() => null);
  return session?.authenticated && session?.email ? session : null;
}

export async function cooperativeIdentity(request, env) {
  const principal = await principalFromSupabaseRequest(request);
  if (principal) return { id: principal.id, email: principal.email, platform: false };
  const session = await platformSession(request, env);
  if (!session) return null;
  return { id: `platform:${normalize(session.email)}`, email: normalize(session.email), platform: session.role === 'super_admin' };
}

export function cooperativeGrantDecision(grant, { administrative = false } = {}) {
  if (!accessGrantIsActive(grant)) return { allowed: false, code: 'COOP_MEMBERSHIP_REQUIRED' };
  if (!administrative) return { allowed: true };
  const site = tenantGrantCapabilityDecision(grant, 'tenant.site.manage');
  return site.allowed
    ? { allowed: true }
    : { allowed: false, code: 'COOP_ADMIN_REQUIRED' };
}

export async function cooperativeGrantForEmail(env, coop, email) {
  const tenant = await env.DB.prepare('SELECT id, slug, status FROM customer_tenants WHERE slug = ? LIMIT 1').bind(coop.slug).first();
  if (!tenant || tenant.status !== 'active') return null;
  return env.DB.prepare(`SELECT role, enabled, expires_at, capabilities_json, denied_capabilities_json
    FROM customer_access_grants WHERE tenant_id = ? AND lower(trim(email)) = ? LIMIT 1`)
    .bind(tenant.id, normalize(email)).first();
}

export async function resolveCooperativeAccess(request, env, coop, { administrative = false, platformContext = false } = {}) {
  const identity = await cooperativeIdentity(request, env);
  if (!identity) return { allowed: false, status: 401, code: 'COOP_LOGIN_REQUIRED' };
  // Global authority is enabled only at the explicit platform-control route.
  if (platformContext) {
    const session = await platformSession(request, env);
    if (session?.role !== 'super_admin') return { allowed: false, status: 403, code: 'PLATFORM_ADMIN_REQUIRED' };
    return { allowed: true, identity, scope: 'platform', role: 'super_admin' };
  }
  const grant = await cooperativeGrantForEmail(env, coop, identity.email);
  const decision = cooperativeGrantDecision(grant, { administrative });
  if (!decision.allowed) return { allowed: false, status: 403, code: decision.code };
  return { allowed: true, identity, scope: 'tenant', role: grant.role, canAdmin: cooperativeGrantDecision(grant, { administrative: true }).allowed };
}
