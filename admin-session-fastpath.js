const DEFAULT_ALLOWED_ORIGIN = 'https://shy-thunder-39a4.topmaster-joseph.workers.dev';
const encoder = new TextEncoder();

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(String(value || ''))));
}

function configuredOrigins(env = {}) {
  const allowed = String(env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGIN)
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (env.ENVIRONMENT !== 'production') allowed.push('http://localhost:3000', 'http://localhost:8788');
  return new Set(allowed);
}

function allowedOrigin(origin, env = {}) {
  return !origin || configuredOrigins(env).has(origin);
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

export async function handleAdminSessionFastPath(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/session' || request.method !== 'GET') return null;
  const origin = request.headers.get('origin') || '';
  if (!allowedOrigin(origin, env)) return json(request, env, { authenticated:false, error:'ORIGIN_FORBIDDEN' }, 403);
  if (!env.DB) return json(request, env, { authenticated:false, error:'DATABASE_UNAVAILABLE' }, 503);

  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return json(request, env, { authenticated:false }, 401);

  const token = authorization.slice(7);
  if (!token || token.length > 256) return json(request, env, { authenticated:false }, 401);
  const tokenHash = await sha256(token);
  const admin = await env.DB.prepare(`SELECT admins.email, admins.role, sessions.expires_at
    FROM sessions JOIN admins ON admins.id = sessions.admin_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?`)
    .bind(tokenHash, new Date().toISOString()).first();

  return admin
    ? json(request, env, { authenticated:true, email:admin.email, role:admin.role, expiresAt:admin.expires_at })
    : json(request, env, { authenticated:false }, 401);
}
