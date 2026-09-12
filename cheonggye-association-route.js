import authWorker from './auth-worker.js';
import { cheonggyeAssociationPage, cheonggyeAssociationScript } from './cheonggye-association-page.js';

const CGMA_PAGE_PATHS = new Set(['/cgma','/cgma/','/cgma/notice','/cgma/campaigns','/cgma/stores','/cgma/proposal']);
const API_PREFIX = '/cgma-community-api';
const LEGACY_PUBLIC_PREFIX = '/api/cheonggye';
const VALID_UPDATE_TYPES = new Set(['notice','campaign','contest','store']);
const VALID_FEEDBACK_TYPES = new Set(['proposal','store','campaign','question']);
const VALID_FEEDBACK_STATUS = new Set(['new','reviewing','resolved','hidden']);
const ADMIN_ORIGINS = new Set(['https://admin.ekodi.kr','https://ekodi.kr']);
const PUBLIC_ORIGINS = new Set(['https://admin.ekodi.kr','https://ekodi.kr','https://cgma.or.kr','https://www.cgma.or.kr']);

function json(data, status = 200, request) {
  const origin = request ? String(request.headers.get('origin') || '') : '';
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  if (PUBLIC_ORIGINS.has(origin)) {
    headers.set('access-control-allow-origin', origin); headers.set('vary', 'Origin'); headers.set('access-control-allow-credentials', 'true');
  }
  return new Response(JSON.stringify(data), { status, headers });
}
function options(request) {
  const origin = String(request.headers.get('origin') || '');
  const headers = new Headers({ 'access-control-allow-methods': 'GET,POST,PUT,OPTIONS', 'access-control-allow-headers': 'content-type,authorization', 'access-control-max-age': '600', 'cache-control': 'no-store' });
  if (PUBLIC_ORIGINS.has(origin)) {
    headers.set('access-control-allow-origin', origin); headers.set('vary', 'Origin'); headers.set('access-control-allow-credentials', 'true');
  }
  return new Response(null, { status: 204, headers });
}
function id(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`; }
function clean(value, limit = 500) { return String(value || '').trim().slice(0, limit); }
async function readBody(request) { try { return await request.json(); } catch { return null; } }
function publicPath(url, suffix) { return url.pathname === `${API_PREFIX}${suffix}` || url.pathname === `${LEGACY_PUBLIC_PREFIX}${suffix}`; }
async function ensureSchema(env) {
  if (!env?.DB) return false;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS cheonggye_community_updates (id TEXT PRIMARY KEY,type TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,store_name TEXT NOT NULL DEFAULT '',event_date TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'public',is_pinned INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS cheonggye_community_feedback (id TEXT PRIMARY KEY,type TEXT NOT NULL,name TEXT NOT NULL,contact TEXT NOT NULL DEFAULT '',title TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'new',created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`)
  ]);
  const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM cheonggye_community_updates').first();
  if (!Number(count?.count || 0)) {
    const now = new Date().toISOString();
    const insert = env.DB.prepare(`INSERT INTO cheonggye_community_updates (id,type,title,body,store_name,event_date,status,is_pinned,created_at,updated_at) VALUES (?, ?, ?, ?, '', '', 'public', ?, ?, ?)`);
    await env.DB.batch([
      insert.bind('welcome','notice','청계면상인회 소통 홈페이지 준비 중','목포대 후문 상권과 청계면 상권 활성화를 위해 상인회 소식, 캠페인, 공모전, 제안 접수를 한곳에서 안내합니다.',1,now,now),
      insert.bind('campaign-cleanup','campaign','거리청소 캠페인 안내','상가 주변 환경개선을 위해 월 1회 거리청소 캠페인을 이어갑니다. 함께 참여해 깨끗하고 활기찬 상권을 만들어 갑니다.',1,now,now),
      insert.bind('shorts-contest','contest','목포대 학생 인스타 숏츠 공모전','정회원 상가 홍보와 목포대 후문 상권 활성화를 위해 학생 숏폼 콘텐츠 공모전을 운영합니다.',0,now,now)
    ]);
  }
  return true;
}
function updateRow(row) { return { id:row.id, type:row.type, title:row.title, body:row.body, storeName:row.store_name || '', eventDate:row.event_date || '', status:row.status, isPinned:Boolean(row.is_pinned), createdAt:row.created_at, updatedAt:row.updated_at }; }
function feedbackRow(row) { return { id:row.id, type:row.type, name:row.name, contact:row.contact || '', title:row.title, body:row.body, status:row.status, createdAt:row.created_at, updatedAt:row.updated_at }; }
async function listUpdates(env, includeHidden = false) { await ensureSchema(env); const where = includeHidden ? '' : "WHERE status = 'public'"; const rows = await env.DB.prepare(`SELECT * FROM cheonggye_community_updates ${where} ORDER BY is_pinned DESC, updated_at DESC LIMIT 100`).all(); return (rows.results || []).map(updateRow); }
async function listFeedback(env) { await ensureSchema(env); const rows = await env.DB.prepare('SELECT * FROM cheonggye_community_feedback ORDER BY created_at DESC LIMIT 200').all(); return (rows.results || []).map(feedbackRow); }
async function publicApi(request, env, url) {
  if (!await ensureSchema(env)) return json({ error:'데이터 저장소가 연결되지 않았습니다.' }, 503, request);
  if (request.method === 'GET' && publicPath(url, '/updates')) return json({ updates: await listUpdates(env, false) }, 200, request);
  if (request.method === 'POST' && publicPath(url, '/feedback')) {
    const body = await readBody(request); if (!body || typeof body !== 'object') return json({ error:'접수 형식을 확인해 주세요.' }, 400, request);
    const type = VALID_FEEDBACK_TYPES.has(clean(body.type, 20)) ? clean(body.type, 20) : 'proposal';
    const name = clean(body.name, 80); const title = clean(body.title, 120); const text = clean(body.body, 1200);
    if (!name || !title || !text) return json({ error:'이름, 제목, 내용을 입력해 주세요.' }, 400, request);
    const now = new Date().toISOString(); const itemId = id('fb');
    await env.DB.prepare(`INSERT INTO cheonggye_community_feedback (id,type,name,contact,title,body,status,created_at,updated_at) VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?)`).bind(itemId, type, name, clean(body.contact, 120), title, text, now, now).run();
    return json({ ok:true, id:itemId }, 201, request);
  }
  return null;
}
async function authorizedAdmin(request, env) {
  const origin = String(request.headers.get('origin') || '');
  if (origin && !ADMIN_ORIGINS.has(origin)) return false;
  const token = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  const sessionUrl = new URL(request.url);
  sessionUrl.hostname = 'api.ekodi.kr';
  sessionUrl.pathname = '/api/session';
  sessionUrl.search = '';
  const sessionRequest = new Request(sessionUrl.toString(), { method:'GET', headers:request.headers });
  const response = await authWorker.fetch(sessionRequest, env);
  if (!response.ok) return false;
  const session = await response.json().catch(() => null);
  return Boolean(session?.email && (session?.isSuperAdmin || session?.role || Array.isArray(session?.roles)));
}
async function adminApi(request, env, url) {
  if (!await authorizedAdmin(request, env)) return json({ error:'관리자 인증이 필요합니다.' }, 401, request);
  if (!await ensureSchema(env)) return json({ error:'데이터 저장소가 연결되지 않았습니다.' }, 503, request);
  if (request.method === 'GET' && url.pathname === `${API_PREFIX}/admin/updates`) return json({ updates: await listUpdates(env, true) }, 200, request);
  if (request.method === 'POST' && url.pathname === `${API_PREFIX}/admin/updates`) {
    const body = await readBody(request); const type = VALID_UPDATE_TYPES.has(clean(body?.type, 20)) ? clean(body.type, 20) : 'notice';
    const title = clean(body?.title, 120); const text = clean(body?.body, 1200); if (!title || !text) return json({ error:'제목과 내용을 입력해 주세요.' }, 400, request);
    const now = new Date().toISOString(); const itemId = id('up');
    await env.DB.prepare(`INSERT INTO cheonggye_community_updates (id,type,title,body,store_name,event_date,status,is_pinned,created_at,updated_at) VALUES (?, ?, ?, ?, ?, ?, 'public', ?, ?, ?)`).bind(itemId, type, title, text, clean(body?.storeName, 120), clean(body?.eventDate, 40), body?.isPinned ? 1 : 0, now, now).run();
    return json({ ok:true, id:itemId, updates: await listUpdates(env, true) }, 201, request);
  }
  const updateMatch = url.pathname.match(/^\/cgma-community-api\/admin\/updates\/([^/]+)$/);
  if (updateMatch && request.method === 'PUT') {
    const body = await readBody(request) || {}; const current = await env.DB.prepare('SELECT * FROM cheonggye_community_updates WHERE id = ?').bind(decodeURIComponent(updateMatch[1])).first();
    if (!current) return json({ error:'소식을 찾지 못했습니다.' }, 404, request);
    const nextStatus = clean(body.status, 20) || current.status; const nextPinned = body.togglePinned ? (current.is_pinned ? 0 : 1) : (body.isPinned === undefined ? current.is_pinned : (body.isPinned ? 1 : 0));
    await env.DB.prepare('UPDATE cheonggye_community_updates SET status = ?, is_pinned = ?, updated_at = ? WHERE id = ?').bind(nextStatus, nextPinned, new Date().toISOString(), current.id).run();
    return json({ ok:true, updates: await listUpdates(env, true) }, 200, request);
  }
  if (request.method === 'GET' && url.pathname === `${API_PREFIX}/admin/feedback`) return json({ feedback: await listFeedback(env) }, 200, request);
  const feedbackMatch = url.pathname.match(/^\/cgma-community-api\/admin\/feedback\/([^/]+)$/);
  if (feedbackMatch && request.method === 'PUT') {
    const body = await readBody(request) || {}; const status = VALID_FEEDBACK_STATUS.has(clean(body.status, 20)) ? clean(body.status, 20) : 'reviewing';
    await env.DB.prepare('UPDATE cheonggye_community_feedback SET status = ?, updated_at = ? WHERE id = ?').bind(status, new Date().toISOString(), decodeURIComponent(feedbackMatch[1])).run();
    return json({ ok:true, feedback: await listFeedback(env) }, 200, request);
  }
  return null;
}

export function isCheonggyeAssociationPath(pathname) { const path = String(pathname || '').replace(/\/+$/, '') || '/'; return CGMA_PAGE_PATHS.has(pathname) || CGMA_PAGE_PATHS.has(path) || path.startsWith('/cgma/'); }

export async function routeCheonggyeAssociation(request, env) {
  const url = new URL(request.url);
  if (url.pathname.startsWith(API_PREFIX) || url.pathname.startsWith(LEGACY_PUBLIC_PREFIX)) {
    if (request.method === 'OPTIONS') return options(request);
    if (url.pathname.startsWith(`${API_PREFIX}/admin/`)) { const admin = await adminApi(request, env, url); if (admin) return admin; }
    const pub = await publicApi(request, env, url); if (pub) return pub;
    return json({ error:'청계상권 소통 API 경로를 찾지 못했습니다.' }, 404, request);
  }
  if (!['GET','HEAD'].includes(request.method)) return null;
  if (url.pathname === '/cgma-association.js') return cheonggyeAssociationScript();
  if (isCheonggyeAssociationPath(url.pathname)) return cheonggyeAssociationPage();
  return null;
}
