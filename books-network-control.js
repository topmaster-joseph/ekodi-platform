import authWorker from './auth-worker.js';
import { principalFromCustomerSession, principalFromSupabaseRequest } from './ekodi-principal.js';

const PUBLIC_PREFIX = '/api/books/public/stores';
const ME_PREFIX = '/api/books/me';
const ADMIN_PREFIX = '/api/books/admin/network';
const TITLE_STATES = new Set(['DRAFT', 'SUBMITTED', 'PUBLISHED', 'REJECTED']);

// No direct moderation endpoint may create a new public edition without publisher-origin evidence.
export function requiresVerifiedPublisherHandoff(priorStatus, nextStatus) {
  return nextStatus === 'PUBLISHED' && priorStatus !== 'PUBLISHED';
}

// Submission requires a publisher-verified paid/chief author entitlement.
// The Books Network personal archive does not grant this editorial capability.
export function requiresVerifiedPublishingSubmission(nextStatus, priorStatus = '') {
  return nextStatus === 'SUBMITTED' && priorStatus !== 'SUBMITTED';
}

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function slugify(value) {
  return clean(value, 80).toLowerCase().replace(/[^a-z0-9가-힣-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
  return origin && allowed.includes(origin) ? origin : '';
}

function json(data, status, request, env) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  const origin = request ? allowedOrigin(request, env) : '';
  if (origin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-credentials', 'true');
    headers.set('vary', 'Origin');
  }
  return new Response(JSON.stringify(data), { status, headers });
}

async function body(request) {
  try { return await request.json(); } catch { return null; }
}

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS books_creator_stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      owner_email TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      logo_url TEXT NOT NULL DEFAULT '',
      theme TEXT NOT NULL DEFAULT 'paper',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_books_creator_stores_owner ON books_creator_stores(owner_email, updated_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS books_creator_titles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_email TEXT NOT NULL,
      store_id INTEGER,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      cover_image TEXT NOT NULL DEFAULT '',
      price_krw INTEGER NOT NULL DEFAULT 0,
      buy_url TEXT NOT NULL DEFAULT '',
      stage TEXT NOT NULL DEFAULT 'MANUSCRIPT',
      status TEXT NOT NULL DEFAULT 'DRAFT',
      admin_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (store_id) REFERENCES books_creator_stores(id) ON DELETE SET NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_books_creator_titles_owner ON books_creator_titles(owner_email, updated_at DESC)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_books_creator_titles_store_status ON books_creator_titles(store_id, status, updated_at DESC)`),
  ]);
}

async function session(request, env) {
  // Browser credentials are verified by their issuing backends; never trust a client-supplied email or role.
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return {
    response: json({ error:'EKODI 계정 로그인이 필요합니다.', code:'LOGIN_REQUIRED' },401,request,env)
  };
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  // Central admin identity stays separate; member identity cannot acquire admin permissions by matching an email.
  const response = await authWorker.fetch(new Request(url.toString(), { method:'GET', headers:request.headers }),env);
  if (response.ok) {
    const data = await response.json().catch(() => null);
    const email = clean(data?.email,160).toLowerCase();
    if (data?.authenticated && email) return { data, email, kind:'admin', personId:null };
  }
  const principal = await principalFromCustomerSession(request,env)
    || await principalFromSupabaseRequest(request);
  if (principal?.email) return {
    data:{authenticated:true},email:clean(principal.email,160).toLowerCase(),
    kind:'member',personId:principal.subject.type==='person'?principal.subject.key:null
  };
  return { response:json({error:'EKODI 계정 로그인이 필요합니다.',code:'LOGIN_REQUIRED'},401,request,env) };
}

async function isAdmin(env, auth) {
  if (auth.kind !== 'admin') return false;
  const row = await env.DB.prepare('SELECT id FROM admins WHERE lower(email) = ?').bind(auth.email).first();
  return Boolean(row?.id);
}

function storeRow(row) {
  return {
    id: Number(row.id), slug: row.slug, name: row.name, description: row.description,
    logoUrl: row.logo_url, theme: row.theme, status: row.status,
    url: `https://ekodi.kr/books/store/${encodeURIComponent(row.slug)}`,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function titleRow(row) {
  return {
    id: Number(row.id), storeId: row.store_id ? Number(row.store_id) : null,
    title: row.title, subtitle: row.subtitle, author: row.author, description: row.description,
    coverImage: row.cover_image, priceKrw: Number(row.price_krw || 0), buyUrl: row.buy_url,
    stage: row.stage, status: row.status, adminNote: row.admin_note || '',
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function publicStores(request, env) {
  const rows = await env.DB.prepare(`SELECT s.*, COUNT(t.id) AS title_count
    FROM books_creator_stores s
    LEFT JOIN books_creator_titles t ON t.store_id=s.id AND t.status='PUBLISHED'
    WHERE s.status='active'
    GROUP BY s.id ORDER BY s.updated_at DESC LIMIT 100`).all();
  return json({ stores: rows.results.map(row => ({ ...storeRow(row), titleCount: Number(row.title_count || 0) })) }, 200, request, env);
}

async function publicStore(request, env, slug) {
  const store = await env.DB.prepare(`SELECT * FROM books_creator_stores WHERE slug=? AND status='active'`).bind(slug).first();
  if (!store) return json({ error: '서점을 찾을 수 없습니다.' }, 404, request, env);
  const titles = await env.DB.prepare(`SELECT * FROM books_creator_titles WHERE store_id=? AND status='PUBLISHED' ORDER BY updated_at DESC`).bind(store.id).all();
  return json({ store: storeRow(store), books: titles.results.map(titleRow) }, 200, request, env);
}

async function mySnapshot(request, env, auth) {
  const [stores, titles] = await Promise.all([
    env.DB.prepare('SELECT * FROM books_creator_stores WHERE owner_email=? ORDER BY updated_at DESC').bind(auth.email).all(),
    env.DB.prepare('SELECT * FROM books_creator_titles WHERE owner_email=? ORDER BY updated_at DESC').bind(auth.email).all(),
  ]);
  return json({ account: { email: auth.email }, stores: stores.results.map(storeRow), books: titles.results.map(titleRow) }, 200, request, env);
}

async function createStore(request, env, auth) {
  const input = await body(request);
  const name = clean(input?.name, 120);
  const slug = slugify(input?.slug || name);
  if (!name || slug.length < 2) return json({ error: '서점 이름과 주소를 확인해 주세요.' }, 400, request, env);
  const exists = await env.DB.prepare('SELECT id FROM books_creator_stores WHERE slug=?').bind(slug).first();
  if (exists) return json({ error: '이미 사용 중인 서점 주소입니다.' }, 409, request, env);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO books_creator_stores(slug,owner_email,name,description,logo_url,theme,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,'active',?,?)`)
    .bind(slug, auth.email, name, clean(input?.description, 1200), clean(input?.logoUrl, 500), clean(input?.theme || 'paper', 30), now, now).run();
  const row = await env.DB.prepare('SELECT * FROM books_creator_stores WHERE slug=?').bind(slug).first();
  return json({ store: storeRow(row) }, 201, request, env);
}

async function updateStore(request, env, auth, slug) {
  const current = await env.DB.prepare('SELECT * FROM books_creator_stores WHERE slug=? AND owner_email=?').bind(slug, auth.email).first();
  if (!current) return json({ error: '본인이 운영하는 서점만 수정할 수 있습니다.' }, 404, request, env);
  const input = await body(request) || {};
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE books_creator_stores SET name=?,description=?,logo_url=?,theme=?,updated_at=? WHERE id=?`)
    .bind(clean(input.name ?? current.name, 120), clean(input.description ?? current.description, 1200), clean(input.logoUrl ?? current.logo_url, 500), clean(input.theme ?? current.theme, 30), now, current.id).run();
  return json({ store: storeRow(await env.DB.prepare('SELECT * FROM books_creator_stores WHERE id=?').bind(current.id).first()) }, 200, request, env);
}

async function createTitle(request, env, auth) {
  const input = await body(request);
  const title = clean(input?.title, 200);
  const author = clean(input?.author, 160);
  if (!title || !author) return json({ error: '책 제목과 저자명은 필수입니다.' }, 400, request, env);
  let storeId = null;
  if (input?.storeId) {
    const store = await env.DB.prepare('SELECT id FROM books_creator_stores WHERE id=? AND owner_email=?').bind(Number(input.storeId), auth.email).first();
    if (!store) return json({ error: '본인의 서점만 선택할 수 있습니다.' }, 403, request, env);
    storeId = store.id;
  }
  const now = new Date().toISOString();
  const requested = clean(input?.status, 20).toUpperCase();
  if (requiresVerifiedPublishingSubmission(requested)) return json({
    error: '출간 검토 신청은 출판사의 저자 자격·권한 검증 절차에서 진행해 주세요.',
    code: 'PUBLISHER_SUBMISSION_REQUIRED'
  }, 409, request, env);
  const status = 'DRAFT';
  const result = await env.DB.prepare(`INSERT INTO books_creator_titles(owner_email,store_id,title,subtitle,author,description,cover_image,price_krw,buy_url,stage,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(auth.email, storeId, title, clean(input?.subtitle, 240), author, clean(input?.description, 4000), clean(input?.coverImage, 500), Math.max(0, Math.trunc(Number(input?.priceKrw)||0)), clean(input?.buyUrl, 500), clean(input?.stage || 'MANUSCRIPT', 30).toUpperCase(), status, now, now).run();
  const row = await env.DB.prepare('SELECT * FROM books_creator_titles WHERE id=?').bind(result.meta?.last_row_id).first();
  return json({ book: titleRow(row) }, 201, request, env);
}

async function updateTitle(request, env, auth, id) {
  const current = await env.DB.prepare('SELECT * FROM books_creator_titles WHERE id=? AND owner_email=?').bind(id, auth.email).first();
  if (!current) return json({ error: '본인의 책만 수정할 수 있습니다.' }, 404, request, env);
  if (current.status === 'PUBLISHED') return json({ error: '출간된 책의 핵심 정보 변경은 관리자 검토가 필요합니다.' }, 409, request, env);
  const input = await body(request) || {};
  let storeId = current.store_id;
  if (input.storeId !== undefined) {
    if (!input.storeId) storeId = null;
    else {
      const store = await env.DB.prepare('SELECT id FROM books_creator_stores WHERE id=? AND owner_email=?').bind(Number(input.storeId), auth.email).first();
      if (!store) return json({ error: '본인의 서점만 선택할 수 있습니다.' }, 403, request, env);
      storeId = store.id;
    }
  }
  const requested = clean(input.status ?? current.status, 20).toUpperCase();
  if (requiresVerifiedPublishingSubmission(requested)) return json({
    error: '출간 검토 신청은 출판사의 저자 자격·권한 검증 절차에서 진행해 주세요.',
    code: 'PUBLISHER_SUBMISSION_REQUIRED'
  }, 409, request, env);
  const status = 'DRAFT';
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE books_creator_titles SET store_id=?,title=?,subtitle=?,author=?,description=?,cover_image=?,price_krw=?,buy_url=?,stage=?,status=?,admin_note='',updated_at=? WHERE id=?`)
    .bind(storeId, clean(input.title ?? current.title, 200), clean(input.subtitle ?? current.subtitle, 240), clean(input.author ?? current.author, 160), clean(input.description ?? current.description, 4000), clean(input.coverImage ?? current.cover_image, 500), Math.max(0, Math.trunc(Number(input.priceKrw ?? current.price_krw)||0)), clean(input.buyUrl ?? current.buy_url, 500), clean(input.stage ?? current.stage, 30).toUpperCase(), status, now, id).run();
  return json({ book: titleRow(await env.DB.prepare('SELECT * FROM books_creator_titles WHERE id=?').bind(id).first()) }, 200, request, env);
}

async function adminSnapshot(request, env, auth) {
  if (!(await isAdmin(env, auth))) return json({ error: '관리자 권한이 필요합니다.' }, 403, request, env);
  const [stores, titles] = await Promise.all([
    env.DB.prepare('SELECT * FROM books_creator_stores ORDER BY updated_at DESC LIMIT 200').all(),
    env.DB.prepare('SELECT * FROM books_creator_titles ORDER BY updated_at DESC LIMIT 500').all(),
  ]);
  return json({ stores: stores.results.map(storeRow), books: titles.results.map(titleRow) }, 200, request, env);
}

async function moderateTitle(request, env, auth, id) {
  if (!(await isAdmin(env, auth))) return json({ error: '관리자 권한이 필요합니다.' }, 403, request, env);
  const current = await env.DB.prepare('SELECT * FROM books_creator_titles WHERE id=?').bind(id).first();
  if (!current) return json({ error: '책을 찾을 수 없습니다.' }, 404, request, env);
  const input = await body(request) || {};
  const status = clean(input.status, 20).toUpperCase();
  if (!TITLE_STATES.has(status) || !['PUBLISHED','REJECTED','SUBMITTED'].includes(status)) return json({ error: '검토 상태가 올바르지 않습니다.' }, 400, request, env);
  // A Books Network moderation click is not a verified Publisher release receipt.
  // Existing PUBLISHED rows remain untouched, but a new public state requires
  // the independent Publisher contract, membership, edition and audio gates.
  if (requiresVerifiedPublishingSubmission(status, current.status)) {
    return json({
      error: '출간 심사 접수는 출판사의 검증된 저자·구독·계약 절차에서만 가능합니다.',
      code: 'PUBLISHER_SUBMISSION_REQUIRED'
    }, 409, request, env);
  }
  if (requiresVerifiedPublisherHandoff(current.status, status)) {
    return json({
      error: '판매 공개는 출판사의 검증된 판본·저자 계약·구독 자격·오디오북 검수 및 공식 인계 이후에만 가능합니다.',
      code: 'PUBLISHER_HANDOFF_REQUIRED'
    }, 409, request, env);
  }
  await env.DB.prepare('UPDATE books_creator_titles SET status=?,admin_note=?,updated_at=? WHERE id=?')
    .bind(status, clean(input.adminNote, 1000), new Date().toISOString(), id).run();
  return json({ book: titleRow(await env.DB.prepare('SELECT * FROM books_creator_titles WHERE id=?').bind(id).first()) }, 200, request, env);
}

export async function handleBooksNetworkRequest(request, env) {
  if (!env.DB) return null;
  const url = new URL(request.url);
  const path = url.pathname;
  const relevant = path.startsWith(PUBLIC_PREFIX) || path.startsWith(ME_PREFIX) || path.startsWith(ADMIN_PREFIX);
  if (!relevant) return null;
  await ensureSchema(env.DB);

  if (request.method === 'GET' && path === PUBLIC_PREFIX) return publicStores(request, env);
  let match = path.match(/^\/api\/books\/public\/stores\/([a-z0-9가-힣-]+)$/);
  if (match && request.method === 'GET') return publicStore(request, env, match[1]);

  const auth = await session(request, env);
  if (!auth.data) return auth.response;
  if (request.method === 'GET' && path === ME_PREFIX) return mySnapshot(request, env, auth);
  if (request.method === 'POST' && path === `${ME_PREFIX}/stores`) return createStore(request, env, auth);
  match = path.match(/^\/api\/books\/me\/stores\/([a-z0-9가-힣-]+)$/);
  if (match && request.method === 'PUT') return updateStore(request, env, auth, match[1]);
  if (request.method === 'POST' && path === `${ME_PREFIX}/titles`) return createTitle(request, env, auth);
  match = path.match(/^\/api\/books\/me\/titles\/(\d+)$/);
  if (match && request.method === 'PUT') return updateTitle(request, env, auth, Number(match[1]));
  if (request.method === 'GET' && path === ADMIN_PREFIX) return adminSnapshot(request, env, auth);
  match = path.match(/^\/api\/books\/admin\/network\/titles\/(\d+)$/);
  if (match && request.method === 'PUT') return moderateTitle(request, env, auth, Number(match[1]));
  return null;
}
