const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const ACCESS_API = `${SUPABASE_URL}/functions/v1/access-api`;
const COOKIE_NAME = '__Host-ekodi_handoff';
const HANDOFF_TTL_SECONDS = 90;
const AUTH_ORIGIN = 'https://auth.ekodi.kr';
const FIXED_RETURN_ORIGINS = new Set([
  'https://marketing.ekodi.kr',
  'https://jadam.ekodi.kr',
  'https://pizzamaru.ekodi.kr',
  'https://yogurt.ekodi.kr',
]);

const encoder = new TextEncoder();

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(String(value || ''))));
}

function randomOpaque() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

function bearerToken(request) {
  const value = String(request.headers.get('authorization') || '');
  if (!value.toLowerCase().startsWith('bearer ')) return '';
  const token = value.slice(7).trim();
  return token && token.length <= 8192 ? token : '';
}

function configuredOrigins(env = {}) {
  return new Set(String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
}

export function isMarketingReturnOrigin(origin) {
  if (FIXED_RETURN_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && /^[a-z0-9-]+\.ai\.ekodi\.kr$/i.test(url.hostname) && url.origin === origin;
  } catch {
    return false;
  }
}

export function safeMarketingReturn(raw) {
  try {
    const url = new URL(String(raw || 'https://marketing.ekodi.kr/'));
    if (url.protocol !== 'https:' || url.username || url.password || !isMarketingReturnOrigin(url.origin)) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function consumerOriginAllowed(origin, env = {}) {
  if (!origin) return false;
  if (isMarketingReturnOrigin(origin)) return true;
  return configuredOrigins(env).has(origin) && origin !== AUTH_ORIGIN;
}

function allowedOriginFor(path, origin, env = {}) {
  if (path === '/api/marketing/handoff/start') return origin === AUTH_ORIGIN;
  if (path === '/api/marketing/handoff/consume') return consumerOriginAllowed(origin, env);
  return false;
}

function corsHeaders(origin, allowed) {
  const headers = {
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-credentials': 'true',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
  if (origin && allowed) headers['access-control-allow-origin'] = origin;
  return headers;
}

function responseHeaders(request, allowed) {
  return {
    'cache-control': 'no-store, private',
    'content-type': 'application/json; charset=utf-8',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    ...corsHeaders(request.headers.get('origin'), allowed),
  };
}

function json(data, status, request, allowed, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...responseHeaders(request, allowed), ...extraHeaders },
  });
}

function noContent(status, request, allowed, extraHeaders = {}) {
  const headers = responseHeaders(request, allowed);
  delete headers['content-type'];
  return new Response(null, { status, headers: { ...headers, ...extraHeaders } });
}

function issueCookie(opaque) {
  return `${COOKIE_NAME}=${opaque}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${HANDOFF_TTL_SECONDS}`;
}

function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function cookieValue(request) {
  const raw = String(request.headers.get('cookie') || '');
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE_NAME) return rest.join('=').trim();
  }
  return '';
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

async function cleanupExpired(env) {
  const now = new Date().toISOString();
  await env.DB.prepare('DELETE FROM marketing_handoff_exchanges WHERE expires_at <= ? OR consumed_at IS NOT NULL').bind(now).run();
}

async function createHandoff(request, env, allowed) {
  const token = bearerToken(request);
  if (!token) return json({ error: '로그인 인증이 필요합니다.', code: 'LOGIN_REQUIRED' }, 401, request, allowed);

  const body = await readJson(request);
  const returnTo = safeMarketingReturn(body?.return_to);
  if (!returnTo) return json({ error: '허용되지 않은 Marketing AI 복귀 주소입니다.', code: 'INVALID_RETURN_TO' }, 400, request, allowed);
  const workspaceKey = String(body?.workspace_key || '').trim();
  if (workspaceKey.length > 256) return json({ error: 'Workspace 식별자가 너무 깁니다.', code: 'INVALID_WORKSPACE' }, 400, request, allowed);

  const upstream = await fetch(`${ACCESS_API}/handoff`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      site: 'marketing',
      return_to: returnTo,
      ...(workspaceKey ? { workspace_key: workspaceKey } : {}),
    }),
  });
  const text = await upstream.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!upstream.ok) {
    const status = upstream.status === 401 || upstream.status === 403 ? upstream.status : 502;
    return json({ error: data?.error || 'Marketing AI 연결 권한을 확인하지 못했습니다.', code: data?.code || 'HANDOFF_UPSTREAM_FAILED' }, status, request, allowed);
  }

  const tokenHash = String(data?.tokenHash || '').trim();
  const tokenType = String(data?.type || 'email').trim().slice(0, 32) || 'email';
  const verifiedReturn = safeMarketingReturn(data?.returnTo || returnTo);
  if (!tokenHash || tokenHash.length > 4096 || !verifiedReturn) {
    return json({ error: '안전한 로그인 교환정보를 만들지 못했습니다.', code: 'HANDOFF_INVALID' }, 502, request, allowed);
  }

  const opaque = randomOpaque();
  const exchangeHash = await sha256(opaque);
  const now = new Date();
  const expires = new Date(now.getTime() + HANDOFF_TTL_SECONDS * 1000);
  await cleanupExpired(env);
  await env.DB.prepare(`INSERT INTO marketing_handoff_exchanges
    (exchange_hash, token_hash, token_type, workspace_json, return_to, created_at, expires_at, consumed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`)
    .bind(
      exchangeHash,
      tokenHash,
      tokenType,
      JSON.stringify(data?.workspace || null),
      verifiedReturn,
      now.toISOString(),
      expires.toISOString(),
    ).run();

  return json({ ok: true, returnTo: verifiedReturn, handoff: 'httpOnly-cookie' }, 200, request, allowed, {
    'set-cookie': issueCookie(opaque),
  });
}

async function consumeHandoff(request, env, allowed) {
  const opaque = cookieValue(request);
  if (!opaque || !/^[a-f0-9]{64}$/i.test(opaque)) {
    return noContent(204, request, allowed, { 'set-cookie': clearCookie() });
  }

  const exchangeHash = await sha256(opaque);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(`SELECT exchange_hash,token_hash,token_type,workspace_json,return_to,expires_at,consumed_at
    FROM marketing_handoff_exchanges WHERE exchange_hash=? LIMIT 1`).bind(exchangeHash).first();
  if (!row || row.consumed_at || String(row.expires_at || '') <= now) {
    if (row) await env.DB.prepare('DELETE FROM marketing_handoff_exchanges WHERE exchange_hash=?').bind(exchangeHash).run();
    return json({ error: '로그인 연결정보가 만료되었습니다.', code: 'HANDOFF_EXPIRED' }, 410, request, allowed, {
      'set-cookie': clearCookie(),
    });
  }

  const claimed = await env.DB.prepare(`UPDATE marketing_handoff_exchanges SET consumed_at=?
    WHERE exchange_hash=? AND consumed_at IS NULL AND expires_at>?`).bind(now, exchangeHash, now).run();
  if (Number(claimed?.meta?.changes || 0) !== 1) {
    return json({ error: '이미 사용된 로그인 연결정보입니다.', code: 'HANDOFF_USED' }, 409, request, allowed, {
      'set-cookie': clearCookie(),
    });
  }

  let workspace = null;
  try { workspace = JSON.parse(String(row.workspace_json || 'null')); } catch {}
  await env.DB.prepare('DELETE FROM marketing_handoff_exchanges WHERE exchange_hash=?').bind(exchangeHash).run();

  return json({
    tokenHash: row.token_hash,
    type: row.token_type || 'email',
    workspace,
    returnTo: row.return_to,
  }, 200, request, allowed, { 'set-cookie': clearCookie() });
}

export async function handleMarketingAuthHandoffRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/marketing/handoff')) return null;
  const origin = String(request.headers.get('origin') || '');
  const allowed = allowedOriginFor(path, origin, env);

  if (request.method === 'OPTIONS') {
    if (!allowed) return noContent(403, request, false);
    return noContent(204, request, true);
  }
  if (!allowed) return json({ error: '허용되지 않은 요청 출처입니다.', code: 'ORIGIN_DENIED' }, 403, request, false);
  if (request.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.', code: 'METHOD_NOT_ALLOWED' }, 405, request, true);

  if (path === '/api/marketing/handoff/start') return createHandoff(request, env, true);
  if (path === '/api/marketing/handoff/consume') return consumeHandoff(request, env, true);
  return json({ error: 'Marketing AI handoff endpoint not found' }, 404, request, true);
}

export async function runMarketingAuthHandoffSchedule(env) {
  await cleanupExpired(env);
}
