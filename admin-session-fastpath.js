import { adminAuthorityForRole, authorizeEkodiAction } from './ekodi-authorization.js';
import { EKODI_REQUIRED_CAPABILITY_HEADER } from './admin-route-authorization.js';

const encoder = new TextEncoder();

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(String(value || ''))));
}

function allowedOrigin(origin, env = {}) {
  if (!origin) return true;
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return allowed.includes(origin);
}

function json(request, env, data, status = 200) {
  const origin = request.headers.get('origin') || '';
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    vary: 'Origin',
  });
  if (origin && allowedOrigin(origin, env)) headers.set('access-control-allow-origin', origin);
  return new Response(JSON.stringify(data), { status, headers });
}

export async function resolveAdminSessionAuthority(request, env) {
  if (!env?.DB) return null;
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice(7);
  if (!token || token.length > 256) return null;

  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const admin = await env.DB.prepare(`SELECT admins.email, admins.role, sessions.expires_at,
      privileged.expires_at AS elevated_until
    FROM sessions
    JOIN admins ON admins.id = sessions.admin_id
    LEFT JOIN admin_privileged_sessions privileged
      ON privileged.token_hash = sessions.token_hash AND privileged.expires_at > ?
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?`)
    .bind(now, tokenHash, now).first()
    .catch(async () => env.DB.prepare(`SELECT admins.email, admins.role, sessions.expires_at
      FROM sessions JOIN admins ON admins.id = sessions.admin_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`)
      .bind(tokenHash, now).first());

  if (!admin) return null;
  const authority = adminAuthorityForRole(admin.role, {
    scope: { type:'platform', id:'global' },
    elevated: Boolean(admin.elevated_until),
    elevatedUntil: admin.elevated_until || null,
  });
  return Object.freeze({
    authenticated:true,
    email:admin.email,
    role:admin.role,
    expiresAt:admin.expires_at,
    authority,
  });
}

export function authorizeAdminSessionCapability(session, capability = '') {
  const required = String(capability || '').trim().toLowerCase();
  if (!required) return Object.freeze({ allowed:true, code:'ALLOW', missing:[] });
  if (!session?.authority) return Object.freeze({ allowed:false, code:'AUTH_REQUIRED', missing:[] });
  return authorizeEkodiAction({
    authority:session.authority,
    requiredCapabilities:[required],
    resourceScope:{ type:'platform', id:'global' },
  });
}

function deniedPayload(session, decision) {
  return {
    authenticated:true,
    email:session.email,
    role:session.role,
    authority:session.authority,
    error:decision.code === 'ELEVATION_REQUIRED'
      ? '보호된 작업은 추가 Google 인증이 필요합니다.'
      : '이 작업에 필요한 관리자 권한이 없습니다.',
    code:decision.code,
    missing:decision.missing || [],
  };
}

export async function handleAdminSessionFastPath(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/session' || request.method !== 'GET') return null;
  const origin = request.headers.get('origin') || '';
  if (!allowedOrigin(origin, env)) return json(request, env, { authenticated:false, error:'ORIGIN_FORBIDDEN' }, 403);
  if (!env.DB) return json(request, env, { authenticated:false, error:'DATABASE_UNAVAILABLE' }, 503);

  const session = await resolveAdminSessionAuthority(request, env);
  if (!session) return json(request, env, { authenticated:false }, 401);

  const requiredCapability = request.headers.get(EKODI_REQUIRED_CAPABILITY_HEADER) || '';
  const decision = authorizeAdminSessionCapability(session, requiredCapability);
  if (!decision.allowed) return json(request, env, deniedPayload(session, decision), 403);

  return json(request, env, session);
}
