import { isAllowedOrigin } from './auth-worker.js';

const encoder = new TextEncoder();
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const ADMIN_ROLES = new Set(['super_admin', 'operator', 'viewer']);
const CHALLENGE_MINUTES = 10;
const SESSION_HOURS = 8;
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
let jwksCache = { keys: [], expiresAt: 0 };

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(String(value || ''))));
}

function base64UrlBytes(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function base64UrlJson(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlBytes(value)));
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cors(origin, env) {
  const headers = {
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  if (origin && isAllowedOrigin(origin, env)) headers['access-control-allow-origin'] = origin;
  return headers;
}

function json(data, status, request, env) {
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

function configuredGoogleClientId(env) {
  const value = String(env.GOOGLE_CLIENT_ID || '').trim();
  return value.endsWith('.apps.googleusercontent.com') ? value : '';
}

function workspaceDomain(env) {
  return String(env.ADMIN_WORKSPACE_DOMAIN || '').trim().toLowerCase();
}

async function ensureSchema(db, env) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      birth_hash TEXT NOT NULL,
      birth_salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'super_admin',
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      admin_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(admin_id) REFERENCES admins(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY(admin_id) REFERENCES admins(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS admin_google_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      google_sub TEXT UNIQUE,
      required_hd TEXT,
      display_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'operator',
      status TEXT NOT NULL DEFAULT 'active',
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS google_login_challenges (
      nonce_hash TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_admin_google_status ON admin_google_accounts(status, role)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_google_challenge_expiry ON google_login_challenges(expires_at)'),
  ]);

  const columns = await db.prepare('PRAGMA table_info(admins)').all();
  if (!columns.results.some(column => column.name === 'password_iterations')) {
    await db.prepare('ALTER TABLE admins ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT 310000').run();
  }

  const bootstrap = String(env.ADMIN_GOOGLE_BOOTSTRAP_EMAILS || '')
    .split(',').map(normalizeEmail).filter(validEmail);
  const hd = workspaceDomain(env);
  const now = new Date().toISOString();
  for (const email of bootstrap) {
    const requiredHd = hd && email.endsWith(`@${hd}`) ? hd : null;
    await db.prepare(`INSERT OR IGNORE INTO admin_google_accounts
      (email, required_hd, role, status, created_at, updated_at)
      VALUES (?, ?, 'super_admin', 'active', ?, ?)`)
      .bind(email, requiredHd, now, now).run();
  }
}

async function writeAudit(db, adminId, action, resource, detail = '') {
  await db.prepare(`INSERT INTO audit_logs (admin_id, action, resource, detail, created_at)
    VALUES (?, ?, ?, ?, ?)`)
    .bind(adminId || null, action, resource, String(detail).slice(0, 500), new Date().toISOString()).run();
}

async function authenticateAdmin(request, db) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  const tokenHash = await sha256(authorization.slice(7));
  return db.prepare(`SELECT admins.id, admins.email, admins.role, sessions.expires_at
    FROM sessions JOIN admins ON admins.id = sessions.admin_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?`)
    .bind(tokenHash, new Date().toISOString()).first();
}

async function issueSession(db, adminId) {
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000);
  await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now.toISOString()).run();
  await db.prepare(`INSERT INTO sessions (token_hash, admin_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)`)
    .bind(tokenHash, adminId, expiresAt.toISOString(), now.toISOString()).run();
  return { token, expiresAt: expiresAt.toISOString() };
}

async function getGoogleKeys() {
  if (jwksCache.expiresAt > Date.now() && jwksCache.keys.length) return jwksCache.keys;
  const response = await fetch(JWKS_URL, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('Google 공개키를 확인할 수 없습니다.');
  const data = await response.json();
  const cacheControl = response.headers.get('cache-control') || '';
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 300);
  jwksCache = { keys: Array.isArray(data.keys) ? data.keys : [], expiresAt: Date.now() + Math.max(60, maxAge) * 1000 };
  return jwksCache.keys;
}

async function verifyGoogleIdToken(token, clientId, expectedNonce) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Google 인증 토큰 형식이 올바르지 않습니다.');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = base64UrlJson(encodedHeader);
  const payload = base64UrlJson(encodedPayload);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Google 인증 서명 형식이 올바르지 않습니다.');
  const keys = await getGoogleKeys();
  const jwk = keys.find(key => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) {
    jwksCache.expiresAt = 0;
    const refreshed = await getGoogleKeys();
    const retry = refreshed.find(key => key.kid === header.kid && key.kty === 'RSA');
    if (!retry) throw new Error('Google 인증 공개키를 찾을 수 없습니다.');
    return verifyGoogleSignature(retry, encodedHeader, encodedPayload, encodedSignature, payload, clientId, expectedNonce);
  }
  return verifyGoogleSignature(jwk, encodedHeader, encodedPayload, encodedSignature, payload, clientId, expectedNonce);
}

async function verifyGoogleSignature(jwk, encodedHeader, encodedPayload, encodedSignature, payload, clientId, expectedNonce) {
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const verified = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    base64UrlBytes(encodedSignature),
    encoder.encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!verified) throw new Error('Google 인증 서명을 확인할 수 없습니다.');
  const now = Math.floor(Date.now() / 1000);
  const audienceOk = Array.isArray(payload.aud) ? payload.aud.includes(clientId) : payload.aud === clientId;
  if (!audienceOk) throw new Error('Google 인증 대상이 EKODI와 일치하지 않습니다.');
  if (!GOOGLE_ISSUERS.has(payload.iss)) throw new Error('Google 인증 발급자를 확인할 수 없습니다.');
  if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= now) throw new Error('Google 인증 토큰이 만료되었습니다.');
  if (Number(payload.iat || now) > now + 300) throw new Error('Google 인증 토큰 시간이 올바르지 않습니다.');
  if (!payload.sub || !payload.email || payload.email_verified !== true) throw new Error('확인된 Google 계정이 필요합니다.');
  if (!expectedNonce || payload.nonce !== expectedNonce) throw new Error('Google 로그인 요청 확인값이 일치하지 않습니다.');
  return payload;
}

async function consumeChallenge(db, nonce) {
  if (!/^[a-f0-9]{48}$/i.test(String(nonce || ''))) return false;
  const nonceHash = await sha256(nonce);
  const now = new Date().toISOString();
  await db.prepare('DELETE FROM google_login_challenges WHERE expires_at <= ?').bind(now).run();
  const row = await db.prepare('SELECT nonce_hash FROM google_login_challenges WHERE nonce_hash = ? AND expires_at > ?')
    .bind(nonceHash, now).first();
  if (!row) return false;
  await db.prepare('DELETE FROM google_login_challenges WHERE nonce_hash = ?').bind(nonceHash).run();
  return true;
}

async function ensureAdminRow(db, account) {
  let admin = await db.prepare('SELECT id, email, role FROM admins WHERE email = ?').bind(account.email).first();
  if (admin) {
    if (admin.role !== account.role) {
      await db.prepare('UPDATE admins SET role = ? WHERE id = ?').bind(account.role, admin.id).run();
      admin.role = account.role;
    }
    return admin;
  }
  const randomHex = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const result = await db.prepare(`INSERT INTO admins
    (email, password_hash, password_salt, password_iterations, birth_hash, birth_salt, role, created_at)
    VALUES (?, ?, ?, 310000, ?, ?, ?, ?)`)
    .bind(account.email, randomHex, salt, randomHex, salt, account.role, new Date().toISOString()).run();
  return { id: result.meta.last_row_id, email: account.email, role: account.role };
}

async function handleLogin(request, env) {
  const clientId = configuredGoogleClientId(env);
  if (!clientId) return json({ error: 'Google 관리자 로그인이 아직 연결되지 않았습니다.', code: 'GOOGLE_CLIENT_ID_REQUIRED' }, 503, request, env);
  const body = await readJson(request);
  const nonce = String(body?.nonce || '').trim();
  const consumed = await consumeChallenge(env.DB, nonce);
  if (!consumed) return json({ error: '로그인 요청이 만료되었거나 이미 사용되었습니다.' }, 400, request, env);
  const payload = await verifyGoogleIdToken(body?.credential, clientId, nonce);
  const email = normalizeEmail(payload.email);
  const account = await env.DB.prepare(`SELECT * FROM admin_google_accounts WHERE email = ? AND status = 'active'`).bind(email).first();
  if (!account) return json({ error: '사전 등록되지 않은 Google 계정입니다.', code: 'GOOGLE_ACCOUNT_NOT_ALLOWED' }, 403, request, env);
  if (account.required_hd && String(payload.hd || '').toLowerCase() !== account.required_hd) {
    return json({ error: '등록된 Google Workspace 조직 계정으로 로그인해 주세요.' }, 403, request, env);
  }
  if (account.google_sub && account.google_sub !== payload.sub) {
    return json({ error: '사전 등록된 Google 계정과 고유 ID가 일치하지 않습니다.' }, 403, request, env);
  }
  const now = new Date().toISOString();
  if (!account.google_sub) {
    await env.DB.prepare(`UPDATE admin_google_accounts
      SET google_sub = ?, display_name = ?, last_login_at = ?, updated_at = ? WHERE id = ?`)
      .bind(payload.sub, String(payload.name || '').slice(0, 120), now, now, account.id).run();
    account.google_sub = payload.sub;
  } else {
    await env.DB.prepare('UPDATE admin_google_accounts SET display_name = ?, last_login_at = ?, updated_at = ? WHERE id = ?')
      .bind(String(payload.name || '').slice(0, 120), now, now, account.id).run();
  }
  const admin = await ensureAdminRow(env.DB, account);
  const session = await issueSession(env.DB, admin.id);
  await writeAudit(env.DB, admin.id, 'session.google_login', 'platform', `${email}:${payload.sub}`);
  return json({ ok: true, email, name: payload.name || '', role: account.role, provider: 'google', ...session }, 200, request, env);
}

async function requireSuperAdmin(request, env) {
  const admin = await authenticateAdmin(request, env.DB);
  if (!admin) return { error: json({ error: '관리자 인증이 필요합니다.' }, 401, request, env) };
  if (admin.role !== 'super_admin') return { error: json({ error: '최고관리자 권한이 필요합니다.' }, 403, request, env) };
  return { admin };
}

async function listAccounts(request, env) {
  const gate = await requireSuperAdmin(request, env);
  if (gate.error) return gate.error;
  const rows = await env.DB.prepare(`SELECT id, email, required_hd, display_name, role, status,
      CASE WHEN google_sub IS NULL THEN 0 ELSE 1 END AS googleBound,
      last_login_at, created_at, updated_at
    FROM admin_google_accounts ORDER BY CASE role WHEN 'super_admin' THEN 0 WHEN 'operator' THEN 1 ELSE 2 END, email`).all();
  return json({ accounts: rows.results || [], workspaceDomain: workspaceDomain(env) }, 200, request, env);
}

async function addAccount(request, env) {
  const gate = await requireSuperAdmin(request, env);
  if (gate.error) return gate.error;
  const body = await readJson(request);
  const email = normalizeEmail(body?.email);
  const role = String(body?.role || 'operator').trim();
  if (!validEmail(email) || !ADMIN_ROLES.has(role)) return json({ error: '이메일과 관리자 권한을 확인해 주세요.' }, 400, request, env);
  const hd = workspaceDomain(env);
  const requiredHd = hd && email.endsWith(`@${hd}`) ? hd : null;
  const now = new Date().toISOString();
  try {
    const result = await env.DB.prepare(`INSERT INTO admin_google_accounts
      (email, required_hd, role, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?)`)
      .bind(email, requiredHd, role, now, now).run();
    await writeAudit(env.DB, gate.admin.id, 'admin_google.allow', 'admin-access', `${email}:${role}`);
    return json({ ok: true, id: result.meta.last_row_id, email, role, requiredHd }, 201, request, env);
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('unique')) return json({ error: '이미 사전 등록된 Google 계정입니다.' }, 409, request, env);
    throw error;
  }
}

async function updateAccount(request, env, id) {
  const gate = await requireSuperAdmin(request, env);
  if (gate.error) return gate.error;
  const body = await readJson(request);
  const role = String(body?.role || '').trim();
  const status = String(body?.status || '').trim();
  if (!ADMIN_ROLES.has(role) || !['active', 'disabled'].includes(status)) return json({ error: '권한과 상태를 확인해 주세요.' }, 400, request, env);
  const target = await env.DB.prepare('SELECT * FROM admin_google_accounts WHERE id = ?').bind(id).first();
  if (!target) return json({ error: '관리자 계정을 찾을 수 없습니다.' }, 404, request, env);
  if (target.email === gate.admin.email && status !== 'active') return json({ error: '현재 로그인한 최고관리자 계정은 비활성화할 수 없습니다.' }, 409, request, env);
  if (target.role === 'super_admin' && (role !== 'super_admin' || status !== 'active')) {
    const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM admin_google_accounts
      WHERE role = 'super_admin' AND status = 'active' AND id <> ?`).bind(id).first();
    if (Number(count.count) < 1) return json({ error: '활성 최고관리자는 최소 1명 이상 유지해야 합니다.' }, 409, request, env);
  }
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE admin_google_accounts SET role = ?, status = ?, updated_at = ? WHERE id = ?')
    .bind(role, status, now, id).run();
  const linkedAdmin = await env.DB.prepare('SELECT id FROM admins WHERE email = ?').bind(target.email).first();
  if (linkedAdmin) {
    await env.DB.prepare('UPDATE admins SET role = ? WHERE id = ?').bind(role, linkedAdmin.id).run();
    if (status === 'disabled') await env.DB.prepare('DELETE FROM sessions WHERE admin_id = ?').bind(linkedAdmin.id).run();
  }
  await writeAudit(env.DB, gate.admin.id, 'admin_google.update', 'admin-access', `${target.email}:${role}:${status}`);
  return json({ ok: true }, 200, request, env);
}

async function removeAccount(request, env, id) {
  const gate = await requireSuperAdmin(request, env);
  if (gate.error) return gate.error;
  const target = await env.DB.prepare('SELECT * FROM admin_google_accounts WHERE id = ?').bind(id).first();
  if (!target) return json({ error: '관리자 계정을 찾을 수 없습니다.' }, 404, request, env);
  if (target.email === gate.admin.email) return json({ error: '현재 로그인한 최고관리자 자신의 권한은 제거할 수 없습니다.' }, 409, request, env);
  if (target.role === 'super_admin' && target.status === 'active') {
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM admin_google_accounts WHERE role = 'super_admin' AND status = 'active' AND id <> ?").bind(id).first();
    if (Number(count.count) < 1) return json({ error: '활성 최고관리자는 최소 1명 이상 유지해야 합니다.' }, 409, request, env);
  }
  const linkedAdmin = await env.DB.prepare('SELECT id FROM admins WHERE email = ?').bind(target.email).first();
  if (linkedAdmin) await env.DB.prepare('DELETE FROM sessions WHERE admin_id = ?').bind(linkedAdmin.id).run();
  await env.DB.prepare('DELETE FROM admin_google_accounts WHERE id = ?').bind(id).run();
  await writeAudit(env.DB, gate.admin.id, 'admin_google.remove', 'admin-access', target.email + ':' + target.role + ':' + target.status);
  return json({ ok: true, removed: { id: target.id, email: target.email } }, 200, request, env);
}

export async function handleAdminGoogleAuth(request, env) {
  const origin = request.headers.get('origin');
  if (!isAllowedOrigin(origin, env)) return json({ error: '허용되지 않은 요청입니다.' }, 403, request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin, env) });
  if (!env.DB) return json({ error: '데이터베이스 연결이 설정되지 않았습니다.' }, 503, request, env);
  await ensureSchema(env.DB, env);
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'GET' && path === '/api/google/config') {
    const clientId = configuredGoogleClientId(env);
    return json({ enabled: Boolean(clientId), clientId, mode: clientId ? 'google_allowlist' : 'password_fallback' }, 200, request, env);
  }
  if (request.method === 'POST' && path === '/api/google/challenge') {
    if (!configuredGoogleClientId(env)) return json({ error: 'Google 관리자 로그인이 아직 연결되지 않았습니다.' }, 503, request, env);
    const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(24)));
    const nonceHash = await sha256(nonce);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CHALLENGE_MINUTES * 60 * 1000);
    await env.DB.prepare('DELETE FROM google_login_challenges WHERE expires_at <= ?').bind(now.toISOString()).run();
    await env.DB.prepare('INSERT INTO google_login_challenges (nonce_hash, expires_at, created_at) VALUES (?, ?, ?)')
      .bind(nonceHash, expiresAt.toISOString(), now.toISOString()).run();
    return json({ nonce, expiresAt: expiresAt.toISOString() }, 201, request, env);
  }
  if (request.method === 'POST' && path === '/api/google/login') return handleLogin(request, env);
  if (request.method === 'GET' && path === '/api/admin-access/google-accounts') return listAccounts(request, env);
  if (request.method === 'POST' && path === '/api/admin-access/google-accounts') return addAccount(request, env);
  const match = path.match(/^\/api\/admin-access\/google-accounts\/(\d+)$/);
  if (request.method === 'PUT' && match) return updateAccount(request, env, Number(match[1]));
  if (request.method === 'DELETE' && match) return removeAccount(request, env, Number(match[1]));
  return json({ error: 'Google 관리자 인증 경로를 찾을 수 없습니다.' }, 404, request, env);
}
