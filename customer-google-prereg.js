import authWorker, { isAllowedOrigin } from './auth-worker.js';
import { stringifyCapabilityList, validateAccessGrantInput, accessGrantExpired } from './access-governance.js';
import { accessGrantManagementDecision, resolveTenantAccessAuthority } from './tenant-access-authority.js';

const TENANTS = Object.freeze([
  { slug: 'ekodibiz', name: '에코디비즈', domain: 'ekodi.kr/ekodibiz', realm: 'ekodibiz-client' },
  { slug: 'ekodimall', name: '에코디몰', domain: 'ekodi.kr/ekodibiz/ekodimall', realm: 'ekodimall-client' },
  { slug: 'ekodibiz-trade', name: '에코디비즈 무역', domain: 'ekodi.kr/ekodibiz/trade', realm: 'ekodibiz-trade-client' },
  { slug: 'ekodichurch', name: '에코디교회', domain: 'ekodi.kr/ekodichurch', realm: 'ekodichurch-client' },
  { slug: 'ekodimission', name: '에코디선교회', domain: 'ekodi.kr/ekodimission', realm: 'ekodimission-client' },
  { slug: 'cgma', name: '청계면상인회', domain: 'cgma.ekodi.kr', realm: 'cgma-client' },
  { slug: 'cmpmyi', name: '통합 매장 운영', domain: 'ekodi.kr/cmpmyi', realm: 'cmpmyi-client' },
  { slug: 'jadam', name: '자담치킨 목포대점', domain: 'jadam.ekodi.kr', realm: 'jadam-client' },
  { slug: 'pizzamaru', name: '피자마루 목포대점', domain: 'pizzamaru.ekodi.kr', realm: 'pizzamaru-client' },
  { slug: 'yogurt', name: '요거트퍼플 목포대점', domain: 'yogurt.ekodi.kr', realm: 'yogurt-client' },
]);

const TENANT_REALMS = Object.freeze(Object.fromEntries(TENANTS.map(item => [item.slug, item.realm])));
const ROLE_LABELS = Object.freeze({
  owner: '사이트 책임관리자', admin: '사이트 관리자', manager: '운영책임자',
  marketer: '마케팅담당자', accountant: '회계담당자', staff: '실무담당자', member: '회원', viewer: '조회·검수자',
  tenant_admin: '사이트 책임관리자 · 호환', workspace_admin: '사이트 책임관리자 · 호환',
  store_owner: '점주/책임자', marketing_manager: '마케팅담당자', hq_manager: '본사담당자',
  accounting_manager: '회계담당자', senior_pastor: '담임목사/책임관리자', pastor: '목회자', care_staff: '돌봄담당자',
  external_developer: '외부개발자', client_admin: '점주/책임자 · 기존', client_editor: '마케팅담당자 · 기존', client_viewer: '조회·검수자 · 기존',
});
const ROLE_SET = new Set(Object.keys(ROLE_LABELS));

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeDisplayName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120);
}

function displayNameNote(value) {
  const displayName = normalizeDisplayName(value);
  return displayName ? `display-name:${displayName}` : '';
}

function normalizeTenant(value) {
  const tenant = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,79}$/.test(tenant) ? tenant : '';
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
      principal_type TEXT NOT NULL DEFAULT 'member',
      github_username TEXT NOT NULL DEFAULT '',
      capabilities_json TEXT NOT NULL DEFAULT '[]',
      denied_capabilities_json TEXT NOT NULL DEFAULT '[]',
      expires_at TEXT,
      note TEXT NOT NULL DEFAULT '',
      updated_at TEXT,
      updated_by INTEGER,
      PRIMARY KEY (tenant_id, email),
      FOREIGN KEY(tenant_id) REFERENCES customer_tenants(id)
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_customer_access_grants_email ON customer_access_grants(email)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS customer_access_grant_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      actor_email TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      before_json TEXT NOT NULL DEFAULT '{}',
      after_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES customer_tenants(id)
    )`),
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

async function writeGrantAudit(db, tenantId, email, session, action, before = {}, after = {}) {
  await db.prepare(`INSERT INTO customer_access_grant_audit
    (tenant_id, email, actor_email, action, before_json, after_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(tenantId, email, String(session?.email || '').toLowerCase(), action,
      JSON.stringify(before || {}).slice(0, 4000), JSON.stringify(after || {}).slice(0, 4000), new Date().toISOString()).run();
}

async function tenantBySlug(db, slug) {
  return db.prepare('SELECT id, slug, name, domain, status FROM customer_tenants WHERE slug = ?').bind(slug).first();
}

function accessStatus(row) {
  if (Number(row.enabled) !== 1) return 'disabled';
  if (accessGrantExpired(row)) return 'expired';
  return row.last_verified_at ? 'active' : 'pre_registered';
}

function publicAccessRow(row) {
  return {
    email: row.email,
    displayName: row.display_name || '',
    role: row.role,
    roleLabel: ROLE_LABELS[row.role] || row.role,
    principalType: row.principal_type || 'member',
    githubUsername: row.github_username || '',
    expiresAt: row.expires_at || '',
    status: accessStatus(row),
    userStatus: Number(row.enabled) === 1 && !accessGrantExpired(row) ? 'active' : 'disabled',
    lastLoginAt: row.last_verified_at || row.user_last_login_at || '',
    createdAt: row.created_at,
  };
}

async function preregister(request, env, slug) {
  const tenant = await tenantBySlug(env.DB, slug);
  if (!tenant || tenant.status !== 'active') return json({ error: '등록된 사이트가 아닙니다.' }, 404, request, env);
  const authority = await resolveTenantAccessAuthority(request, env, { tenantSlug: slug });
  if (!authority.ok) return json({ error: '이 사이트의 사용자·권한 관리 권한이 없습니다.', code: authority.code }, authority.status || 403, request, env);
  const session = { email: authority.email };

  const body = await readJson(request);
  const email = normalizeEmail(body?.email);
  const role = normalizeRole(body?.role || 'member');
  const displayName = normalizeDisplayName(body?.displayName);
  if (!validEmail(email) || !role) return json({ error: '고객 이메일 또는 권한을 확인해 주세요.' }, 400, request, env);

  const grantInput = validateAccessGrantInput({
    role,
    principalType: body?.principalType,
    githubUsername: body?.githubUsername,
    expiresAt: body?.expiresAt,
    capabilities: body?.capabilities,
    deniedCapabilities: body?.deniedCapabilities,
  });
  if (!grantInput.ok) {
    const messages = {
      GITHUB_USERNAME_REQUIRED: '외부개발자는 GitHub 사용자명이 필요합니다.',
      EXPIRY_REQUIRED: '외부개발자는 접근 만료일이 필요합니다.',
      INVALID_EXPIRY: '접근 만료일은 현재보다 이후여야 합니다.',
      EXPIRY_TOO_LONG: '외부개발자 접근기간은 최대 180일까지 설정할 수 있습니다.',
    };
    return json({ error: messages[grantInput.error] || '접근권한 설정을 확인해 주세요.', code: grantInput.error }, 400, request, env);
  }

  const existing = await env.DB.prepare(`SELECT role, enabled, last_verified_at, principal_type, github_username, capabilities_json,
      denied_capabilities_json, expires_at
    FROM customer_access_grants WHERE tenant_id = ? AND email = ?`).bind(tenant.id, email).first();
  const decision = accessGrantManagementDecision(authority, { email, role: existing?.role || '' }, { role });
  if (!decision.ok) return json({ error: '자기 자신 또는 책임관리자의 보호 권한은 사이트 관리자가 변경할 수 없습니다.', code: decision.code }, 403, request, env);
  const createdBy = await adminId(env.DB, session);
  const now = new Date().toISOString();
  const after = {
    role,
    enabled: 1,
    principal_type: grantInput.principalType,
    github_username: grantInput.githubUsername,
    capabilities_json: stringifyCapabilityList(grantInput.allowed),
    denied_capabilities_json: stringifyCapabilityList(grantInput.denied),
    expires_at: grantInput.expiresAt || null,
  };

  await env.DB.prepare(`INSERT INTO customer_access_grants
      (tenant_id, email, role, enabled, created_at, created_by, last_verified_at, principal_type, github_username,
       capabilities_json, denied_capabilities_json, expires_at, updated_at, updated_by)
    VALUES (?, ?, ?, 1, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, email) DO UPDATE SET
      role = excluded.role,
      enabled = 1,
      created_by = excluded.created_by,
      principal_type = excluded.principal_type,
      github_username = excluded.github_username,
      capabilities_json = excluded.capabilities_json,
      denied_capabilities_json = excluded.denied_capabilities_json,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by`)
    .bind(tenant.id, email, role, now, createdBy, grantInput.principalType, grantInput.githubUsername,
      stringifyCapabilityList(grantInput.allowed), stringifyCapabilityList(grantInput.denied), grantInput.expiresAt || null, now, createdBy).run();
  if (displayName) {
    await env.DB.prepare('UPDATE customer_access_grants SET note = ? WHERE tenant_id = ? AND email = ?')
      .bind(displayNameNote(displayName), tenant.id, email).run();
  }

  await writeGrantAudit(env.DB, tenant.id, email, session, existing ? 'grant.update' : 'grant.create', existing || {}, after);
  await writeAdminAudit(env.DB, session, 'customer.access.upsert', tenant.domain, JSON.stringify({ email, role, principalType: grantInput.principalType, expiresAt: grantInput.expiresAt || '' }));

  return json({
    ok: true,
    account: {
      email,
      displayName,
      role,
      principalType: grantInput.principalType,
      githubUsername: grantInput.githubUsername,
      expiresAt: grantInput.expiresAt || '',
      status: existing?.last_verified_at ? 'active' : 'pre_registered',
      tenant: tenant.slug,
      loginUrl: `https://auth.ekodi.kr/?site=${TENANT_REALMS[slug] || `${slug}-client`}`,
    },
  }, existing ? 200 : 201, request, env);
}

async function revokeAccess(request, env, slug) {
  const tenant = await tenantBySlug(env.DB, slug);
  if (!tenant) return json({ error: '등록된 사이트가 아닙니다.' }, 404, request, env);
  const authority = await resolveTenantAccessAuthority(request, env, { tenantSlug: slug });
  if (!authority.ok) return json({ error: '이 사이트의 사용자·권한 관리 권한이 없습니다.', code: authority.code }, authority.status || 403, request, env);
  const session = { email: authority.email };
  const body = await readJson(request);
  const email = normalizeEmail(body?.email);
  if (!validEmail(email)) return json({ error: '접근권한을 회수할 이메일을 확인해 주세요.' }, 400, request, env);
  const existing = await env.DB.prepare(`SELECT role, enabled, last_verified_at, principal_type, github_username, capabilities_json,
      denied_capabilities_json, expires_at FROM customer_access_grants WHERE tenant_id = ? AND email = ?`).bind(tenant.id, email).first();
  if (!existing) return json({ error: '등록된 접근권한을 찾을 수 없습니다.' }, 404, request, env);
  const decision = accessGrantManagementDecision(authority, { email, role: existing.role }, { role: existing.role });
  if (!decision.ok) return json({ error: '자기 자신 또는 책임관리자의 권한은 사이트 관리자가 중지할 수 없습니다.', code: decision.code }, 403, request, env);
  const updatedBy = await adminId(env.DB, session);
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE customer_access_grants SET enabled = 0, updated_at = ?, updated_by = ? WHERE tenant_id = ? AND email = ?`)
    .bind(now, updatedBy, tenant.id, email).run();
  await writeGrantAudit(env.DB, tenant.id, email, session, 'grant.revoke', existing, { ...existing, enabled: 0 });
  await writeAdminAudit(env.DB, session, 'customer.access.revoke', tenant.domain, JSON.stringify({ email, role: existing.role }));
  return json({ ok: true, email, tenant: tenant.slug, status: 'disabled' }, 200, request, env);
}

async function listAccessUsers(request, env, slug) {
  const tenant = await tenantBySlug(env.DB, slug);
  if (!tenant) return json({ error: '등록된 사이트가 아닙니다.' }, 404, request, env);
  const authority = await resolveTenantAccessAuthority(request, env, { tenantSlug: slug });
  if (!authority.ok) return json({ error: '이 사이트의 사용자·권한을 조회할 권한이 없습니다.', code: authority.code }, authority.status || 403, request, env);

  const rows = await env.DB.prepare(`SELECT
      a.email, a.role, a.enabled, a.created_at, a.last_verified_at, a.principal_type, a.github_username, a.expires_at,
      COALESCE(u.display_name, '') AS display_name,
      COALESCE(u.last_login_at, '') AS user_last_login_at
    FROM customer_access_grants a
    LEFT JOIN customer_users u ON lower(trim(u.email)) = a.email
    WHERE a.tenant_id = ?
    ORDER BY a.email`).bind(tenant.id).all();

  return json({ tenant: { slug: tenant.slug, name: tenant.name, domain: tenant.domain }, users: rows.results.map(publicAccessRow) }, 200, request, env);
}

async function listDirectory(request, env) {
  const session = await adminSession(request, env);
  if (!session) return json({ error: 'EKODI 관리자 인증이 필요합니다.' }, 401, request, env);

  const [tenantRows, memberRows] = await Promise.all([
    env.DB.prepare(`SELECT
        t.slug, t.name, t.domain, t.status,
        COUNT(a.email) AS members,
        SUM(CASE WHEN a.enabled = 1 AND (a.expires_at IS NULL OR a.expires_at > ?) AND a.last_verified_at IS NOT NULL THEN 1 ELSE 0 END) AS active_users,
        SUM(CASE WHEN a.enabled = 1 AND (a.expires_at IS NULL OR a.expires_at > ?) AND a.last_verified_at IS NULL THEN 1 ELSE 0 END) AS google_pending
      FROM customer_tenants t
      LEFT JOIN customer_access_grants a ON a.tenant_id = t.id
      GROUP BY t.id
      ORDER BY t.name`).bind(new Date().toISOString(), new Date().toISOString()).all(),
    env.DB.prepare(`SELECT
        a.email, a.role, a.enabled, a.created_at, a.last_verified_at, a.principal_type, a.github_username, a.expires_at,
        t.slug, t.name AS tenant_name, t.domain, t.status AS tenant_status,
        COALESCE(u.display_name, '') AS display_name,
        COALESCE(u.last_login_at, '') AS user_last_login_at
      FROM customer_access_grants a
      JOIN customer_tenants t ON t.id = a.tenant_id
      LEFT JOIN customer_users u ON lower(trim(u.email)) = a.email
      ORDER BY t.name, a.email`).all(),
  ]);

  const members = memberRows.results.map(row => ({
    ...publicAccessRow(row),
    tenant: {
      slug: row.slug,
      name: row.tenant_name,
      domain: row.domain,
      status: row.tenant_status,
    },
  }));

  const roleCounts = new Map();
  for (const member of members) roleCounts.set(member.role, (roleCounts.get(member.role) || 0) + 1);
  const roles = [...roleCounts.entries()]
    .map(([role, count]) => ({ role, label: ROLE_LABELS[role] || role, count }))
    .sort((left, right) => left.label.localeCompare(right.label, 'ko'));

  const tenants = tenantRows.results.map(row => ({
    slug: row.slug,
    name: row.name,
    domain: row.domain,
    status: row.status,
    members: Number(row.members || 0),
    activeUsers: Number(row.active_users || 0),
    googlePending: Number(row.google_pending || 0),
  }));

  return json({
    summary: {
      uniqueGoogleAccounts: new Set(members.map(member => member.email)).size,
      memberships: members.length,
      tenants: tenants.length,
      active: members.filter(member => member.status === 'active').length,
      pending: members.filter(member => member.status === 'pre_registered').length,
      externalCollaborators: members.filter(member => member.principalType === 'external_collaborator').length,
      expired: members.filter(member => member.status === 'expired').length,
    },
    tenants,
    roles,
    members,
  }, 200, request, env);
}

export async function handleGoogleCustomerPreregistration(request, env) {
  if (!env.DB) return json({ error: '데이터베이스 연결이 설정되지 않았습니다.' }, 503, request, env);
  const origin = request.headers.get('origin');
  if (origin && !isAllowedOrigin(origin, env)) return json({ error: '허용되지 않은 요청입니다.' }, 403, request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin, env) });
  await ensureSchema(env.DB);

  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === '/api/customers/directory') {
    return listDirectory(request, env);
  }

  const preregisterMatch = path.match(/^\/api\/customers\/tenants\/([a-z0-9-]+)\/pre-register$/);
  if (request.method === 'POST' && preregisterMatch) {
    const slug = normalizeTenant(preregisterMatch[1]);
    if (!slug) return json({ error: '등록된 고객사가 아닙니다.' }, 404, request, env);
    return preregister(request, env, slug);
  }

  const revokeMatch = path.match(/^\/api\/customers\/tenants\/([a-z0-9-]+)\/access\/revoke$/);
  if (request.method === 'POST' && revokeMatch) {
    const slug = normalizeTenant(revokeMatch[1]);
    if (!slug) return json({ error: '등록된 고객사가 아닙니다.' }, 404, request, env);
    return revokeAccess(request, env, slug);
  }

  const usersMatch = path.match(/^\/api\/customers\/tenants\/([a-z0-9-]+)\/users$/);
  if (request.method === 'GET' && usersMatch) {
    const slug = normalizeTenant(usersMatch[1]);
    if (!slug) return json({ error: '등록된 고객사가 아닙니다.' }, 404, request, env);
    return listAccessUsers(request, env, slug);
  }

  return null;
}
