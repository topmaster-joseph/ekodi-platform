import authWorker, { isAllowedOrigin } from './auth-worker.js';

const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const ITERATIONS = 310000;
const SESSION_HOURS = 12;
const encoder = new TextEncoder();

const TENANT_REALMS = Object.freeze({
  cgma: 'cgma-client',
  jadam: 'jadam-client',
  pizzamaru: 'pizzamaru-client',
  yogurt: 'yogurt-client',
});
const ROLE_SET = new Set([
  'store_owner',
  'marketing_manager',
  'hq_manager',
  'accounting_manager',
  'client_admin',
  'client_editor',
  'client_viewer',
]);

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(String(value || ''))));
}

async function randomPasswordRecord() {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const material = await crypto.subtle.importKey('raw', secret, 'PBKDF2', false, ['deriveBits']);
  const digest = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    material,
    256,
  );
  return { salt: bytesToHex(salt), digest: bytesToHex(digest) };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeTenant(value) {
  const tenant = String(value || '').trim().toLowerCase();
  return Object.hasOwn(TENANT_REALMS, tenant) ? tenant : '';
}

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  return ROLE_SET.has(role) ? role : '';
}

function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cors(origin, env) {
  const headers = {
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  if (origin && isAllowedOrigin(origin, env)) headers['access-control-allow-origin'] = origin;
  return headers;
}

function json(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...cors(request.headers.get('origin'), env),
    },
  });
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS customer_tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      domain TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS customer_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_iterations INTEGER NOT NULL DEFAULT ${ITERATIONS},
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      last_login_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS customer_memberships (
      tenant_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, user_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS customer_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      revoked_at TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS customer_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      tenant_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS customer_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      user_id INTEGER,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`),
  ]);
  await db.prepare("UPDATE customer_tenants SET domain = 'yogurt.ekodi.kr' WHERE slug = 'yogurt' AND domain <> 'yogurt.ekodi.kr'").run();
}

async function adminSession(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }), env);
  if (!response.ok) return null;
  return response.json();
}

async function adminId(db, session) {
  const row = await db.prepare('SELECT id FROM admins WHERE email = ?').bind(session.email).first();
  return row?.id || null;
}

async function writeAdminAudit(db, session, action, resource, detail = '') {
  const id = await adminId(db, session);
  await db.prepare(`INSERT INTO audit_logs (admin_id, action, resource, detail, created_at)
    VALUES (?, ?, ?, ?, ?)`)
    .bind(id, action, resource, String(detail).slice(0, 500), new Date().toISOString()).run();
}

async function issueSession(db, userId, tenantId) {
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000);
  await db.prepare('DELETE FROM customer_sessions WHERE expires_at <= ?').bind(now.toISOString()).run();
  await db.prepare(`INSERT INTO customer_sessions (token_hash, user_id, tenant_id, expires_at, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(tokenHash, userId, tenantId, expiresAt.toISOString(), now.toISOString(), now.toISOString()).run();
  return { token, expiresAt: expiresAt.toISOString() };
}

async function supabaseUser(accessToken) {
  if (!accessToken || accessToken.length > 8192) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) return null;
  const user = await response.json();
  const email = normalizeEmail(user?.email);
  if (!user?.id || !email || !user?.email_confirmed_at) return null;
  return {
    id: user.id,
    email,
    displayName: String(user?.user_metadata?.full_name || user?.user_metadata?.name || '').slice(0, 100),
  };
}

async function preregister(request, env, slug) {
  const session = await adminSession(request, env);
  if (!session) return json({ error: 'EKODI 관리자 인증이 필요합니다.' }, 401, request, env);
  const tenant = await env.DB.prepare('SELECT id, slug, name, domain, status FROM customer_tenants WHERE slug = ?').bind(slug).first();
  if (!tenant || tenant.status !== 'active') return json({ error: '등록된 고객사가 아닙니다.' }, 404, request, env);

  const body = await readJson(request);
  const email = normalizeEmail(body?.email);
  const role = normalizeRole(body?.role || 'store_owner');
  if (!validEmail(email) || !role) return json({ error: '고객 이메일 또는 권한을 확인해 주세요.' }, 400, request, env);

  const now = new Date().toISOString();
  let user = await env.DB.prepare('SELECT id, email, status FROM customer_users WHERE email = ?').bind(email).first();
  if (!user) {
    const credential = await randomPasswordRecord();
    const result = await env.DB.prepare(`INSERT INTO customer_users
      (email, display_name, password_hash, password_salt, password_iterations, status, created_at)
      VALUES (?, '', ?, ?, ?, 'active', ?)`)
      .bind(email, credential.digest, credential.salt, ITERATIONS, now).run();
    user = { id: result.meta.last_row_id, email, status: 'active' };
  } else if (user.status !== 'active') {
    return json({ error: '비활성화된 고객 계정입니다. 계정 상태를 먼저 확인해 주세요.' }, 409, request, env);
  }

  const existing = await env.DB.prepare('SELECT status FROM customer_memberships WHERE tenant_id = ? AND user_id = ?')
    .bind(tenant.id, user.id).first();
  const membershipStatus = existing?.status === 'active' ? 'active' : 'pre_registered';
  await env.DB.prepare(`INSERT INTO customer_memberships (tenant_id, user_id, role, status, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, user_id) DO UPDATE SET role = excluded.role, status = excluded.status`)
    .bind(tenant.id, user.id, role, membershipStatus, now).run();

  await env.DB.prepare(`UPDATE customer_invites SET revoked_at = ? WHERE tenant_id = ? AND email = ?
    AND accepted_at IS NULL AND revoked_at IS NULL`).bind(now, tenant.id, email).run();
  await writeAdminAudit(env.DB, session, 'customer.google.preregister', tenant.domain, JSON.stringify({ email, role }));

  return json({
    ok: true,
    account: {
      email,
      role,
      status: membershipStatus,
      tenant: tenant.slug,
      loginUrl: `https://auth.ekodi.kr/?site=${TENANT_REALMS[slug]}`,
    },
  }, existing ? 200 : 201, request, env);
}

async function federatedLogin(request, env) {
  const body = await readJson(request);
  const tenantSlug = normalizeTenant(body?.tenant);
  const identity = await supabaseUser(String(body?.accessToken || ''));
  if (!tenantSlug || !identity) return json({ error: '통합인증 세션을 확인해 주세요.' }, 401, request, env);

  const tenant = await env.DB.prepare('SELECT id, slug, name, domain, status FROM customer_tenants WHERE slug = ?').bind(tenantSlug).first();
  if (!tenant || tenant.status !== 'active') return json({ error: '등록된 고객사가 아닙니다.' }, 404, request, env);

  const user = await env.DB.prepare(`SELECT u.id, u.email, u.display_name, u.status AS user_status,
      m.role, m.status AS membership_status
    FROM customer_users u JOIN customer_memberships m ON m.user_id = u.id
    WHERE u.email = ? AND m.tenant_id = ?`).bind(identity.email, tenant.id).first();
  if (!user || user.user_status !== 'active' || !['pre_registered', 'active'].includes(user.membership_status)) {
    return json({ error: '이 Google 계정은 해당 고객 관리공간에 사전등록되어 있지 않습니다.' }, 403, request, env);
  }

  const now = new Date().toISOString();
  if (user.membership_status === 'pre_registered') {
    await env.DB.prepare(`UPDATE customer_memberships SET status = 'active' WHERE tenant_id = ? AND user_id = ?`)
      .bind(tenant.id, user.id).run();
  }
  const session = await issueSession(env.DB, user.id, tenant.id);
  await env.DB.prepare('UPDATE customer_users SET last_login_at = ?, display_name = CASE WHEN display_name = \'\' THEN ? ELSE display_name END WHERE id = ?')
    .bind(now, identity.displayName, user.id).run();
  await env.DB.prepare(`INSERT INTO customer_audit_logs (tenant_id, user_id, action, resource, detail, created_at)
    VALUES (?, ?, 'session.google_login', 'customer-portal', ?, ?)`)
    .bind(tenant.id, user.id, identity.id, now).run();

  return json({
    ok: true,
    email: user.email,
    displayName: user.display_name || identity.displayName,
    role: user.role,
    tenant: { slug: tenant.slug, name: tenant.name, domain: tenant.domain },
    ...session,
  }, 200, request, env);
}

export async function handleGoogleCustomerPreregistration(request, env) {
  if (!env.DB) return json({ error: '데이터베이스 연결이 설정되지 않았습니다.' }, 503, request, env);
  const origin = request.headers.get('origin');
  if (origin && !isAllowedOrigin(origin, env)) return json({ error: '허용되지 않은 요청입니다.' }, 403, request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin, env) });
  await ensureSchema(env.DB);

  const path = new URL(request.url).pathname;
  const preregisterMatch = path.match(/^\/api\/customers\/tenants\/([a-z0-9-]+)\/pre-register$/);
  if (request.method === 'POST' && preregisterMatch) {
    const slug = normalizeTenant(preregisterMatch[1]);
    if (!slug) return json({ error: '등록된 고객사가 아닙니다.' }, 404, request, env);
    return preregister(request, env, slug);
  }
  if (request.method === 'POST' && path === '/api/customer/federated-login') return federatedLogin(request, env);
  return null;
}
