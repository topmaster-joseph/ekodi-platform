const DEFAULT_ADMIN_EMAIL = 'topmaster.joseph@gmail.com';
const DEFAULT_ALLOWED_ORIGIN = 'https://shy-thunder-39a4.topmaster-joseph.workers.dev';
const LEGACY_ITERATIONS = 100000;
const CURRENT_ITERATIONS = 310000;
const BOOTSTRAP_RECOVERY_HASH = 'a3a3f6c2f64ee7f1595741906bf19a14d2a5d1184c8255d9a330719491d3a21b';

const encoder = new TextEncoder();

function configuredOrigins(env = {}) {
  const configured = String(env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGIN)
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (env.ENVIRONMENT !== 'production') configured.push('http://localhost:3000', 'http://localhost:8788');
  return new Set(configured);
}

export function isAllowedOrigin(origin, env = {}) {
  return !origin || configuredOrigins(env).has(origin);
}

function cors(origin, env = {}) {
  const headers = {
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  if (origin && isAllowedOrigin(origin, env)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(data, status = 200, origin = null, env = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...cors(origin, env)
    }
  });
}

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

async function passwordHash(password, saltHex, iterations = CURRENT_ITERATIONS) {
  const salt = saltBytes(saltHex);
  if (!salt || typeof password !== 'string') return null;
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return bytesToHex(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    256
  ));
}

export function secureEqual(left, right) {
  left = String(left || '');
  right = String(right || '');
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

function newRecoveryCode() {
  const hex = bytesToHex(crypto.getRandomValues(new Uint8Array(12))).toUpperCase();
  return `EKODI-${hex.match(/.{1,4}/g).join('-')}`;
}

async function ensureSchema(db) {
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
    db.prepare(`CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_hash TEXT NOT NULL,
      attempted_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS recovery_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_hash TEXT NOT NULL,
      attempted_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS password_recovery (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      recovery_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY(admin_id) REFERENCES admins(id)
    )`)
  ]);
  await db.prepare(`CREATE TABLE IF NOT EXISTS domain_registry (
    domain TEXT PRIMARY KEY,
    registrar TEXT NOT NULL DEFAULT '도메인클럽',
    registered_at TEXT,
    expires_at TEXT,
    auto_renew INTEGER NOT NULL DEFAULT 0,
    transfer_lock INTEGER NOT NULL DEFAULT 1,
    whois_privacy INTEGER NOT NULL DEFAULT 1,
    reminder_days INTEGER NOT NULL DEFAULT 60,
    memo TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    updated_by INTEGER
  )`).run();
  const adminColumns = await db.prepare('PRAGMA table_info(admins)').all();
  if (!adminColumns.results.some(column => column.name === 'password_iterations')) {
    await db.prepare(`ALTER TABLE admins ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT ${LEGACY_ITERATIONS}`).run();
  }
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function issueSession(db, adminId) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = bytesToHex(tokenBytes);
  const tokenHash = await sha256(token);
  const now = new Date();
  const expires = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now.toISOString()).run();
  await db.prepare('INSERT INTO sessions (token_hash, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, adminId, expires.toISOString(), now.toISOString()).run();
  return { token, expiresAt: expires.toISOString() };
}

async function authenticate(request, db) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  const tokenHash = await sha256(authorization.slice(7));
  return db.prepare(`SELECT admins.id, admins.email, admins.role, sessions.expires_at
    FROM sessions JOIN admins ON admins.id = sessions.admin_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?`)
    .bind(tokenHash, new Date().toISOString()).first();
}


const EKODI_DOMAINS = [
  { name: 'ekodi.kr', service: '에코디 통합 루트' },
  { name: 'ekodimall.kr', service: '에코디몰' },
  { name: 'ekodibiz.kr', service: '에코디비즈' },
  { name: 'ekodibook.kr', service: '에코디출판' },
  { name: 'ekodichurch.kr', service: '에코디교회' },
  { name: 'ekodilab.kr', service: '에코디연구소' }
];

const DNS_RECORD_TYPES = new Set(['A', 'AAAA', 'CNAME', 'TXT', 'MX']);
const CLOUDFLARE_ID = /^[a-f0-9]{32}$/i;

export function validateDnsRecord(body) {
  if (!body || typeof body !== 'object') return { error: 'DNS 레코드 형식을 확인해 주세요.' };
  const type = String(body.type || '').toUpperCase();
  const name = String(body.name || '').trim().toLowerCase();
  const content = String(body.content || '').trim();
  const ttl = Math.trunc(Number(body.ttl) || 3600);
  if (!DNS_RECORD_TYPES.has(type)) return { error: '지원하지 않는 DNS 레코드 유형입니다.' };
  if (!name || name.length > 253 || !/^[a-z0-9@*._-]+$/i.test(name)) return { error: 'DNS 호스트 이름을 확인해 주세요.' };
  if (!content || content.length > 2048) return { error: 'DNS 연결 값을 확인해 주세요.' };
  if (ttl !== 1 && (ttl < 60 || ttl > 86400)) return { error: 'TTL은 자동 또는 60~86400초여야 합니다.' };
  return {
    value: {
      type,
      name,
      content,
      ttl,
      proxied: Boolean(body.proxied) && ['A', 'AAAA', 'CNAME'].includes(type),
      ...(type === 'MX' ? { priority: Math.min(65535, Math.max(0, Math.trunc(Number(body.priority) || 10))) } : {})
    }
  };
}

async function writeAudit(db, adminId, action, resource, detail = '') {
  await db.prepare('INSERT INTO audit_logs (admin_id, action, resource, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(adminId || null, action, resource, String(detail).slice(0, 500), new Date().toISOString()).run();
}

async function cfApi(env, path, options = {}) {
  if (!env.CF_API_TOKEN) throw new Error('도메인 관리 권한이 설정되지 않았습니다.');
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${env.CF_API_TOKEN}`,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok || data.success === false) {
    throw new Error(data.errors?.[0]?.message || 'Cloudflare 도메인 요청에 실패했습니다.');
  }
  return data.result;
}

async function requireManagedZone(env, zoneId) {
  if (!CLOUDFLARE_ID.test(zoneId)) throw new Error('유효하지 않은 Cloudflare Zone ID입니다.');
  const zone = await cfApi(env, `/zones/${zoneId}`);
  if (!EKODI_DOMAINS.some(domain => domain.name === zone?.name)) throw new Error('관리 대상 도메인이 아닙니다.');
  return zone;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin');
    const reply = (data, status = 200) => json(data, status, origin, env);
    if (!isAllowedOrigin(origin, env)) return reply({ error: '허용되지 않은 요청입니다.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin, env) });
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return reply({ ok: true, service: 'ekodi-auth-api', version: 4 });
    if (!env.DB) return reply({ error: '데이터베이스 연결이 설정되지 않았습니다.' }, 503);

    try {
      await ensureSchema(env.DB);
    const adminEmail = String(env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).toLowerCase();

    if (request.method === 'GET' && url.pathname === '/api/status') {
      const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM admins').first();
      return reply({ initialized: Number(count.count) > 0, adminEmail, passwordReset: true });
    }

    if (request.method === 'POST' && url.pathname === '/api/setup') {
      const data = await readBody(request);
      if (!data || String(data.email).toLowerCase() !== adminEmail) return reply({ error: '지정된 최고관리자 이메일만 등록할 수 있습니다.' }, 403);
      if (typeof data.password !== 'string' || data.password.length < 12) return reply({ error: '비밀번호는 12자 이상이어야 합니다.' }, 400);
      const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM admins').first();
      if (Number(count.count) > 0) return reply({ error: '최고관리자 등록이 이미 완료되었습니다.' }, 409);

      const passwordSalt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
      const birthSalt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
      const passwordDigest = await passwordHash(data.password, passwordSalt);
      const birthDigest = await sha256(`${birthSalt}:not-required`);
      const createdAt = new Date().toISOString();
      const result = await env.DB.prepare(`INSERT INTO admins
        (email, password_hash, password_salt, password_iterations, birth_hash, birth_salt, role, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'super_admin', ?)`)
        .bind(adminEmail, passwordDigest, passwordSalt, CURRENT_ITERATIONS, birthDigest, birthSalt, createdAt).run();
      const session = await issueSession(env.DB, result.meta.last_row_id);
      await writeAudit(env.DB, result.meta.last_row_id, 'admin.setup', 'platform', adminEmail);
      return reply({ ok: true, email: adminEmail, role: 'super_admin', ...session }, 201);
    }

    if (request.method === 'POST' && url.pathname === '/api/login') {
      const ipHash = await sha256(request.headers.get('cf-connecting-ip') || 'unknown');
      const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      await env.DB.prepare('DELETE FROM login_attempts WHERE attempted_at <= ?').bind(cutoff).run();
      const attempts = await env.DB.prepare('SELECT COUNT(*) AS count FROM login_attempts WHERE ip_hash = ? AND attempted_at > ?').bind(ipHash, cutoff).first();
      if (Number(attempts.count) >= 8) return reply({ error: '로그인 시도가 너무 많습니다. 15분 후 다시 시도하세요.' }, 429);

      const data = await readBody(request);
      const email = String(data?.email || '').toLowerCase();
      const admin = await env.DB.prepare('SELECT * FROM admins WHERE email = ?').bind(email).first();
      const passwordDigest = admin && typeof data?.password === 'string'
        ? await passwordHash(data.password, admin.password_salt, Number(admin.password_iterations) || LEGACY_ITERATIONS)
        : null;
      if (!admin || !passwordDigest || !secureEqual(passwordDigest, admin.password_hash)) {
        await env.DB.prepare('INSERT INTO login_attempts (ip_hash, attempted_at) VALUES (?, ?)').bind(ipHash, new Date().toISOString()).run();
        return reply({ error: '관리자 정보를 확인해 주세요.' }, 401);
      }
      if (Number(admin.password_iterations) < CURRENT_ITERATIONS) {
        const upgradedSalt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
        const upgradedHash = await passwordHash(data.password, upgradedSalt, CURRENT_ITERATIONS);
        await env.DB.prepare('UPDATE admins SET password_hash = ?, password_salt = ?, password_iterations = ? WHERE id = ?')
          .bind(upgradedHash, upgradedSalt, CURRENT_ITERATIONS, admin.id).run();
      }
      await env.DB.prepare('DELETE FROM login_attempts WHERE ip_hash = ?').bind(ipHash).run();
      const session = await issueSession(env.DB, admin.id);
      await writeAudit(env.DB, admin.id, 'session.login', 'platform');
      return reply({ ok: true, email: admin.email, role: admin.role, ...session });
    }



    if (request.method === 'POST' && url.pathname === '/api/password/reset') {
      const ipHash = await sha256(request.headers.get('cf-connecting-ip') || 'unknown');
      const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      await env.DB.prepare('DELETE FROM recovery_attempts WHERE attempted_at <= ?').bind(cutoff).run();
      const attempts = await env.DB.prepare('SELECT COUNT(*) AS count FROM recovery_attempts WHERE ip_hash = ? AND attempted_at > ?').bind(ipHash, cutoff).first();
      if (Number(attempts.count) >= 5) return reply({ error: '재설정 시도가 너무 많습니다. 30분 후 다시 시도하세요.' }, 429);

      const data = await readBody(request);
      const email = String(data?.email || '').trim().toLowerCase();
      const recoveryCode = String(data?.recoveryCode || '').trim().toUpperCase();
      const nextPassword = typeof data?.password === 'string' ? data.password : '';
      if (email !== adminEmail) return reply({ error: '최고관리자 계정을 확인해 주세요.' }, 403);
      if (!recoveryCode) return reply({ error: '관리자 복구 코드를 입력해 주세요.' }, 400);
      if (nextPassword.length < 12) return reply({ error: '새 비밀번호는 12자 이상이어야 합니다.' }, 400);

      const admin = await env.DB.prepare('SELECT * FROM admins WHERE email = ?').bind(adminEmail).first();
      if (!admin) return reply({ error: '최고관리자 계정이 아직 등록되지 않았습니다.' }, 409);
      const recovery = await env.DB.prepare('SELECT recovery_hash FROM password_recovery WHERE id = 1').first();
      const suppliedHash = await sha256(recoveryCode);
      const expectedHash = recovery?.recovery_hash || BOOTSTRAP_RECOVERY_HASH;
      if (!secureEqual(suppliedHash, expectedHash)) {
        await env.DB.prepare('INSERT INTO recovery_attempts (ip_hash, attempted_at) VALUES (?, ?)').bind(ipHash, new Date().toISOString()).run();
        return reply({ error: '관리자 복구 코드를 확인해 주세요.' }, 401);
      }

      const passwordSalt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
      const passwordDigest = await passwordHash(nextPassword, passwordSalt, CURRENT_ITERATIONS);
      const changedAt = new Date().toISOString();
      await env.DB.prepare('UPDATE admins SET password_hash = ?, password_salt = ?, password_iterations = ? WHERE id = ?')
        .bind(passwordDigest, passwordSalt, CURRENT_ITERATIONS, admin.id).run();
      await env.DB.prepare('DELETE FROM sessions WHERE admin_id = ?').bind(admin.id).run();
      await env.DB.prepare('DELETE FROM login_attempts').run();
      await env.DB.prepare('DELETE FROM recovery_attempts WHERE ip_hash = ?').bind(ipHash).run();

      const rotatedRecoveryCode = newRecoveryCode();
      const rotatedRecoveryHash = await sha256(rotatedRecoveryCode);
      await env.DB.prepare(`INSERT INTO password_recovery (id, recovery_hash, updated_at)
        VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET recovery_hash = excluded.recovery_hash, updated_at = excluded.updated_at`)
        .bind(rotatedRecoveryHash, changedAt).run();
      await writeAudit(env.DB, admin.id, 'admin.password.reset', 'platform', 'recovery-code reset; sessions revoked');
      const session = await issueSession(env.DB, admin.id);
      return reply({ ok: true, email: admin.email, role: admin.role, recoveryCode: rotatedRecoveryCode, ...session });
    }

    if (request.method === 'POST' && url.pathname === '/api/password/change') {
      const adminSession = await authenticate(request, env.DB);
      if (!adminSession) return reply({ error: '관리자 인증이 필요합니다.' }, 401);
      const data = await readBody(request);
      const currentPassword = typeof data?.currentPassword === 'string' ? data.currentPassword : '';
      const nextPassword = typeof data?.password === 'string' ? data.password : '';
      if (nextPassword.length < 12) return reply({ error: '새 비밀번호는 12자 이상이어야 합니다.' }, 400);
      const admin = await env.DB.prepare('SELECT * FROM admins WHERE id = ?').bind(adminSession.id).first();
      const currentDigest = await passwordHash(currentPassword, admin?.password_salt, Number(admin?.password_iterations) || LEGACY_ITERATIONS);
      if (!admin || !currentDigest || !secureEqual(currentDigest, admin.password_hash)) return reply({ error: '현재 비밀번호를 확인해 주세요.' }, 401);
      const passwordSalt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
      const passwordDigest = await passwordHash(nextPassword, passwordSalt, CURRENT_ITERATIONS);
      await env.DB.prepare('UPDATE admins SET password_hash = ?, password_salt = ?, password_iterations = ? WHERE id = ?')
        .bind(passwordDigest, passwordSalt, CURRENT_ITERATIONS, admin.id).run();
      await env.DB.prepare('DELETE FROM sessions WHERE admin_id = ?').bind(admin.id).run();
      await writeAudit(env.DB, admin.id, 'admin.password.change', 'platform', 'all sessions revoked');
      const session = await issueSession(env.DB, admin.id);
      return reply({ ok: true, email: admin.email, role: admin.role, ...session });
    }

    if (url.pathname.startsWith('/api/registry')) {
      const admin = await authenticate(request, env.DB);
      if (!admin) return reply({ error: '관리자 인증이 필요합니다.' }, 401);
      const seed = env.DB.prepare(`INSERT OR IGNORE INTO domain_registry
        (domain, registrar, auto_renew, transfer_lock, whois_privacy, reminder_days, memo, updated_at)
        VALUES (?, '도메인클럽', 0, 1, 1, 60, '', ?)`);
      await env.DB.batch(EKODI_DOMAINS.map(item => seed.bind(item.name, new Date().toISOString())));
      if (request.method === 'GET' && url.pathname === '/api/registry') {
        const result = await env.DB.prepare('SELECT * FROM domain_registry ORDER BY domain').all();
        return reply({ records: result.results.map(row => ({
          domain: row.domain, registrar: row.registrar, registeredAt: row.registered_at || '',
          expiresAt: row.expires_at || '', autoRenew: Boolean(row.auto_renew),
          transferLock: Boolean(row.transfer_lock), whoisPrivacy: Boolean(row.whois_privacy),
          reminderDays: row.reminder_days, memo: row.memo || '', updatedAt: row.updated_at
        })) });
      }
      const match = url.pathname.match(/^\/api\/registry\/([^/]+)$/);
      if (request.method === 'PUT' && match) {
        const domain = decodeURIComponent(match[1]).toLowerCase();
        if (!EKODI_DOMAINS.some(item => item.name === domain)) return reply({ error: '관리 대상 도메인이 아닙니다.' }, 400);
        const body = await readBody(request);
        const datePattern = /^$|^\d{4}-\d{2}-\d{2}$/;
        if (!body || !datePattern.test(String(body.registeredAt || '')) || !datePattern.test(String(body.expiresAt || ''))) return reply({ error: '날짜 형식을 확인해 주세요.' }, 400);
        const reminderDays = Math.min(365, Math.max(7, Number(body.reminderDays) || 60));
        const memo = String(body.memo || '').trim().slice(0, 240);
        await env.DB.prepare(`UPDATE domain_registry SET registered_at=?, expires_at=?, auto_renew=?,
          transfer_lock=?, whois_privacy=?, reminder_days=?, memo=?, updated_at=?, updated_by=? WHERE domain=?`)
          .bind(body.registeredAt || null, body.expiresAt || null, body.autoRenew ? 1 : 0,
            body.transferLock ? 1 : 0, body.whoisPrivacy ? 1 : 0, reminderDays, memo,
            new Date().toISOString(), admin.id, domain).run();
        await writeAudit(env.DB, admin.id, 'registry.update', domain, JSON.stringify({
          expiresAt: body.expiresAt || null,
          autoRenew: Boolean(body.autoRenew),
          transferLock: Boolean(body.transferLock),
          whoisPrivacy: Boolean(body.whoisPrivacy)
        }));
        return reply({ ok: true });
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/audit') {
      const admin = await authenticate(request, env.DB);
      if (!admin) return reply({ error: '관리자 인증이 필요합니다.' }, 401);
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20));
      const result = await env.DB.prepare(`SELECT audit_logs.id, audit_logs.action, audit_logs.resource,
        audit_logs.detail, audit_logs.created_at, admins.email
        FROM audit_logs LEFT JOIN admins ON admins.id = audit_logs.admin_id
        ORDER BY audit_logs.id DESC LIMIT ?`).bind(limit).all();
      return reply({ events: result.results.map(row => ({
        id: row.id,
        action: row.action,
        resource: row.resource,
        detail: row.detail,
        createdAt: row.created_at,
        actor: row.email || 'system'
      })) });
    }

    if (url.pathname.startsWith('/api/domains')) {
      const admin = await authenticate(request, env.DB);
      if (!admin) return reply({ error: '관리자 인증이 필요합니다.' }, 401);
      try {
        if (request.method === 'GET' && url.pathname === '/api/domains') {
          const zones = await cfApi(env, '/zones?per_page=50');
          const domains = EKODI_DOMAINS.map(domain => {
            const zone = zones.find(item => item.name === domain.name);
            return { ...domain, connected: Boolean(zone), zoneId: zone?.id || null, status: zone?.status || 'not_connected', nameServers: zone?.name_servers || [] };
          });
          return reply({ domains });
        }

        const match = url.pathname.match(/^\/api\/domains\/([^/]+)\/dns(?:\/([^/]+))?$/);
        if (match) {
          const zoneId = match[1];
          const recordId = match[2];
          const zone = await requireManagedZone(env, zoneId);
          if (recordId && !CLOUDFLARE_ID.test(recordId)) return reply({ error: '유효하지 않은 DNS 레코드 ID입니다.' }, 400);
          if (request.method === 'GET' && !recordId) {
            const records = await cfApi(env, `/zones/${zoneId}/dns_records?per_page=100`);
            return reply({ records });
          }
          if (request.method === 'POST' && !recordId) {
            const validated = validateDnsRecord(await readBody(request));
            if (validated.error) return reply({ error: validated.error }, 400);
            const record = await cfApi(env, `/zones/${zoneId}/dns_records`, { method: 'POST', body: JSON.stringify(validated.value) });
            await writeAudit(env.DB, admin.id, 'dns.create', zone.name, JSON.stringify({ type: validated.value.type, name: validated.value.name }));
            return reply({ record }, 201);
          }
          if (request.method === 'PUT' && recordId) {
            const validated = validateDnsRecord(await readBody(request));
            if (validated.error) return reply({ error: validated.error }, 400);
            const record = await cfApi(env, `/zones/${zoneId}/dns_records/${recordId}`, { method: 'PUT', body: JSON.stringify(validated.value) });
            await writeAudit(env.DB, admin.id, 'dns.update', zone.name, JSON.stringify({ type: validated.value.type, name: validated.value.name }));
            return reply({ record });
          }
          if (request.method === 'DELETE' && recordId) {
            await cfApi(env, `/zones/${zoneId}/dns_records/${recordId}`, { method: 'DELETE' });
            await writeAudit(env.DB, admin.id, 'dns.delete', zone.name, recordId);
            return reply({ ok: true });
          }
        }
      } catch (error) {
        return reply({ error: error.message }, 502);
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/session') {
      const admin = await authenticate(request, env.DB);
      return admin ? reply({ authenticated: true, email: admin.email, role: admin.role, expiresAt: admin.expires_at })
        : reply({ authenticated: false }, 401);
    }

    if (request.method === 'POST' && url.pathname === '/api/logout') {
      const authorization = request.headers.get('authorization') || '';
      const admin = await authenticate(request, env.DB);
      if (authorization.startsWith('Bearer ')) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(authorization.slice(7))).run();
      if (admin) await writeAudit(env.DB, admin.id, 'session.logout', 'platform');
      return reply({ ok: true });
    }

    return reply({ error: 'Not found' }, 404);
    } catch (error) {
      console.error('Unhandled auth API error', error);
      return reply({
        error: '인증 서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
        code: 'AUTH_API_ERROR'
      }, 500);
    }
  }
};
