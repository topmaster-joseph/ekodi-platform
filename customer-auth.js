import authWorker, { isAllowedOrigin } from './auth-worker.js';
import { isReservedPublicNamespace, isValidPublicNamespace, normalizePublicNamespace, publicNamespaceForLegacyTenantSlug, suggestPublicNamespaces, workspaceForLegacyTenantSlug } from './workspace-public-namespace.js';

const ITERATIONS = 310000;
const SESSION_HOURS = 12;
const INVITE_HOURS = 72;
const encoder = new TextEncoder();

export const CUSTOMER_TENANTS = Object.freeze([
  { slug: 'cgma', name: '청계면상인회', domain: 'cgma.ekodi.kr' },
  { slug: 'jadam', name: '자담치킨 목포대점', domain: 'jadam.ekodi.kr' },
  { slug: 'pizzamaru', name: '피자마루 목포대점', domain: 'pizzamaru.ekodi.kr' },
  { slug: 'yogurt', name: '요거트퍼플 목포대점', domain: 'yogurt.ekodi.kr' },
]);

const ROLE_SET = new Set(['client_admin', 'client_editor', 'client_viewer']);
const TENANT_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

function saltBytes(saltHex) {
  const normalized = String(saltHex || '').trim();
  if (!/^(?:[a-f0-9]{2}){16,64}$/i.test(normalized)) return null;
  return Uint8Array.from(normalized.match(/.{2}/g), byte => parseInt(byte, 16));
}

async function passwordHash(password, saltHex) {
  const salt = saltBytes(saltHex);
  if (!salt || typeof password !== 'string') return null;
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return bytesToHex(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    material,
    256
  ));
}

function secureEqual(left, right) {
  left = String(left || '');
  right = String(right || '');
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeTenantSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  return TENANT_SLUG_RE.test(slug) ? slug : '';
}

export function normalizeCustomerRole(value) {
  const role = String(value || '').trim().toLowerCase();
  return ROLE_SET.has(role) ? role : '';
}

function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cors(origin, env) {
  const headers = {
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  if (origin && isAllowedOrigin(origin, env)) headers['access-control-allow-origin'] = origin;
  return headers;
}

function customerJson(data, status, request, env) {
  const origin = request.headers.get('origin');
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...cors(origin, env),
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
    db.prepare(`CREATE TABLE IF NOT EXISTS workspace_namespace_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      public_namespace TEXT NOT NULL COLLATE NOCASE,
      status TEXT NOT NULL DEFAULT 'active',
      valid_from TEXT NOT NULL,
      valid_to TEXT,
      UNIQUE(workspace_id, public_namespace, valid_from)
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
      PRIMARY KEY (tenant_id, user_id),
      FOREIGN KEY(tenant_id) REFERENCES customer_tenants(id),
      FOREIGN KEY(user_id) REFERENCES customer_users(id)
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
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES customer_tenants(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS customer_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      tenant_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES customer_users(id),
      FOREIGN KEY(tenant_id) REFERENCES customer_tenants(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS customer_login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER,
      ip_hash TEXT NOT NULL,
      attempted_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS customer_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      user_id INTEGER,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES customer_tenants(id),
      FOREIGN KEY(user_id) REFERENCES customer_users(id)
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_customer_memberships_user ON customer_memberships(user_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_customer_invites_tenant ON customer_invites(tenant_id, created_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_customer_sessions_user ON customer_sessions(user_id, tenant_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_customer_login_attempts_time ON customer_login_attempts(attempted_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_customer_audit_tenant_time ON customer_audit_logs(tenant_id, created_at DESC)'),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_tenants_workspace_id ON customer_tenants(workspace_id)
      WHERE workspace_id IS NOT NULL AND trim(workspace_id) <> ''`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_tenants_public_namespace ON customer_tenants(public_namespace COLLATE NOCASE)
      WHERE public_namespace IS NOT NULL AND trim(public_namespace) <> ''`),
  ]);
  const seed = db.prepare(`INSERT OR IGNORE INTO customer_tenants (slug, name, domain, status, created_at)
    VALUES (?, ?, ?, 'active', ?)`);
  const now = new Date().toISOString();
  await db.batch(CUSTOMER_TENANTS.map(tenant => seed.bind(tenant.slug, tenant.name, tenant.domain, now)));
  const namespaceUpdate = db.prepare(`UPDATE customer_tenants SET workspace_id=?, workspace_type=?, workspace_subtype=?, public_namespace=?, namespace_claimed_at=COALESCE(namespace_claimed_at, created_at)
    WHERE slug=? AND (public_namespace IS NULL OR trim(public_namespace)='')`);
  const namespaceUpdates = CUSTOMER_TENANTS.map(tenant => {
    const workspace = workspaceForLegacyTenantSlug(tenant.slug);
    return workspace ? namespaceUpdate.bind(workspace.workspaceId, workspace.workspaceType, workspace.workspaceSubtype, publicNamespaceForLegacyTenantSlug(tenant.slug) || tenant.slug, tenant.slug) : null;
  }).filter(Boolean);
  if (namespaceUpdates.length) await db.batch(namespaceUpdates);
}

const TENANT_FIELDS = 'id, slug, name, domain, status, workspace_id, workspace_type, workspace_subtype, public_namespace, namespace_claimed_at';

async function tenantBySlug(db, slug) {
  return db.prepare(`SELECT ${TENANT_FIELDS} FROM customer_tenants WHERE slug = ?`).bind(slug).first();
}

async function tenantByPublicNamespace(db, namespace) {
  return db.prepare(`SELECT ${TENANT_FIELDS} FROM customer_tenants WHERE public_namespace = ? COLLATE NOCASE`).bind(namespace).first();
}

function publicTenant(row) {
  const namespace = row.public_namespace || '';
  return {
    slug: row.slug, name: row.name, domain: row.domain,
    workspaceId: row.workspace_id || '', workspaceType: row.workspace_type || '', workspaceSubtype: row.workspace_subtype || '',
    publicNamespace: namespace, canonicalPath: namespace ? `/${namespace}` : '', canonicalUrl: namespace ? `https://ekodi.kr/${namespace}` : '',
  };
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
  await db.prepare(`INSERT INTO audit_logs (admin_id, action, resource, detail, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, action, resource, String(detail).slice(0, 500), new Date().toISOString()).run();
}

async function writeCustomerAudit(db, tenantId, userId, action, resource, detail = '') {
  await db.prepare(`INSERT INTO customer_audit_logs (tenant_id, user_id, action, resource, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(tenantId, userId || null, action, resource, String(detail).slice(0, 500), new Date().toISOString()).run();
}

async function issueCustomerSession(db, userId, tenantId) {
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

async function customerSession(request, db) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  const tokenHash = await sha256(authorization.slice(7));
  const now = new Date().toISOString();
  const row = await db.prepare(`SELECT
      customer_users.id AS user_id, customer_users.email, customer_users.display_name,
      customer_users.status AS user_status, customer_tenants.id AS tenant_id,
      customer_tenants.slug, customer_tenants.name AS tenant_name, customer_tenants.domain,
      customer_tenants.workspace_id, customer_tenants.workspace_type, customer_tenants.workspace_subtype, customer_tenants.public_namespace,
      customer_tenants.status AS tenant_status, customer_memberships.role,
      customer_memberships.status AS membership_status, customer_sessions.expires_at
    FROM customer_sessions
    JOIN customer_users ON customer_users.id = customer_sessions.user_id
    JOIN customer_tenants ON customer_tenants.id = customer_sessions.tenant_id
    JOIN customer_memberships ON customer_memberships.user_id = customer_users.id
      AND customer_memberships.tenant_id = customer_tenants.id
    WHERE customer_sessions.token_hash = ? AND customer_sessions.expires_at > ?`)
    .bind(tokenHash, now).first();
  if (!row || row.user_status !== 'active' || row.tenant_status !== 'active' || row.membership_status !== 'active') return null;
  await db.prepare('UPDATE customer_sessions SET last_seen_at = ? WHERE token_hash = ?').bind(now, tokenHash).run();
  return { ...row, tokenHash };
}

function publicSession(row) {
  return {
    email: row.email,
    displayName: row.display_name || '',
    tenant: publicTenant({ ...row, name: row.tenant_name }),
    role: row.role,
    expiresAt: row.expires_at,
  };
}

async function enforceLoginRateLimit(request, db, tenantId) {
  const ipHash = await sha256(request.headers.get('cf-connecting-ip') || 'unknown');
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await db.prepare('DELETE FROM customer_login_attempts WHERE attempted_at <= ?').bind(cutoff).run();
  const result = await db.prepare(`SELECT COUNT(*) AS count FROM customer_login_attempts
    WHERE tenant_id = ? AND ip_hash = ? AND attempted_at > ?`).bind(tenantId, ipHash, cutoff).first();
  return { blocked: Number(result.count) >= 8, ipHash };
}

async function handlePublic(request, env, path) {
  const db = env.DB;
  const url = new URL(request.url);
  if (request.method === 'GET' && path === '/api/customer/namespace') {
    const requested = normalizePublicNamespace(url.searchParams.get('name'));
    const rows = await db.prepare(`SELECT public_namespace FROM customer_tenants WHERE public_namespace IS NOT NULL AND trim(public_namespace) <> ''`).all();
    const taken = (rows.results || []).map(row => row.public_namespace);
    const reserved = isReservedPublicNamespace(requested);
    const valid = isValidPublicNamespace(requested);
    const occupied = taken.some(value => String(value).toLowerCase() === requested);
    const available = valid && !occupied;
    const suggestions = available ? [] : suggestPublicNamespaces(requested, taken, {
      region: url.searchParams.get('region') || '', brand: url.searchParams.get('brand') || '', subtype: url.searchParams.get('subtype') || '',
    });
    return customerJson({ requested, available, reserved, occupied, reason: reserved ? 'reserved' : !valid ? 'invalid' : occupied ? 'claimed' : 'available', suggestions }, 200, request, env);
  }
  if (request.method === 'GET' && path === '/api/customer/tenant') {
    const slug = normalizeTenantSlug(url.searchParams.get('slug'));
    const namespace = normalizePublicNamespace(url.searchParams.get('namespace'));
    const hostname = String(url.searchParams.get('hostname') || '').trim().toLowerCase();
    const tenant = namespace ? await tenantByPublicNamespace(db, namespace) : slug ? await tenantBySlug(db, slug)
      : await db.prepare(`SELECT ${TENANT_FIELDS} FROM customer_tenants WHERE domain = ?`).bind(hostname).first();
    if (!tenant || tenant.status !== 'active') return customerJson({ error: '등록된 고객사가 아닙니다.' }, 404, request, env);
    return customerJson({ tenant: publicTenant(tenant) }, 200, request, env);
  }

  if (request.method === 'POST' && path === '/api/customer/login') {
    const body = await readJson(request);
    const slug = normalizeTenantSlug(body?.tenant);
    const email = normalizeEmail(body?.email);
    if (!slug || !validEmail(email) || typeof body?.password !== 'string') return customerJson({ error: '고객사, 이메일, 비밀번호를 확인해 주세요.' }, 400, request, env);
    const tenant = await tenantBySlug(db, slug);
    if (!tenant || tenant.status !== 'active') return customerJson({ error: '등록된 고객사가 아닙니다.' }, 404, request, env);
    const limit = await enforceLoginRateLimit(request, db, tenant.id);
    if (limit.blocked) return customerJson({ error: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해 주세요.' }, 429, request, env);
    const user = await db.prepare(`SELECT customer_users.*, customer_memberships.role,
        customer_memberships.status AS membership_status
      FROM customer_users JOIN customer_memberships ON customer_memberships.user_id = customer_users.id
      WHERE customer_users.email = ? AND customer_memberships.tenant_id = ?`).bind(email, tenant.id).first();
    const digest = user ? await passwordHash(body.password, user.password_salt) : '';
    if (!user || user.status !== 'active' || user.membership_status !== 'active' || !secureEqual(digest, user.password_hash)) {
      await db.prepare('INSERT INTO customer_login_attempts (tenant_id, ip_hash, attempted_at) VALUES (?, ?, ?)')
        .bind(tenant.id, limit.ipHash, new Date().toISOString()).run();
      return customerJson({ error: '고객 로그인 정보를 확인해 주세요.' }, 401, request, env);
    }
    await db.prepare('DELETE FROM customer_login_attempts WHERE tenant_id = ? AND ip_hash = ?').bind(tenant.id, limit.ipHash).run();
    const session = await issueCustomerSession(db, user.id, tenant.id);
    await db.prepare('UPDATE customer_users SET last_login_at = ? WHERE id = ?').bind(new Date().toISOString(), user.id).run();
    await writeCustomerAudit(db, tenant.id, user.id, 'session.login', 'customer-portal');
    return customerJson({ ok: true, email: user.email, displayName: user.display_name || '', role: user.role,
      tenant: publicTenant(tenant), ...session }, 200, request, env);
  }

  if (request.method === 'POST' && path === '/api/customer/accept-invite') {
    const body = await readJson(request);
    const rawToken = String(body?.token || '').trim();
    const displayName = String(body?.displayName || '').trim().slice(0, 100);
    const password = body?.password;
    if (!/^[a-f0-9]{64}$/i.test(rawToken) || typeof password !== 'string' || password.length < 12) return customerJson({ error: '초대 링크와 12자 이상의 비밀번호를 확인해 주세요.' }, 400, request, env);
    const tokenHash = await sha256(rawToken);
    const invite = await db.prepare(`SELECT customer_invites.*, customer_tenants.slug,
        customer_tenants.name AS tenant_name, customer_tenants.domain, customer_tenants.status AS tenant_status,
        customer_tenants.workspace_id, customer_tenants.workspace_type, customer_tenants.workspace_subtype, customer_tenants.public_namespace
      FROM customer_invites JOIN customer_tenants ON customer_tenants.id = customer_invites.tenant_id
      WHERE customer_invites.token_hash = ?`).bind(tokenHash).first();
    const now = new Date().toISOString();
    if (!invite || invite.revoked_at || invite.accepted_at || invite.expires_at <= now || invite.tenant_status !== 'active') return customerJson({ error: '초대가 만료되었거나 사용할 수 없습니다.' }, 410, request, env);
    let user = await db.prepare('SELECT * FROM customer_users WHERE email = ?').bind(invite.email).first();
    if (user) {
      const digest = await passwordHash(password, user.password_salt);
      if (!secureEqual(digest, user.password_hash)) return customerJson({ error: '이미 등록된 이메일입니다. 기존 고객 비밀번호를 입력해 주세요.' }, 401, request, env);
    } else {
      const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
      const digest = await passwordHash(password, salt);
      const result = await db.prepare(`INSERT INTO customer_users
        (email, display_name, password_hash, password_salt, password_iterations, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'active', ?)`).bind(invite.email, displayName, digest, salt, ITERATIONS, now).run();
      user = { id: result.meta.last_row_id, email: invite.email, display_name: displayName };
    }
    await db.prepare(`INSERT INTO customer_memberships (tenant_id, user_id, role, status, created_at)
      VALUES (?, ?, ?, 'active', ?)
      ON CONFLICT(tenant_id, user_id) DO UPDATE SET role = excluded.role, status = 'active'`)
      .bind(invite.tenant_id, user.id, invite.role, now).run();
    await db.prepare('UPDATE customer_invites SET accepted_at = ? WHERE id = ?').bind(now, invite.id).run();
    const session = await issueCustomerSession(db, user.id, invite.tenant_id);
    await db.prepare('UPDATE customer_users SET last_login_at = ? WHERE id = ?').bind(now, user.id).run();
    await writeCustomerAudit(db, invite.tenant_id, user.id, 'invite.accept', 'customer-portal', invite.role);
    return customerJson({ ok: true, email: invite.email, displayName: user.display_name || displayName, role: invite.role,
      tenant: publicTenant({ ...invite, name: invite.tenant_name }), ...session }, 201, request, env);
  }

  if (request.method === 'GET' && path === '/api/customer/session') {
    const session = await customerSession(request, db);
    if (!session) return customerJson({ error: '고객 인증이 필요합니다.' }, 401, request, env);
    return customerJson(publicSession(session), 200, request, env);
  }

  if (request.method === 'POST' && path === '/api/customer/logout') {
    const session = await customerSession(request, db);
    if (session) {
      await db.prepare('DELETE FROM customer_sessions WHERE token_hash = ?').bind(session.tokenHash).run();
      await writeCustomerAudit(db, session.tenant_id, session.user_id, 'session.logout', 'customer-portal');
    }
    return customerJson({ ok: true }, 200, request, env);
  }
  return null;
}

async function handleAdmin(request, env, path) {
  const db = env.DB;
  const session = await adminSession(request, env);
  if (!session) return customerJson({ error: 'EKODI 관리자 인증이 필요합니다.' }, 401, request, env);
  if (request.method === 'GET' && path === '/api/customers/tenants') {
    const tenants = await db.prepare(`SELECT t.id, t.slug, t.name, t.domain, t.status,
        t.workspace_id, t.workspace_type, t.workspace_subtype, t.public_namespace, t.namespace_claimed_at,
        COUNT(DISTINCT CASE WHEN m.status = 'active' THEN m.user_id END) AS active_users,
        COUNT(DISTINCT CASE WHEN i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ? THEN i.id END) AS pending_invites
      FROM customer_tenants t LEFT JOIN customer_memberships m ON m.tenant_id = t.id
      LEFT JOIN customer_invites i ON i.tenant_id = t.id
      GROUP BY t.id ORDER BY t.name`).bind(new Date().toISOString()).all();
    return customerJson({ tenants: tenants.results.map(row => ({ ...publicTenant(row),
      status: row.status, namespaceClaimedAt: row.namespace_claimed_at || '', activeUsers: Number(row.active_users || 0), pendingInvites: Number(row.pending_invites || 0) })) }, 200, request, env);
  }

  if (request.method === 'POST' && path === '/api/customers/namespaces/claim') {
    const body = await readJson(request);
    const slug = normalizeTenantSlug(body?.tenant);
    const namespace = normalizePublicNamespace(body?.namespace);
    const tenant = slug && await tenantBySlug(db, slug);
    if (!tenant) return customerJson({ error: '등록된 고객사가 아닙니다.' }, 404, request, env);
    if (tenant.public_namespace && tenant.public_namespace === namespace) return customerJson({ ok: true, tenant: publicTenant(tenant), idempotent: true }, 200, request, env);
    if (tenant.public_namespace && tenant.public_namespace !== namespace) {
      return customerJson({ error: '이미 배정된 공개 주소명은 일반 선점 요청으로 변경할 수 없습니다.', code: 'NAMESPACE_RENAME_REQUIRES_MIGRATION', tenant: publicTenant(tenant) }, 409, request, env);
    }
    const takenRows = await db.prepare(`SELECT public_namespace FROM customer_tenants WHERE id <> ? AND public_namespace IS NOT NULL`).bind(tenant.id).all();
    const taken = (takenRows.results || []).map(row => row.public_namespace);
    if (!isValidPublicNamespace(namespace) || taken.some(value => String(value).toLowerCase() === namespace)) {
      return customerJson({ error: '사용할 수 없는 EKODI 주소명입니다.', namespace,
        reason: isReservedPublicNamespace(namespace) ? 'reserved' : 'claimed_or_invalid',
        suggestions: suggestPublicNamespaces(namespace, taken, { region: body?.region || '', brand: body?.brand || '', subtype: tenant.workspace_subtype || body?.subtype || '' }) }, 409, request, env);
    }
    const now = new Date().toISOString();
    const workspaceId = tenant.workspace_id || `ws_${crypto.randomUUID().replace(/-/g, '')}`;
    try {
      await db.prepare(`UPDATE customer_tenants SET public_namespace=?, namespace_claimed_at=?, workspace_id=?, workspace_type=COALESCE(NULLIF(workspace_type,''),'organization') WHERE id=?`)
        .bind(namespace, now, workspaceId, tenant.id).run();
      await db.prepare(`INSERT OR IGNORE INTO workspace_namespace_history (workspace_id, public_namespace, status, valid_from) VALUES (?, ?, 'active', ?)`)
        .bind(workspaceId, namespace, now).run();
    } catch {
      return customerJson({ error: '다른 공간이 방금 이 주소명을 선점했습니다.', namespace,
        suggestions: suggestPublicNamespaces(namespace, [...taken, namespace], { subtype: tenant.workspace_subtype || '' }) }, 409, request, env);
    }
    await writeAdminAudit(db, session, 'workspace.namespace.claim', namespace, JSON.stringify({ tenant: tenant.slug, workspaceId }));
    const updated = await tenantBySlug(db, slug);
    return customerJson({ ok: true, tenant: publicTenant(updated) }, 200, request, env);
  }

  const usersMatch = path.match(/^\/api\/customers\/tenants\/([a-z0-9-]+)\/users$/);
  if (usersMatch && request.method === 'GET') {
    const slug = normalizeTenantSlug(usersMatch[1]);
    const tenant = slug && await tenantBySlug(db, slug);
    if (!tenant) return customerJson({ error: '등록된 고객사가 아닙니다.' }, 404, request, env);
    const users = await db.prepare(`SELECT u.email, u.display_name, u.status AS user_status, u.last_login_at,
        m.role, m.status AS membership_status, m.created_at
      FROM customer_memberships m JOIN customer_users u ON u.id = m.user_id
      WHERE m.tenant_id = ? ORDER BY u.email`).bind(tenant.id).all();
    return customerJson({ tenant: publicTenant(tenant), users: users.results.map(row => ({
      email: row.email, displayName: row.display_name || '', role: row.role, status: row.membership_status,
      userStatus: row.user_status, lastLoginAt: row.last_login_at || '', createdAt: row.created_at })) }, 200, request, env);
  }

  const inviteListMatch = path.match(/^\/api\/customers\/tenants\/([a-z0-9-]+)\/invites$/);
  if (inviteListMatch && request.method === 'GET') {
    const slug = normalizeTenantSlug(inviteListMatch[1]);
    const tenant = slug && await tenantBySlug(db, slug);
    if (!tenant) return customerJson({ error: '등록된 고객사가 아닙니다.' }, 404, request, env);
    const invites = await db.prepare(`SELECT id, email, role, expires_at, accepted_at, revoked_at, created_at
      FROM customer_invites WHERE tenant_id = ? ORDER BY id DESC LIMIT 100`).bind(tenant.id).all();
    return customerJson({ invites: invites.results.map(row => ({ id: row.id, email: row.email, role: row.role,
      expiresAt: row.expires_at, acceptedAt: row.accepted_at || '', revokedAt: row.revoked_at || '', createdAt: row.created_at })) }, 200, request, env);
  }

  if (inviteListMatch && request.method === 'POST') {
    const slug = normalizeTenantSlug(inviteListMatch[1]);
    const tenant = slug && await tenantBySlug(db, slug);
    if (!tenant || tenant.status !== 'active') return customerJson({ error: '등록된 고객사가 아닙니다.' }, 404, request, env);
    const body = await readJson(request);
    const email = normalizeEmail(body?.email);
    const role = normalizeCustomerRole(body?.role || 'client_admin');
    if (!validEmail(email) || !role) return customerJson({ error: '고객 이메일 또는 권한을 확인해 주세요.' }, 400, request, env);
    const rawToken = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
    const tokenHash = await sha256(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITE_HOURS * 60 * 60 * 1000);
    const createdBy = await adminId(db, session);
    await db.prepare(`UPDATE customer_invites SET revoked_at = ? WHERE tenant_id = ? AND email = ?
      AND accepted_at IS NULL AND revoked_at IS NULL`).bind(now.toISOString(), tenant.id, email).run();
    const result = await db.prepare(`INSERT INTO customer_invites
      (tenant_id, email, role, token_hash, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(tenant.id, email, role, tokenHash, expiresAt.toISOString(), createdBy, now.toISOString()).run();
    await writeAdminAudit(db, session, 'customer.invite.create', tenant.domain, JSON.stringify({ email, role }));
    const inviteBase = tenant.public_namespace ? `https://ekodi.kr/${tenant.public_namespace}/` : `https://${tenant.domain}/`;
    const inviteUrl = `${inviteBase}?ekodi_invite=${rawToken}`;
    return customerJson({ ok: true, invite: { id: result.meta.last_row_id, email, role, tenant: tenant.slug,
      inviteUrl, expiresAt: expiresAt.toISOString() } }, 201, request, env);
  }

  const revokeMatch = path.match(/^\/api\/customers\/invites\/(\d+)\/revoke$/);
  if (revokeMatch && request.method === 'POST') {
    const id = Number(revokeMatch[1]);
    const invite = await db.prepare(`SELECT i.id, i.accepted_at, i.revoked_at, t.domain
      FROM customer_invites i JOIN customer_tenants t ON t.id = i.tenant_id WHERE i.id = ?`).bind(id).first();
    if (!invite) return customerJson({ error: '초대를 찾을 수 없습니다.' }, 404, request, env);
    if (invite.accepted_at) return customerJson({ error: '이미 사용된 초대는 취소할 수 없습니다.' }, 409, request, env);
    await db.prepare('UPDATE customer_invites SET revoked_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run();
    await writeAdminAudit(db, session, 'customer.invite.revoke', invite.domain, String(id));
    return customerJson({ ok: true }, 200, request, env);
  }
  return null;
}

export async function handleCustomerAuth(request, env) {
  if (!env.DB) return customerJson({ error: '데이터베이스 연결이 설정되지 않았습니다.' }, 503, request, env);
  const origin = request.headers.get('origin');
  if (origin && !isAllowedOrigin(origin, env)) return customerJson({ error: '허용되지 않은 요청입니다.' }, 403, request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin, env) });
  await ensureSchema(env.DB);
  const path = new URL(request.url).pathname;
  if (path.startsWith('/api/customers/')) return (await handleAdmin(request, env, path)) || customerJson({ error: 'Customer Admin API endpoint not found' }, 404, request, env);
  if (path.startsWith('/api/customer/')) return (await handlePublic(request, env, path)) || customerJson({ error: 'Customer API endpoint not found' }, 404, request, env);
  return null;
}
