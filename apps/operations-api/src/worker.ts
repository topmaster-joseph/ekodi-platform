import { Hono } from 'hono';
import { AUTH_PERMISSIONS, hasPermission, readBearerToken, SESSION_DURATION_MS, validateAdminPassword } from '@ekodi/auth';
import { databaseFromEnv, isUniqueConstraintError } from '@ekodi/database';
import { CMS_AUDIT_ACTIONS, CMS_SITE_IDS, cmsResource, publicPage, validateCmsPage, validateMediaMetadata } from '@ekodi/ekcms';
import { EKODI_SERVICES, MANAGED_DNS_SERVICES } from '@ekodi/ecosystem-catalog';

const DEFAULT_ADMIN_EMAIL = 'topmaster.joseph@gmail.com';
const DEFAULT_ALLOWED_ORIGIN = 'https://shy-thunder-39a4.topmaster-joseph.workers.dev';
const LEGACY_ITERATIONS = 100000;
const CURRENT_ITERATIONS = 310000;

type WorkerEnv = {
  ENVIRONMENT?: string;
  ADMIN_EMAIL?: string;
  ALLOWED_ORIGINS?: string;
  PUBLIC_CONTENT_ORIGINS?: string;
  CF_API_TOKEN?: string;
  DB?: D1Database;
  STORAGE?: R2Bucket;
};

type CloudflareZone = {
  id: string;
  name: string;
  status?: string;
  name_servers?: string[];
};

const encoder = new TextEncoder();

function configuredOrigins(env: WorkerEnv = {}) {
  const configured = [env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGIN, env.PUBLIC_CONTENT_ORIGINS || DEFAULT_CONTENT_ORIGINS]
    .filter(Boolean)
    .join(',')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (env.ENVIRONMENT !== 'production') configured.push('http://localhost:3000', 'http://localhost:8788');
  return new Set(configured);
}

export function isAllowedOrigin(origin, env: WorkerEnv = {}) {
  return !origin || configuredOrigins(env).has(origin);
}

function cors(origin, env: WorkerEnv = {}) {
  const headers = {
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  if (origin && isAllowedOrigin(origin, env)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(data, status = 200, origin = null, env: WorkerEnv = {}) {
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

function publicJson(data, status = 200, origin = null, env: WorkerEnv = {}) {
  const response = json(data, status, origin, env);
  response.headers.set('cache-control', 'public, max-age=60, stale-while-revalidate=300');
  return response;
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function passwordHash(password, saltHex, iterations = CURRENT_ITERATIONS) {
  const salt = Uint8Array.from((saltHex.match(/.{2}/g) || []) as string[], byte => parseInt(byte, 16));
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return bytesToHex(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    256
  ));
}

export function secureEqual(left, right) {
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
    db.prepare(`CREATE TABLE IF NOT EXISTS cms_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      draft_content TEXT NOT NULL DEFAULT '',
      published_content TEXT,
      data_classification TEXT NOT NULL DEFAULT 'public',
      status TEXT NOT NULL DEFAULT 'draft',
      version INTEGER NOT NULL DEFAULT 1,
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by INTEGER,
      UNIQUE(site_id, slug)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS cms_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL,
      version INTEGER NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      event TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by INTEGER
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS media_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      object_key TEXT NOT NULL UNIQUE,
      filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'private',
      created_at TEXT NOT NULL,
      created_by INTEGER
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
  const expires = new Date(now.getTime() + SESSION_DURATION_MS);
  await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now.toISOString()).run();
  await db.prepare('INSERT INTO sessions (token_hash, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, adminId, expires.toISOString(), now.toISOString()).run();
  return { token, expiresAt: expires.toISOString() };
}

async function authenticate(request, db) {
  const token = readBearerToken(request.headers);
  if (!token) return null;
  const tokenHash = await sha256(token);
  return db.prepare(`SELECT admins.id, admins.email, admins.role, sessions.expires_at
    FROM sessions JOIN admins ON admins.id = sessions.admin_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?`)
    .bind(tokenHash, new Date().toISOString()).first();
}


const EKODI_DOMAINS = MANAGED_DNS_SERVICES.map(({ domain, name }) => ({ name: domain, service: name }));
const DEFAULT_CONTENT_ORIGINS = EKODI_SERVICES.map(service => new URL(service.url).origin).join(',');

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

function cmsPageRecord(row) {
  return {
    id: row.id,
    siteId: row.site_id,
    slug: row.slug,
    title: row.title,
    summary: row.summary || '',
    content: row.draft_content || '',
    classification: row.data_classification || 'public',
    status: row.status,
    version: row.version,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mediaRecord(row) {
  return {
    id: row.id,
    siteId: row.site_id,
    filename: row.filename,
    contentType: row.content_type,
    size: row.size,
    visibility: row.visibility,
    createdAt: row.created_at,
    url: row.visibility === 'public' ? `/api/content/${encodeURIComponent(row.site_id)}/media/${row.id}` : null
  };
}

function requirePermission(admin, permission, reply) {
  return hasPermission(admin.role, permission) ? null : reply({ error: '이 작업을 수행할 권한이 없습니다.' }, 403);
}

async function cfApi<T = unknown>(env: WorkerEnv, path, options: RequestInit = {}): Promise<T> {
  if (!env.CF_API_TOKEN) throw new Error('도메인 관리 권한이 설정되지 않았습니다.');
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${env.CF_API_TOKEN}`,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json() as { success?: boolean; errors?: Array<{ message?: string }>; result?: T };
  if (!response.ok || data.success === false) {
    throw new Error(data.errors?.[0]?.message || 'Cloudflare 도메인 요청에 실패했습니다.');
  }
  return data.result as T;
}

async function requireManagedZone(env, zoneId) {
  if (!CLOUDFLARE_ID.test(zoneId)) throw new Error('유효하지 않은 Cloudflare Zone ID입니다.');
  const zone = await cfApi<CloudflareZone>(env, `/zones/${zoneId}`);
  if (!EKODI_DOMAINS.some(domain => domain.name === zone?.name)) throw new Error('관리 대상 도메인이 아닙니다.');
  return zone;
}

const worker = {
  async fetch(request, env) {
    const origin = request.headers.get('origin');
    const reply = (data, status = 200) => json(data, status, origin, env);
    if (!isAllowedOrigin(origin, env)) return reply({ error: '허용되지 않은 요청입니다.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin, env) });
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return reply({ ok: true, service: 'ekodi-auth-api', version: 3 });
    if (!databaseFromEnv(env)) return reply({ error: '데이터베이스 연결이 설정되지 않았습니다.' }, 503);

    await ensureSchema(env.DB);
    const adminEmail = String(env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).toLowerCase();

    if (request.method === 'GET' && url.pathname === '/api/status') {
      const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM admins').first();
      return reply({ initialized: Number(count.count) > 0, adminEmail });
    }

    if (request.method === 'POST' && url.pathname === '/api/setup') {
      const data = await readBody(request);
      if (!data || String(data.email).toLowerCase() !== adminEmail) return reply({ error: '지정된 최고관리자 이메일만 등록할 수 있습니다.' }, 403);
      const passwordValidation = validateAdminPassword(data.password);
      if (passwordValidation.error) return reply({ error: passwordValidation.error }, 400);
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



    if (request.method === 'GET' && url.pathname.startsWith('/api/content/')) {
      const mediaMatch = url.pathname.match(/^\/api\/content\/([^/]+)\/media\/(\d+)$/);
      if (mediaMatch) {
        const siteId = decodeURIComponent(mediaMatch[1]).toLowerCase();
        const asset = await env.DB.prepare(`SELECT * FROM media_assets WHERE id = ? AND site_id = ? AND visibility = 'public'`)
          .bind(Number(mediaMatch[2]), siteId).first();
        if (!asset) return reply({ error: '공개 미디어를 찾을 수 없습니다.' }, 404);
        if (!env.STORAGE) return reply({ error: '미디어 저장소가 설정되지 않았습니다.' }, 503);
        const object = await env.STORAGE.get(asset.object_key);
        if (!object) return reply({ error: '미디어 파일을 찾을 수 없습니다.' }, 404);
        const headers = new Headers(cors(origin, env));
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('cache-control', 'public, max-age=3600, stale-while-revalidate=86400');
        headers.set('x-content-type-options', 'nosniff');
        return new Response(object.body, { headers });
      }
      const match = url.pathname.match(/^\/api\/content\/([^/]+)\/pages(?:\/([^/]+))?$/);
      if (!match) return reply({ error: 'Not found' }, 404);
      const siteId = decodeURIComponent(match[1]).toLowerCase();
      const slug = match[2] ? decodeURIComponent(match[2]).toLowerCase() : null;
      if (!CMS_SITE_IDS.includes(siteId)) return reply({ error: '관리 대상 EKODI 사이트가 아닙니다.' }, 404);
      if (slug) {
        const row = await env.DB.prepare(`SELECT * FROM cms_pages
          WHERE site_id = ? AND slug = ? AND status = 'published' AND data_classification = 'public'`).bind(siteId, slug).first();
        return row ? publicJson({ page: publicPage(row) }, 200, origin, env) : reply({ error: '게시된 콘텐츠를 찾을 수 없습니다.' }, 404);
      }
      const result = await env.DB.prepare(`SELECT * FROM cms_pages
        WHERE site_id = ? AND status = 'published' AND data_classification = 'public' ORDER BY published_at DESC`).bind(siteId).all();
      return publicJson({ pages: result.results.map(publicPage) }, 200, origin, env);
    }

    if (url.pathname.startsWith('/api/cms')) {
      const admin = await authenticate(request, env.DB);
      if (!admin) return reply({ error: '관리자 인증이 필요합니다.' }, 401);

      if (request.method === 'GET' && url.pathname === '/api/cms/media') {
        const denied = requirePermission(admin, AUTH_PERMISSIONS.MEDIA_READ, reply);
        if (denied) return denied;
        const siteId = String(url.searchParams.get('site') || '').toLowerCase();
        if (siteId && !CMS_SITE_IDS.includes(siteId)) return reply({ error: '관리 대상 EKODI 사이트가 아닙니다.' }, 400);
        const result = siteId
          ? await env.DB.prepare('SELECT * FROM media_assets WHERE site_id = ? ORDER BY id DESC LIMIT 100').bind(siteId).all()
          : await env.DB.prepare('SELECT * FROM media_assets ORDER BY id DESC LIMIT 100').all();
        return reply({ assets: result.results.map(mediaRecord) });
      }

      if (request.method === 'POST' && url.pathname === '/api/cms/media') {
        const denied = requirePermission(admin, AUTH_PERMISSIONS.MEDIA_WRITE, reply);
        if (denied) return denied;
        if (!env.STORAGE) return reply({ error: '미디어 저장소가 설정되지 않았습니다.' }, 503);
        const form = await request.formData();
        const file = form.get('file');
        const validated = validateMediaMetadata({
          siteId: form.get('siteId'),
          filename: file instanceof File ? file.name : '',
          contentType: file instanceof File ? file.type : '',
          size: file instanceof File ? file.size : 0,
          visibility: form.get('visibility')
        });
        if (validated.error || !(file instanceof File)) return reply({ error: validated.error || '파일을 선택해 주세요.' }, 400);
        const media = validated.value;
        const objectKey = `${media.siteId}/${crypto.randomUUID()}`;
        await env.STORAGE.put(objectKey, file.stream(), { httpMetadata: { contentType: media.contentType }, customMetadata: { filename: media.filename } });
        const now = new Date().toISOString();
        try {
          const result = await env.DB.prepare(`INSERT INTO media_assets
            (site_id, object_key, filename, content_type, size, visibility, created_at, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(media.siteId, objectKey, media.filename, media.contentType, media.size, media.visibility, now, admin.id).run();
          await writeAudit(env.DB, admin.id, CMS_AUDIT_ACTIONS.mediaUpload, `${media.siteId}/${result.meta.last_row_id}`, JSON.stringify({ filename: media.filename, visibility: media.visibility }));
          const asset = await env.DB.prepare('SELECT * FROM media_assets WHERE id = ?').bind(result.meta.last_row_id).first();
          return reply({ asset: mediaRecord(asset) }, 201);
        } catch (error) {
          await env.STORAGE.delete(objectKey);
          throw error;
        }
      }

      const mediaDeleteMatch = url.pathname.match(/^\/api\/cms\/media\/(\d+)$/);
      if (request.method === 'DELETE' && mediaDeleteMatch) {
        const denied = requirePermission(admin, AUTH_PERMISSIONS.MEDIA_WRITE, reply);
        if (denied) return denied;
        if (!env.STORAGE) return reply({ error: '미디어 저장소가 설정되지 않았습니다.' }, 503);
        const asset = await env.DB.prepare('SELECT * FROM media_assets WHERE id = ?').bind(Number(mediaDeleteMatch[1])).first();
        if (!asset) return reply({ error: '미디어를 찾을 수 없습니다.' }, 404);
        await env.STORAGE.delete(asset.object_key);
        await env.DB.prepare('DELETE FROM media_assets WHERE id = ?').bind(asset.id).run();
        await writeAudit(env.DB, admin.id, CMS_AUDIT_ACTIONS.mediaDelete, `${asset.site_id}/${asset.id}`, asset.filename);
        return reply({ ok: true });
      }

      if (request.method === 'GET' && url.pathname === '/api/cms/pages') {
        const denied = requirePermission(admin, AUTH_PERMISSIONS.CMS_READ, reply);
        if (denied) return denied;
        const siteId = String(url.searchParams.get('site') || '').toLowerCase();
        if (siteId && !CMS_SITE_IDS.includes(siteId)) return reply({ error: '관리 대상 EKODI 사이트가 아닙니다.' }, 400);
        const result = siteId
          ? await env.DB.prepare('SELECT * FROM cms_pages WHERE site_id = ? ORDER BY updated_at DESC').bind(siteId).all()
          : await env.DB.prepare('SELECT * FROM cms_pages ORDER BY site_id, updated_at DESC').all();
        return reply({ pages: result.results.map(cmsPageRecord) });
      }

      if (request.method === 'POST' && url.pathname === '/api/cms/pages') {
        const denied = requirePermission(admin, AUTH_PERMISSIONS.CMS_WRITE, reply);
        if (denied) return denied;
        const validated = validateCmsPage(await readBody(request));
        if (validated.error) return reply({ error: validated.error }, 400);
        const page = validated.value;
        const now = new Date().toISOString();
        try {
          const result = await env.DB.prepare(`INSERT INTO cms_pages
            (site_id, slug, title, summary, draft_content, data_classification, status, version, created_at, updated_at, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?, ?)`)
            .bind(page.siteId, page.slug, page.title, page.summary, page.content, page.classification, now, now, admin.id).run();
          await env.DB.prepare(`INSERT INTO cms_revisions
            (page_id, version, title, summary, content, event, created_at, created_by)
            VALUES (?, 1, ?, ?, ?, 'created', ?, ?)`)
            .bind(result.meta.last_row_id, page.title, page.summary, page.content, now, admin.id).run();
          await writeAudit(env.DB, admin.id, CMS_AUDIT_ACTIONS.create, cmsResource(page.siteId, page.slug));
          const created = await env.DB.prepare('SELECT * FROM cms_pages WHERE id = ?').bind(result.meta.last_row_id).first();
          return reply({ page: cmsPageRecord(created) }, 201);
        } catch (error) {
          if (isUniqueConstraintError(error)) return reply({ error: '같은 사이트에 동일한 슬러그가 이미 있습니다.' }, 409);
          throw error;
        }
      }

      const pageMatch = url.pathname.match(/^\/api\/cms\/pages\/(\d+)(?:\/(publish|revisions))?$/);
      if (pageMatch) {
        const pageId = Number(pageMatch[1]);
        const action = pageMatch[2] || null;
        const existing = await env.DB.prepare('SELECT * FROM cms_pages WHERE id = ?').bind(pageId).first();
        if (!existing) return reply({ error: '콘텐츠를 찾을 수 없습니다.' }, 404);

        if (request.method === 'GET' && action === 'revisions') {
          const denied = requirePermission(admin, AUTH_PERMISSIONS.CMS_READ, reply);
          if (denied) return denied;
          const result = await env.DB.prepare(`SELECT version, title, summary, content, event, created_at, created_by
            FROM cms_revisions WHERE page_id = ? ORDER BY version DESC, id DESC LIMIT 50`).bind(pageId).all();
          return reply({ revisions: result.results.map(row => ({
            version: row.version, title: row.title, summary: row.summary, content: row.content,
            event: row.event, createdAt: row.created_at, createdBy: row.created_by
          })) });
        }

        if (request.method === 'PUT' && !action) {
          const denied = requirePermission(admin, AUTH_PERMISSIONS.CMS_WRITE, reply);
          if (denied) return denied;
          const validated = validateCmsPage(await readBody(request), { partial: true });
          if (validated.error) return reply({ error: validated.error }, 400);
          const update = validated.value;
          if (update.version !== existing.version) return reply({ error: '다른 관리자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.' }, 409);
          const nextVersion = existing.version + 1;
          const now = new Date().toISOString();
          const title = update.title ?? existing.title;
          const summary = update.summary ?? existing.summary;
          const content = update.content ?? existing.draft_content;
          const classification = update.classification ?? existing.data_classification ?? 'public';
          const result = await env.DB.prepare(`UPDATE cms_pages SET title = ?, summary = ?, draft_content = ?,
            data_classification = ?, status = 'draft', version = ?, updated_at = ?, updated_by = ? WHERE id = ? AND version = ?`)
            .bind(title, summary, content, classification, nextVersion, now, admin.id, pageId, existing.version).run();
          if (!result.meta.changes) return reply({ error: '콘텐츠 버전이 변경되었습니다. 새로고침 후 다시 시도해 주세요.' }, 409);
          await env.DB.prepare(`INSERT INTO cms_revisions
            (page_id, version, title, summary, content, event, created_at, created_by)
            VALUES (?, ?, ?, ?, ?, 'saved', ?, ?)`)
            .bind(pageId, nextVersion, title, summary, content, now, admin.id).run();
          await writeAudit(env.DB, admin.id, CMS_AUDIT_ACTIONS.save, cmsResource(existing.site_id, existing.slug), `v${nextVersion}`);
          const saved = await env.DB.prepare('SELECT * FROM cms_pages WHERE id = ?').bind(pageId).first();
          return reply({ page: cmsPageRecord(saved) });
        }

        if (request.method === 'POST' && action === 'publish') {
          const denied = requirePermission(admin, AUTH_PERMISSIONS.CMS_PUBLISH, reply);
          if (denied) return denied;
          if ((existing.data_classification || 'public') !== 'public') {
            return reply({ error: '내부·기밀·제한 콘텐츠는 공개 게시할 수 없습니다. 공개 등급으로 변경한 뒤 게시해 주세요.' }, 409);
          }
          const now = new Date().toISOString();
          const nextVersion = existing.version + 1;
          await env.DB.prepare(`UPDATE cms_pages SET published_content = draft_content, status = 'published',
            version = ?, published_at = ?, updated_at = ?, updated_by = ? WHERE id = ?`)
            .bind(nextVersion, now, now, admin.id, pageId).run();
          await env.DB.prepare(`INSERT INTO cms_revisions
            (page_id, version, title, summary, content, event, created_at, created_by)
            VALUES (?, ?, ?, ?, ?, 'published', ?, ?)`)
            .bind(pageId, nextVersion, existing.title, existing.summary, existing.draft_content, now, admin.id).run();
          await writeAudit(env.DB, admin.id, CMS_AUDIT_ACTIONS.publish, cmsResource(existing.site_id, existing.slug), `v${nextVersion}`);
          const published = await env.DB.prepare('SELECT * FROM cms_pages WHERE id = ?').bind(pageId).first();
          return reply({ page: cmsPageRecord(published) });
        }
      }
    }

    if (url.pathname.startsWith('/api/registry')) {
      const admin = await authenticate(request, env.DB);
      if (!admin) return reply({ error: '관리자 인증이 필요합니다.' }, 401);
      const seed = env.DB.prepare(`INSERT OR IGNORE INTO domain_registry
        (domain, registrar, auto_renew, transfer_lock, whois_privacy, reminder_days, memo, updated_at)
        VALUES (?, '도메인클럽', 0, 1, 1, 60, '', ?)`);
      await env.DB.batch(EKODI_DOMAINS.map(item => seed.bind(item.name, new Date().toISOString())));
      if (request.method === 'GET' && url.pathname === '/api/registry') {
        const denied = requirePermission(admin, AUTH_PERMISSIONS.DOMAINS_READ, reply);
        if (denied) return denied;
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
        const denied = requirePermission(admin, AUTH_PERMISSIONS.DOMAINS_WRITE, reply);
        if (denied) return denied;
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
      const denied = requirePermission(admin, AUTH_PERMISSIONS.AUDIT_READ, reply);
      if (denied) return denied;
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
          const denied = requirePermission(admin, AUTH_PERMISSIONS.DOMAINS_READ, reply);
          if (denied) return denied;
          const zones = await cfApi<CloudflareZone[]>(env, '/zones?per_page=50');
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
            const denied = requirePermission(admin, AUTH_PERMISSIONS.DNS_READ, reply);
            if (denied) return denied;
            const records = await cfApi(env, `/zones/${zoneId}/dns_records?per_page=100`);
            return reply({ records });
          }
          if (request.method === 'POST' && !recordId) {
            const denied = requirePermission(admin, AUTH_PERMISSIONS.DNS_WRITE, reply);
            if (denied) return denied;
            const validated = validateDnsRecord(await readBody(request));
            if (validated.error) return reply({ error: validated.error }, 400);
            const record = await cfApi(env, `/zones/${zoneId}/dns_records`, { method: 'POST', body: JSON.stringify(validated.value) });
            await writeAudit(env.DB, admin.id, 'dns.create', zone.name, JSON.stringify({ type: validated.value.type, name: validated.value.name }));
            return reply({ record }, 201);
          }
          if (request.method === 'PUT' && recordId) {
            const denied = requirePermission(admin, AUTH_PERMISSIONS.DNS_WRITE, reply);
            if (denied) return denied;
            const validated = validateDnsRecord(await readBody(request));
            if (validated.error) return reply({ error: validated.error }, 400);
            const record = await cfApi(env, `/zones/${zoneId}/dns_records/${recordId}`, { method: 'PUT', body: JSON.stringify(validated.value) });
            await writeAudit(env.DB, admin.id, 'dns.update', zone.name, JSON.stringify({ type: validated.value.type, name: validated.value.name }));
            return reply({ record });
          }
          if (request.method === 'DELETE' && recordId) {
            const denied = requirePermission(admin, AUTH_PERMISSIONS.DNS_WRITE, reply);
            if (denied) return denied;
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
      const token = readBearerToken(request.headers);
      const admin = await authenticate(request, env.DB);
      if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
      if (admin) await writeAudit(env.DB, admin.id, 'session.logout', 'platform');
      return reply({ ok: true });
    }

    return reply({ error: 'Not found' }, 404);
  }
};

export const app = new Hono();
app.all('*', context => worker.fetch(context.req.raw, context.env));

export default app;
