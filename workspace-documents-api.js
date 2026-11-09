// 사이트 공통 관리자 문서함 API (Control API, D1 ekodi-auth + private R2 ekodi-storage).
//
// 에코디의 각 운영공간(에코디선교회 ekodimission, 청계면상인회 cgma 등)이 통장사본·고유번호증·
// 사업자등록증 같은 발급서류와 공식 문서를 사이트별로 분리 보관하고, 나중에 검색해서 내려받습니다.
//
//   GET  /api/workspace-documents/{tenant}                 목록 (?q=검색어&type=종류)
//   POST /api/workspace-documents/{tenant}                 등록 (multipart: file 선택 · sourceUrl 선택, 둘 중 하나 필수)
//   GET  /api/workspace-documents/{tenant}/{id}/file       원본 파일 내려받기(관리자 전용, 감사기록)
//   POST /api/workspace-documents/{tenant}/{id}/archive    보관해제(물리 삭제 없음)
//   POST /api/workspace-documents/{tenant}/{id}/share      공유 링크 발급 ({days:1~30}, 기본 7일)
//   POST /api/workspace-documents/{tenant}/{id}/unshare    해당 문서의 공유 링크 모두 회수
//   GET  /api/workspace-documents/{tenant}/{id}/events     문서 이력(등록·열람·공유·회수·보관해제)
//   GET  /api/workspace-documents/shared/{token}           공유 링크로 받기(로그인 없음, 만료·회수 확인, 감사기록)
//
// Invariants
// - 테넌트 권한은 서버에서 resolveTenantAccessAuthority로 확인합니다(사이트 관리자·플랫폼 최고관리자만).
// - 모든 조회·쓰기는 tenant_slug로 격리됩니다. 다른 사이트의 문서는 id를 알아도 열 수 없습니다.
// - 원본 파일은 비공개 R2 키 workspace/{tenant}/documents/ 아래에만 두고, 이 API를 통해서만 내려받습니다.
// - 계좌번호 같은 민감 값은 파일 안에만 두고 공개 저장소(마이그레이션)에 적지 않습니다.
import { resolveTenantAccessAuthority } from './tenant-access-authority.js';

export const WORKSPACE_DOCUMENTS_PREFIX = '/api/workspace-documents';
export const WORKSPACE_DOCUMENT_TYPES = Object.freeze(['통장사본', '고유번호증', '사업자등록증', '신분증', '이력서', '정관·규약', '회의록', '인감·직인', '증명서', '계약·협약', '기타']);
export const WORKSPACE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const MIME = new Map([['application/pdf', 'pdf'], ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']]);
const ALLOWED_ORIGIN = 'https://ekodi.kr';
const TENANT_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;
const ID_RE = /^wdoc-[0-9a-f-]{36}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;
export const SHARE_DEFAULT_DAYS = 7;
export const SHARE_MAX_DAYS = 30;
// 신분증처럼 개인 식별정보가 담긴 서류는 공유 링크를 최대 1일로 제한합니다.
export const SENSITIVE_SHARE_TYPES = Object.freeze(new Set(['신분증']));
// 관리자 주소의 사이트 경로 ↔ customer_tenants.slug (문서는 항상 정본 slug로 저장).
export const PATH_TENANT_ALIASES = Object.freeze({ ekodibiz: 'ekodi-biz', ekodichurch: 'ekodi-church', ekodilab: 'ekodi-lab' });
export const canonicalTenant = value => PATH_TENANT_ALIASES[value] || value;
export const tenantAdminPath = slug => `/${(Object.entries(PATH_TENANT_ALIASES).find(([, v]) => v === slug)?.[0]) || slug}/admin${slug === 'ekodi-church' ? '' : '/documents'}`;
const RESERVED_TENANTS = new Set(['shared', 'overview']);
// 최고관리자 현황판에서 사이트마다 갖춰졌는지 확인하는 기본 서류 묶음.
export const OVERVIEW_REQUIRED = Object.freeze([
  ['bank', '통장사본', ['통장사본']],
  ['registration', '고유번호·사업자등록', ['고유번호증', '사업자등록증']],
  ['id', '대표자 신분증', ['신분증']],
  ['resume', '대표자 이력서', ['이력서']],
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-ekodi-route': 'workspace-documents',
  } });
}
const fail = (code, error, status = 400) => json({ ok: false, code, error }, status);
export const cleanText = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const storage = env => env?.WORKSPACE_DOCUMENT_FILES || env?.LIVE_RECORDINGS_BUCKET || null;
export const documentKeyPrefix = tenant => `workspace/${tenant}/documents/`;

export function isWorkspaceDocumentsPath(pathname) {
  return pathname === WORKSPACE_DOCUMENTS_PREFIX || pathname.startsWith(WORKSPACE_DOCUMENTS_PREFIX + '/');
}

export function magicMatches(bytes, mime) {
  const b = new Uint8Array(bytes.slice(0, 12));
  if (mime === 'application/pdf') return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  if (mime === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (mime === 'image/webp') return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  return false;
}

export function safeSourceUrl(value) {
  const text = cleanText(value, 600);
  if (!text) return '';
  try { const url = new URL(text); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}

// 종류·명의(holder)별로 가장 최근 발급분을 '최근서류'로 표시합니다.
export function latestDocumentIds(rows) {
  const seen = new Map();
  for (const row of rows) {
    const key = `${row.doc_type}\u0000${row.holder || ''}`;
    const rank = `${row.issued_on || ''}|${row.created_at || ''}`;
    const prev = seen.get(key);
    if (!prev || rank > prev.rank) seen.set(key, { id: row.id, rank });
  }
  return new Set([...seen.values()].map(v => v.id));
}

function publicRow(row, latest) {
  return { id: row.id, type: row.doc_type, title: row.title, holder: row.holder, issuedOn: row.issued_on, note: row.note,
    sourceUrl: row.source_url || '', hasFile: Boolean(row.file_key), fileName: row.file_name || '', contentType: row.content_type || '',
    size: Number(row.size_bytes || 0), uploadedBy: row.uploaded_by, createdAt: row.created_at, latest: latest.has(row.id) };
}

function sameOriginWrite(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== ALLOWED_ORIGIN) return false;
  const site = request.headers.get('sec-fetch-site');
  if (site && !['same-origin', 'none'].includes(site)) return false;
  return request.headers.get('x-ekodi-doc-request') === '1';
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function audit(env, actor, action, tenant, id, detail) {
  try {
    await env.DB.prepare('INSERT INTO workspace_document_events (id,tenant_slug,document_id,action,actor,detail,created_at) VALUES (?,?,?,?,?,?,?)')
      .bind('wdev-' + crypto.randomUUID(), tenant, id, action, actor, cleanText(detail, 200), new Date().toISOString()).run();
  } catch { /* 감사기록 실패가 본 처리를 막지 않지만, 테이블은 마이그레이션으로 항상 존재해야 합니다. */ }
}

async function listDocuments(request, env, tenant) {
  const url = new URL(request.url);
  const q = cleanText(url.searchParams.get('q'), 60).replace(/[%_]/g, '');
  const type = cleanText(url.searchParams.get('type'), 40);
  const where = ["tenant_slug=?", "status='active'"]; const binds = [tenant];
  if (type && WORKSPACE_DOCUMENT_TYPES.includes(type)) { where.push('doc_type=?'); binds.push(type); }
  if (q) { const like = `%${q}%`; where.push('(title LIKE ? OR holder LIKE ? OR doc_type LIKE ? OR note LIKE ? OR file_name LIKE ?)'); binds.push(like, like, like, like, like); }
  const rows = (await env.DB.prepare(`SELECT * FROM workspace_documents WHERE ${where.join(' AND ')} ORDER BY doc_type ASC, holder ASC, issued_on DESC, created_at DESC LIMIT 500`).bind(...binds).all())?.results || [];
  const latest = latestDocumentIds(rows);
  return json({ ok: true, tenant, types: WORKSPACE_DOCUMENT_TYPES, documents: rows.map(row => publicRow(row, latest)) });
}

async function createDocument(request, env, tenant, actor) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > WORKSPACE_DOCUMENT_MAX_BYTES + 64 * 1024) return fail('FILE_TOO_LARGE', '파일은 10MB 이하만 올릴 수 있습니다.', 413);
  let form; try { form = await request.formData(); } catch { return fail('BAD_FORM', '등록 형식을 확인해 주세요.'); }
  const file = form.get('file');
  const hasFile = Boolean(file && typeof file.arrayBuffer === 'function' && file.size);
  const sourceUrl = safeSourceUrl(form.get('sourceUrl'));
  if (!hasFile && !sourceUrl) return fail('FILE_OR_LINK_REQUIRED', '파일을 선택하거나 https 링크를 입력해 주세요.');
  const typeInput = cleanText(form.get('type'), 40);
  const docType = WORKSPACE_DOCUMENT_TYPES.includes(typeInput) ? typeInput : '기타';
  const issuedInput = cleanText(form.get('issuedOn'), 10);
  const issuedOn = /^\d{4}-\d{2}-\d{2}$/.test(issuedInput) ? issuedInput : new Date().toISOString().slice(0, 10);
  const id = 'wdoc-' + crypto.randomUUID();
  let key = '', fileName = '', mime = '', size = 0, digest = '';
  if (hasFile) {
    const bucket = storage(env);
    if (!bucket) return fail('STORAGE_UNAVAILABLE', '문서 보관소가 아직 연결되지 않았습니다.', 503);
    mime = String(file.type || '').toLowerCase();
    if (!MIME.has(mime)) return fail('UNSUPPORTED_TYPE', 'PDF, JPG, PNG, WEBP 파일만 올릴 수 있습니다.', 415);
    if (file.size > WORKSPACE_DOCUMENT_MAX_BYTES) return fail('FILE_TOO_LARGE', '파일은 10MB 이하만 올릴 수 있습니다.', 413);
    const bytes = await file.arrayBuffer();
    if (!magicMatches(bytes, mime)) return fail('CONTENT_MISMATCH', '파일 내용이 형식과 맞지 않습니다.', 415);
    key = `${documentKeyPrefix(tenant)}${id}.${MIME.get(mime)}`;
    digest = await sha256Hex(bytes); size = bytes.byteLength;
    fileName = cleanText(file.name, 160).replace(/[\\/:*?"<>|]/g, '_') || `${docType}.${MIME.get(mime)}`;
    await bucket.put(key, bytes, { httpMetadata: { contentType: mime }, customMetadata: { tenant, kind: 'workspace-document', sha256: digest } });
  }
  const now = new Date().toISOString();
  try {
    await env.DB.prepare('INSERT INTO workspace_documents (id,tenant_slug,doc_type,title,holder,issued_on,note,source_url,file_key,file_name,content_type,size_bytes,sha256,status,uploaded_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id, tenant, docType, cleanText(form.get('title'), 200) || docType, cleanText(form.get('holder'), 80), issuedOn, cleanText(form.get('note'), 500), sourceUrl, key, fileName, mime, size, digest, 'active', actor, now, now).run();
  } catch (error) { if (key) await storage(env)?.delete(key).catch(() => {}); throw error; }
  await audit(env, actor, 'upload', tenant, id, `${docType} ${issuedOn}`);
  return json({ ok: true, id }, 201);
}

async function loadRow(env, tenant, id) {
  return env.DB.prepare("SELECT * FROM workspace_documents WHERE id=? AND tenant_slug=? AND status='active'").bind(id, tenant).first();
}

async function downloadDocument(env, tenant, id, actor) {
  const row = await loadRow(env, tenant, id);
  if (!row || !row.file_key || !String(row.file_key).startsWith(documentKeyPrefix(tenant))) return fail('NOT_FOUND', '파일이 있는 문서를 찾을 수 없습니다.', 404);
  const object = await storage(env)?.get(row.file_key);
  if (!object) return fail('NOT_FOUND', '문서 파일을 찾을 수 없습니다.', 404);
  await audit(env, actor, 'download', tenant, id, row.doc_type);
  return new Response(object.body, { status: 200, headers: {
    'content-type': row.content_type, 'cache-control': 'private, no-store, max-age=0', 'x-content-type-options': 'nosniff',
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
    'content-security-policy': "default-src 'none'; sandbox", 'referrer-policy': 'no-referrer',
  } });
}

async function archiveDocument(env, tenant, id, actor) {
  const result = await env.DB.prepare("UPDATE workspace_documents SET status='archived', updated_at=? WHERE id=? AND tenant_slug=? AND status='active'").bind(new Date().toISOString(), id, tenant).run();
  if (!Number(result?.meta?.changes || 0)) return fail('NOT_FOUND', '문서를 찾을 수 없습니다.', 404);
  await env.DB.prepare('UPDATE workspace_document_shares SET revoked_at=? WHERE tenant_slug=? AND document_id=? AND revoked_at IS NULL').bind(new Date().toISOString(), tenant, id).run();
  await audit(env, actor, 'archive', tenant, id, '');
  return json({ ok: true });
}

export function shareDays(value, docType = '') {
  if (SENSITIVE_SHARE_TYPES.has(docType)) return 1;
  const days = Math.floor(Number(value));
  if (!Number.isFinite(days) || days < 1) return SHARE_DEFAULT_DAYS;
  return Math.min(days, SHARE_MAX_DAYS);
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function tokenHash(token) { return sha256Hex(new TextEncoder().encode(token)); }

async function shareDocument(request, env, tenant, id, actor) {
  const row = await loadRow(env, tenant, id);
  if (!row) return fail('NOT_FOUND', '문서를 찾을 수 없습니다.', 404);
  if (!row.file_key && !row.source_url) return fail('NOTHING_TO_SHARE', '공유할 파일이나 링크가 없습니다.', 409);
  let body = {}; try { body = await request.json(); } catch { body = {}; }
  const days = shareDays(body?.days, row.doc_type);
  const token = randomToken();
  const now = new Date(); const expires = new Date(now.getTime() + days * 86400000);
  await env.DB.prepare('INSERT INTO workspace_document_shares (id,tenant_slug,document_id,token_hash,expires_at,revoked_at,created_by,created_at,access_count) VALUES (?,?,?,?,?,?,?,?,0)')
    .bind('wshr-' + crypto.randomUUID(), tenant, id, await tokenHash(token), expires.toISOString(), null, actor, now.toISOString()).run();
  await audit(env, actor, 'share', tenant, id, `${days}일`);
  return json({ ok: true, url: `${ALLOWED_ORIGIN}${WORKSPACE_DOCUMENTS_PREFIX}/shared/${token}`, expiresAt: expires.toISOString(), days }, 201);
}

async function unshareDocument(env, tenant, id, actor) {
  const result = await env.DB.prepare('UPDATE workspace_document_shares SET revoked_at=? WHERE tenant_slug=? AND document_id=? AND revoked_at IS NULL').bind(new Date().toISOString(), tenant, id).run();
  await audit(env, actor, 'unshare', tenant, id, `${Number(result?.meta?.changes || 0)}건`);
  return json({ ok: true, revoked: Number(result?.meta?.changes || 0) });
}

async function documentEvents(env, tenant, id) {
  const row = await env.DB.prepare('SELECT id FROM workspace_documents WHERE id=? AND tenant_slug=?').bind(id, tenant).first();
  if (!row) return fail('NOT_FOUND', '문서를 찾을 수 없습니다.', 404);
  const events = (await env.DB.prepare('SELECT action,actor,detail,created_at FROM workspace_document_events WHERE tenant_slug=? AND document_id=? ORDER BY created_at DESC LIMIT 200').bind(tenant, id).all())?.results || [];
  const shares = (await env.DB.prepare('SELECT expires_at,revoked_at,created_by,created_at,access_count FROM workspace_document_shares WHERE tenant_slug=? AND document_id=? ORDER BY created_at DESC LIMIT 50').bind(tenant, id).all())?.results || [];
  return json({ ok: true, events: events.map(e => ({ action: e.action, actor: e.actor, detail: e.detail, at: e.created_at })),
    shares: shares.map(x => ({ expiresAt: x.expires_at, revokedAt: x.revoked_at, createdBy: x.created_by, createdAt: x.created_at, accessCount: Number(x.access_count || 0) })) });
}

async function openShared(request, env, token) {
  if (!TOKEN_RE.test(token)) return fail('SHARE_NOT_FOUND', '공유 링크가 올바르지 않거나 만료되었습니다.', 404);
  const share = await env.DB.prepare('SELECT * FROM workspace_document_shares WHERE token_hash=?').bind(await tokenHash(token)).first();
  const now = new Date().toISOString();
  if (!share || share.revoked_at || String(share.expires_at) <= now) return fail('SHARE_NOT_FOUND', '공유 링크가 올바르지 않거나 만료되었습니다.', 404);
  const row = await loadRow(env, share.tenant_slug, share.document_id);
  if (!row) return fail('SHARE_NOT_FOUND', '공유 링크가 올바르지 않거나 만료되었습니다.', 404);
  await env.DB.prepare('UPDATE workspace_document_shares SET access_count=access_count+1 WHERE id=?').bind(share.id).run();
  await audit(env, 'share-link', 'shared-open', share.tenant_slug, row.id, '');
  if (!row.file_key) return Response.redirect(row.source_url, 302);
  const object = await storage(env)?.get(row.file_key);
  if (!object) return fail('NOT_FOUND', '문서 파일을 찾을 수 없습니다.', 404);
  return new Response(object.body, { status: 200, headers: {
    'content-type': row.content_type, 'cache-control': 'private, no-store, max-age=0', 'x-content-type-options': 'nosniff',
    'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
    'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox", 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow',
  } });
}

// 최고관리자 전용: 모든 운영공간의 문서함 현황(파일 내용·링크 없이 개수·갖춤 여부·최근 이력만).
export function buildOverview(tenants, docs, shares, events, church = null) {
  const now = new Date().toISOString();
  const byTenant = new Map(tenants.map(t => [t.slug, { slug: t.slug, name: t.name, adminPath: tenantAdminPath(t.slug), total: 0, types: {}, lastAt: '', activeShares: 0, required: {} }]));
  for (const d of docs) {
    const row = byTenant.get(d.tenant_slug); if (!row) continue;
    row.total += 1; row.types[d.doc_type] = (row.types[d.doc_type] || 0) + 1;
    if (String(d.created_at) > row.lastAt) row.lastAt = d.created_at;
  }
  for (const x of shares) { const row = byTenant.get(x.tenant_slug); if (row && !x.revoked_at && String(x.expires_at) > now) row.activeShares += 1; }
  for (const row of byTenant.values()) for (const [key, , types] of OVERVIEW_REQUIRED) row.required[key] = types.some(t => row.types[t] > 0);
  const sites = [...byTenant.values()];
  if (church) { const c = sites.find(s => s.slug === 'ekodi-church'); if (c) { c.separateArchive = church; } }
  const complete = sites.filter(s => OVERVIEW_REQUIRED.every(([k]) => s.required[k])).length;
  return { sites, required: OVERVIEW_REQUIRED.map(([key, label]) => ({ key, label })), totals: { sites: sites.length, documents: docs.length, complete, activeShares: sites.reduce((n, s) => n + s.activeShares, 0) },
    recent: events.map(e => ({ tenant: e.tenant_slug, action: e.action, actor: e.actor, detail: e.detail, at: e.created_at })) };
}

async function overview(env) {
  const tenants = (await env.DB.prepare("SELECT slug, name FROM customer_tenants WHERE status='active' ORDER BY name").all())?.results || [];
  const docs = (await env.DB.prepare("SELECT tenant_slug, doc_type, created_at FROM workspace_documents WHERE status='active'").all())?.results || [];
  const shares = (await env.DB.prepare('SELECT tenant_slug, expires_at, revoked_at FROM workspace_document_shares WHERE revoked_at IS NULL').all())?.results || [];
  const events = (await env.DB.prepare('SELECT tenant_slug, action, actor, detail, created_at FROM workspace_document_events ORDER BY created_at DESC LIMIT 30').all())?.results || [];
  let church = null;
  try { const c = await env.DB.prepare("SELECT count(*) AS n FROM church_documents WHERE status='active'").first(); church = { documents: Number(c?.n || 0), path: '/ekodichurch/admin' }; } catch { church = null; }
  return json({ ok: true, ...buildOverview(tenants, docs, shares, events, church) });
}

export async function handleWorkspaceDocuments(request, env, options = {}) {
  const url = new URL(request.url);
  if (!isWorkspaceDocumentsPath(url.pathname)) return null;
  if (!env?.DB) return fail('STORAGE_UNAVAILABLE', '문서함 저장소를 사용할 수 없습니다.', 503);
  const parts = url.pathname.slice(WORKSPACE_DOCUMENTS_PREFIX.length).split('/').filter(Boolean);
  if (parts[0] === 'shared') {
    if (request.method !== 'GET' || parts.length !== 2) return fail('METHOD_NOT_ALLOWED', '허용되지 않은 요청입니다.', 405);
    try { return await openShared(request, env, parts[1]); }
    catch (error) { console.error('[workspace-documents] shared open failed', error?.name || 'Error'); return fail('UNAVAILABLE', '일시적인 오류입니다.', 503); }
  }
  if (parts[0] === 'overview') {
    if (request.method !== 'GET' || parts.length !== 1) return fail('METHOD_NOT_ALLOWED', '허용되지 않은 요청입니다.', 405);
    try {
      const resolve = options.resolveAuthority || resolveTenantAccessAuthority;
      const authority = await resolve(request, env, { tenantSlug: '' });
      if (!authority?.ok || authority.scope !== 'platform') return fail(authority?.status === 401 ? 'ADMIN_LOGIN_REQUIRED' : 'PLATFORM_ADMIN_REQUIRED', '최고관리자만 전체 현황을 볼 수 있습니다.', authority?.status === 401 ? 401 : 403);
      return await overview(env);
    } catch (error) { console.error('[workspace-documents] overview failed', error?.name || 'Error'); return fail('UNAVAILABLE', '일시적인 오류입니다.', 503); }
  }
  const tenant = canonicalTenant(String(parts[0] || '').toLowerCase());
  if (!TENANT_RE.test(tenant) || RESERVED_TENANTS.has(tenant)) return fail('TENANT_REQUIRED', '사이트를 확인해 주세요.', 404);
  const method = request.method;
  try {
    if (!['GET', 'HEAD'].includes(method) && !sameOriginWrite(request)) return fail('ORIGIN_FORBIDDEN', '허용되지 않은 요청 출처입니다.', 403);
    const resolve = options.resolveAuthority || resolveTenantAccessAuthority;
    const authority = await resolve(request, env, { tenantSlug: tenant });
    if (!authority?.ok) {
      const status = authority?.status === 401 ? 401 : (authority?.status === 404 ? 404 : 403);
      return fail(status === 401 ? 'ADMIN_LOGIN_REQUIRED' : 'ADMIN_FORBIDDEN', status === 401 ? '관리자 로그인이 필요합니다.' : '이 사이트 문서함 권한이 없습니다.', status);
    }
    if (!['platform', 'tenant', 'tenant-delegated'].includes(authority.scope)) return fail('ADMIN_FORBIDDEN', '이 사이트 문서함 권한이 없습니다.', 403);
    const actor = String(authority.email || '').toLowerCase();
    if (parts.length === 1) {
      if (method === 'GET') return listDocuments(request, env, tenant);
      if (method === 'POST') return createDocument(request, env, tenant, actor);
      return fail('METHOD_NOT_ALLOWED', '허용되지 않은 요청입니다.', 405);
    }
    if (parts.length === 3 && ID_RE.test(parts[1])) {
      if (parts[2] === 'file' && method === 'GET') return downloadDocument(env, tenant, parts[1], actor);
      if (parts[2] === 'archive' && method === 'POST') return archiveDocument(env, tenant, parts[1], actor);
      if (parts[2] === 'share' && method === 'POST') return shareDocument(request, env, tenant, parts[1], actor);
      if (parts[2] === 'unshare' && method === 'POST') return unshareDocument(env, tenant, parts[1], actor);
      if (parts[2] === 'events' && method === 'GET') return documentEvents(env, tenant, parts[1]);
    }
    return fail('NOT_FOUND', '요청한 기능이 없습니다.', 404);
  } catch (error) {
    console.error('[workspace-documents] operation failed', error?.name || 'Error');
    return fail('UNAVAILABLE', '일시적인 오류로 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.', 503);
  }
}
