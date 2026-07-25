const ADMIN_EMAIL = 'topmaster.joseph@gmail.com';
const ALLOWED_ORIGIN = 'https://shy-thunder-39a4.topmaster-joseph.workers.dev';
const ITERATIONS = 210000;

const encoder = new TextEncoder();

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(data, status = 200, origin = ALLOWED_ORIGIN) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors(origin) }
  });
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function passwordHash(password, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/.{2}/g), byte => parseInt(byte, 16));
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return bytesToHex(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    material,
    256
  ));
}

function secureEqual(left, right) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
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
    )`)
  ]);
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || ALLOWED_ORIGIN;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (origin !== ALLOWED_ORIGIN && !origin.startsWith('http://localhost')) return json({ error: '허용되지 않은 요청입니다.' }, 403, origin);

    await ensureSchema(env.DB);
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/api/status') {
      const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM admins').first();
      return json({ initialized: Number(count.count) > 0, adminEmail: ADMIN_EMAIL }, 200, origin);
    }

    if (request.method === 'POST' && url.pathname === '/api/setup') {
      const data = await readBody(request);
      if (!data || String(data.email).toLowerCase() !== ADMIN_EMAIL) return json({ error: '지정된 최고관리자 이메일만 등록할 수 있습니다.' }, 403, origin);
      if (typeof data.password !== 'string' || data.password.length < 12) return json({ error: '비밀번호는 12자 이상이어야 합니다.' }, 400, origin);
      const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM admins').first();
      if (Number(count.count) > 0) return json({ error: '최고관리자 등록이 이미 완료되었습니다.' }, 409, origin);

      const passwordSalt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
      const birthSalt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
      const passwordDigest = await passwordHash(data.password, passwordSalt);
      const birthDigest = await sha256(`${birthSalt}:not-required`);
      const createdAt = new Date().toISOString();
      const result = await env.DB.prepare(`INSERT INTO admins
        (email, password_hash, password_salt, birth_hash, birth_salt, role, created_at)
        VALUES (?, ?, ?, ?, ?, 'super_admin', ?)`)
        .bind(ADMIN_EMAIL, passwordDigest, passwordSalt, birthDigest, birthSalt, createdAt).run();
      const session = await issueSession(env.DB, result.meta.last_row_id);
      return json({ ok: true, email: ADMIN_EMAIL, role: 'super_admin', ...session }, 201, origin);
    }

    if (request.method === 'POST' && url.pathname === '/api/login') {
      const ipHash = await sha256(request.headers.get('cf-connecting-ip') || 'unknown');
      const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const attempts = await env.DB.prepare('SELECT COUNT(*) AS count FROM login_attempts WHERE ip_hash = ? AND attempted_at > ?').bind(ipHash, cutoff).first();
      if (Number(attempts.count) >= 8) return json({ error: '로그인 시도가 너무 많습니다. 15분 후 다시 시도하세요.' }, 429, origin);
      await env.DB.prepare('INSERT INTO login_attempts (ip_hash, attempted_at) VALUES (?, ?)').bind(ipHash, new Date().toISOString()).run();

      const data = await readBody(request);
      const email = String(data?.email || '').toLowerCase();
      const admin = await env.DB.prepare('SELECT * FROM admins WHERE email = ?').bind(email).first();
      if (!admin || typeof data?.password !== 'string') return json({ error: '관리자 정보를 확인해 주세요.' }, 401, origin);
      const passwordDigest = await passwordHash(data.password, admin.password_salt);
      if (!secureEqual(passwordDigest, admin.password_hash)) return json({ error: '관리자 정보를 확인해 주세요.' }, 401, origin);
      const session = await issueSession(env.DB, admin.id);
      return json({ ok: true, email: admin.email, role: admin.role, ...session }, 200, origin);
    }

    if (request.method === 'GET' && url.pathname === '/api/session') {
      const admin = await authenticate(request, env.DB);
      return admin ? json({ authenticated: true, email: admin.email, role: admin.role, expiresAt: admin.expires_at }, 200, origin)
        : json({ authenticated: false }, 401, origin);
    }

    if (request.method === 'POST' && url.pathname === '/api/logout') {
      const authorization = request.headers.get('authorization') || '';
      if (authorization.startsWith('Bearer ')) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(authorization.slice(7))).run();
      return json({ ok: true }, 200, origin);
    }

    return json({ error: 'Not found' }, 404, origin);
  }
};
