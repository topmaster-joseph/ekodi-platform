import authWorker, { isAllowedOrigin } from './auth-worker.js';

const TENANTS = Object.freeze([
  { slug: 'cgma', name: '청계면상인회', domain: 'cgma.ekodi.kr', realm: 'cgma-client' },
  { slug: 'jadam', name: '자담치킨 목포대점', domain: 'jadam.ekodi.kr', realm: 'jadam-client' },
  { slug: 'pizzamaru', name: '피자마루 목포대점', domain: 'pizzamaru.ekodi.kr', realm: 'pizzamaru-client' },
  { slug: 'yogurt', name: '요거트퍼플 목포대점', domain: 'yogurt.ekodi.kr', realm: 'yogurt-client' },
]);

const TENANT_REALMS = Object.freeze(Object.fromEntries(TENANTS.map(item => [item.slug, item.realm])));
const ROLE_SET = new Set([
  'store_owner',
  'marketing_manager',
  'hq_manager',
  'accounting_manager',
  'client_admin',
  'client_editor',
  'client_viewer',
]);

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
    'access-control-allow-methods': 'GET, POST, OPTIONS',
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
    db.prepare('CREATE INDEX IF NOT EXISTS idx_customer_access_grants_email ON customer_access_grants(email)'),
  ]);

  const now = new Date().toISOString();
  const seed = db.prepare(`INSERT OR IGNORE INTO customer_tenants (slug, name, domain, status, created_at)
    VALUES (?, ?, ?, 'active', ?)`);
  await db.batch(TENANTS.map(tenant => seed.bind(tenant.slug, tenant.name, tenant.domain, now)));
  await db.prepare("UPDATE customer_tenants SET domain = 'yogurt.ekodi.kr' WHERE slug = 'yogurt' AND domain <> 'yogurt.ekodi.kr'").run();

  try {
    await db.prepare(`INSERT OR IGNORE INTO customer_access_grants
      (tenant_id, email, role, enabled, created_at, last_verified_at)
      SELECT m.tenant_id, lower(trim(u.email)), m.role,
        CASE WHEN u.status = 'active' AND m.status <> 'disabled' THEN 1 ELSE 0 END,
        m.created_at, u.last_login_at
      FROM customer_memberships m
      JOIN customer_users u ON u.id = m.user_id
      WHERE trim(u.email) <> ''`).run();
  } catch {
    // Legacy tables may not exist in isolated tests. The migration performs this backfill in production.
  }
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

async function tenantBySlug(db, slug) {
  return db.prepare('SELECT id, slug, name, domain, status FROM customer_tenants WHERE slug = ?').bind(slug).first();
}

async function preregister(request, env, slug) {
  const session = await adminSession(request, env);
  if (!session) return json({ error: 'EKODI 관리자 인증이 필요합니다.' }, 401, request, env);
  const tenant = await tenantBySlug(env.DB, slug);
  if (!tenant || tenant.status !== 'active') return json({ error: '등록된 고객사가 아닙니다.' }, 404, request, env);

  const body = await readJson(request);
  const email = normalizeEmail(body?.email);
  const role = normalizeRole(body?.role || 'store_owner');
  if (!validEmail(email) || !role) return json({ error: '고객 이메일 또는 권한을 확인해 주세요.' }, 400, request, env);

  const existing = await env.DB.prepare(`SELECT role, enabled, last_verified_at
    FROM customer_access_grants WHERE tenant_id = ? AND email = ?`).bind(tenant.id, email).first();
  const createdBy = await adminId(env.DB, session);
  const now = new Date().toISOString();

  await env.DB.prepare(`INSERT INTO customer_access_grants
      (tenant_id, email, role, enabled, created_at, created_by, last_verified_at)
    VALUES (?, ?, ?, 1, ?, ?, NULL)
    ON CONFLICT(tenant_id, email) DO UPDATE SET
      role = excluded.role,
      enabled = 1,
      created_by = excluded.created_by`)
    .bind(tenant.id, email, role, now, createdBy).run();

  await writeAdminAudit(env.DB, session, 'customer.access.upsert', tenant.domain, JSON.stringify({ email, role }));

  return json({
    ok: true,
    account: {
      email,
      role,
      status: existing?.last_verified_at ? 'active' : 'pre_registered',
      tenant: tenant.slug,
      loginUrl: `https://auth.ekodi.kr/?site=${TENANT_REALMS[slug]}`,
    },
  }, existing ? 200 : 201, request, env);
}

async function listAccessUsers(request, env, slug) {
  const session = await adminSession(request, env);
  if (!session) return json({ error: 'EKODI 관리자 인증이 필요합니다.' }, 401, request, env);
  const tenant = await tenantBySlug(env.DB, slug);
  if (!tenant) return json({ error: '등록된 고객사가 아닙니다.' }, 404, request, env);

  const rows = await env.DB.prepare(`SELECT
      a.email, a.role, a.enabled, a.created_at, a.last_verified_at,
      COALESCE(u.display_name, '') AS display_name,
      COALESCE(u.last_login_at, '') AS user_last_login_at
    FROM customer_access_grants a
    LEFT JOIN customer_users u ON lower(trim(u.email)) = a.email
    WHERE a.tenant_id = ?
    ORDER BY a.email`).bind(tenant.id).all();

  const users = rows.results.map(row => ({
    email: row.email,
    displayName: row.display_name || '',
    role: row.role,
    status: Number(row.enabled) !== 1 ? 'disabled' : (row.last_verified_at ? 'active' : 'pre_registered'),
    userStatus: Number(row.enabled) === 1 ? 'active' : 'disabled',
    lastLoginAt: row.last_verified_at || row.user_last_login_at || '',
    createdAt: row.created_at,
  }));

  return json({ tenant: { slug: tenant.slug, name: tenant.name, domain: tenant.domain }, users }, 200, request, env);
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

  const usersMatch = path.match(/^\/api\/customers\/tenants\/([a-z0-9-]+)\/users$/);
  if (request.method === 'GET' && usersMatch) {
    const slug = normalizeTenant(usersMatch[1]);
    if (!slug) return json({ error: '등록된 고객사가 아닙니다.' }, 404, request, env);
    return listAccessUsers(request, env, slug);
  }

  return null;
}
