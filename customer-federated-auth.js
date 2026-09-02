import { isAllowedOrigin } from './auth-worker.js';

const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const SESSION_HOURS = 12;
const ITERATIONS = 310000;
const encoder = new TextEncoder();

const TENANTS = Object.freeze([
  { slug: 'cgma', name: '청계면상인회', domain: 'cgma.ekodi.kr' },
  { slug: 'jadam', name: '자담치킨 목포대점', domain: 'jadam.ekodi.kr' },
  { slug: 'pizzamaru', name: '피자마루 목포대점', domain: 'pizzamaru.ekodi.kr' },
  { slug: 'yogurt', name: '요거트퍼플 목포대점', domain: 'yogurt.ekodi.kr' },
]);
const TENANT_SET = new Set(TENANTS.map(item => item.slug));

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
  const digest = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, material, 256);
  return { salt: bytesToHex(salt), digest: bytesToHex(digest) };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeTenant(value) {
  const tenant = String(value || '').trim().toLowerCase();
  return TENANT_SET.has(tenant) ? tenant : '';
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
      created_at TEXT NOT NULL,
      workspace_id TEXT,
      workspace_type TEXT,
      workspace_subtype TEXT,
      public_namespace TEXT,
      namespace_claimed_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS customer_access_grants (
      tenant_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      created_by INTEGER,
      last_verified_at TEXT,
      PRIMARY KEY (tenant_id, email),
      FOREIGN KEY(tenant_id) REFERENCES customer_tenants(id)
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
    db.prepare('CREATE INDEX IF NOT EXISTS idx_customer_access_grants_email ON customer_access_grants(email)'),
  ]);

  const now = new Date().toISOString();
  const seed = db.prepare(`INSERT OR IGNORE INTO customer_tenants (slug, name, domain, status, created_at)
    VALUES (?, ?, ?, 'active', ?)`);
  await db.batch(TENANTS.map(tenant => seed.bind(tenant.slug, tenant.name, tenant.domain, now)));
  await db.prepare("UPDATE customer_tenants SET domain = 'yogurt.ekodi.kr' WHERE slug = 'yogurt' AND domain <> 'yogurt.ekodi.kr'").run();
}

async function issueSession(db, userId, tenantId) {
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000);
  await db.prepare('DELETE FROM customer_sessions WHERE expires_at <= ?').bind(now.toISOString()).run();
  await db.prepare(`INSERT INTO customer_sessions (token_hash, user_id, tenant_id, expires_at, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?)`).bind(tokenHash, userId, tenantId, expiresAt.toISOString(), now.toISOString(), now.toISOString()).run();
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

async function ensureRuntimeIdentity(db, tenant, identity, grant) {
  const now = new Date().toISOString();
  let user = await db.prepare('SELECT id, email, display_name, status FROM customer_users WHERE email = ?').bind(identity.email).first();

  if (!user) {
    const credential = await randomPasswordRecord();
    const result = await db.prepare(`INSERT INTO customer_users
      (email, display_name, password_hash, password_salt, password_iterations, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?)`)
      .bind(identity.email, identity.displayName, credential.digest, credential.salt, ITERATIONS, now).run();
    user = { id: result.meta.last_row_id, email: identity.email, display_name: identity.displayName, status: 'active' };
  }

  if (user.status !== 'active') return null;

  await db.prepare(`INSERT INTO customer_memberships (tenant_id, user_id, role, status, created_at)
    VALUES (?, ?, ?, 'active', ?)
    ON CONFLICT(tenant_id, user_id) DO UPDATE SET role = excluded.role, status = 'active'`)
    .bind(tenant.id, user.id, grant.role, now).run();

  await db.prepare(`UPDATE customer_users
    SET last_login_at = ?, display_name = CASE WHEN display_name = '' THEN ? ELSE display_name END
    WHERE id = ?`).bind(now, identity.displayName, user.id).run();

  await db.prepare(`UPDATE customer_access_grants
    SET last_verified_at = ?
    WHERE tenant_id = ? AND email = ?`).bind(now, tenant.id, identity.email).run();

  return { ...user, display_name: user.display_name || identity.displayName, verifiedAt: now };
}

async function federatedLogin(request, env) {
  const body = await readJson(request);
  const tenantSlug = normalizeTenant(body?.tenant);
  const identity = await supabaseUser(String(body?.accessToken || ''));
  if (!tenantSlug || !identity) return json({ error: '통합인증 세션을 확인해 주세요.' }, 401, request, env);

  const tenant = await env.DB.prepare('SELECT id, slug, name, domain, status, workspace_id, workspace_type, workspace_subtype, public_namespace FROM customer_tenants WHERE slug = ?').bind(tenantSlug).first();
  if (!tenant || tenant.status !== 'active') return json({ error: '등록된 고객사가 아닙니다.' }, 404, request, env);

  const grant = await env.DB.prepare(`SELECT email, role, enabled, last_verified_at
    FROM customer_access_grants
    WHERE tenant_id = ? AND email = ?`).bind(tenant.id, identity.email).first();

  if (!grant || Number(grant.enabled) !== 1) {
    return json({ error: '이 Google 계정은 해당 고객 관리공간에 등록되어 있지 않습니다.' }, 403, request, env);
  }

  const user = await ensureRuntimeIdentity(env.DB, tenant, identity, grant);
  if (!user) return json({ error: '비활성화된 고객 계정입니다.' }, 403, request, env);

  const session = await issueSession(env.DB, user.id, tenant.id);
  await env.DB.prepare(`INSERT INTO customer_audit_logs (tenant_id, user_id, action, resource, detail, created_at)
    VALUES (?, ?, 'session.central_login', 'customer-portal', ?, ?)`)
    .bind(tenant.id, user.id, identity.id, user.verifiedAt).run();

  return json({
    ok: true,
    email: identity.email,
    displayName: user.display_name || identity.displayName,
    role: grant.role,
    tenant: {
      slug: tenant.slug, name: tenant.name, domain: tenant.domain,
      workspaceId: tenant.workspace_id || '', workspaceType: tenant.workspace_type || '', workspaceSubtype: tenant.workspace_subtype || '',
      publicNamespace: tenant.public_namespace || '', canonicalUrl: tenant.public_namespace ? `https://ekodi.kr/${tenant.public_namespace}` : `https://${tenant.domain}`,
    },
    ...session,
  }, 200, request, env);
}

export async function handleFederatedCustomerAuth(request, env) {
  if (!env.DB) return json({ error: '데이터베이스 연결이 설정되지 않았습니다.' }, 503, request, env);
  const origin = request.headers.get('origin');
  if (origin && !isAllowedOrigin(origin, env)) return json({ error: '허용되지 않은 요청입니다.' }, 403, request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin, env) });
  await ensureSchema(env.DB);
  const path = new URL(request.url).pathname;
  if (request.method === 'POST' && path === '/api/customer/federated-login') return federatedLogin(request, env);
  if (request.method === 'POST' && path === '/api/customer/accept-central-invite') {
    return json({
      error: '초대 링크 방식은 종료되었습니다. 관리자가 고객 Google 이메일과 권한을 등록한 뒤 Google 인증으로 로그인해 주세요.',
      code: 'GOOGLE_ACCESS_GRANT_REQUIRED',
    }, 410, request, env);
  }
  return null;
}
