import {
  PARTNER_NEWS_CONTRACT,
  createPartnerNewsItem,
  listAdminPartnerNews,
  listPublicPartnerNews,
  normalizePartnerNewsScope,
  transitionPartnerNewsItem,
  updatePartnerNewsItem,
} from './partner-news-engine.js';

const PUBLIC_PATH = '/api/partner-news/public';
const CHURCH_PREFIX = '/api/church/admin/partner-news';
const CHURCH_SCOPE = Object.freeze({ tenantSlug:'ekodi-church', serviceKey:'church' });
const CHURCH_WRITE_ROLES = new Set(['senior_pastor','pastor','staff']);
const CHURCH_PUBLISH_ROLES = new Set(['senior_pastor','pastor']);
const DEFAULT_SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const DEFAULT_CHURCH_API = 'https://renzehysxirjilvdxacv.supabase.co/functions/v1/church-pastor-api';

function clean(value, max = 1000) { return String(value ?? '').trim().slice(0, max); }
function allowedOrigin(request, env) {
  const origin = String(request.headers.get('origin') || '');
  if (!origin) return '';
  const allowed = new Set(String(env?.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean));
  return allowed.has(origin) ? origin : '';
}
function json(data, status = 200, request, env, cache = 'no-store') {
  const headers = new Headers({
    'content-type':'application/json; charset=utf-8',
    'cache-control':cache,
    'x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer',
  });
  const origin = allowedOrigin(request, env);
  if (origin) { headers.set('access-control-allow-origin', origin); headers.set('vary','Origin'); }
  return new Response(JSON.stringify(data), { status, headers });
}
function preflight(request, env, publicOnly = false) {
  const origin = allowedOrigin(request, env);
  if (request.headers.get('origin') && !origin) return json({ error:'허용되지 않은 Origin입니다.' }, 403, request, env);
  const headers = new Headers({
    'access-control-allow-methods': publicOnly ? 'GET, OPTIONS' : 'GET, POST, PUT, OPTIONS',
    'access-control-allow-headers':'authorization, content-type',
    'access-control-max-age':'86400',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'vary':'Origin',
  });
  if (origin) headers.set('access-control-allow-origin', origin);
  return new Response(null, { status:204, headers });
}
async function readJson(request) { try { return await request.json(); } catch { return null; } }
function bearer(request) {
  const raw = String(request.headers.get('authorization') || '');
  return raw.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() : '';
}
function safeError(error, request, env) {
  const status = Number(error?.status || 500);
  const message = status >= 500 ? '협력 소식 처리 중 오류가 발생했습니다.' : clean(error?.message || '요청을 처리할 수 없습니다.', 500);
  return json({ error:message, code:clean(error?.code || 'PARTNER_NEWS_ERROR', 120) }, status, request, env);
}
async function churchAuthenticate(request, env) {
  const token = bearer(request);
  if (!token || token.length > 8192) {
    const error = new Error('목회자 인증이 필요합니다.'); error.status = 401; throw error;
  }
  const supabaseUrl = clean(env?.MY_SUPABASE_URL, 500) || DEFAULT_SUPABASE_URL;
  const supabaseKey = clean(env?.MY_SUPABASE_PUBLISHABLE_KEY, 500) || DEFAULT_SUPABASE_KEY;
  const identityResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers:{ apikey:supabaseKey, authorization:`Bearer ${token}` }, cache:'no-store'
  });
  const identity = identityResponse.ok ? await identityResponse.json().catch(() => null) : null;
  if (!identity?.id || !identity?.email || !identity?.email_confirmed_at) {
    const error = new Error('목회자 인증을 확인할 수 없습니다.'); error.status = 401; throw error;
  }
  const endpoint = new URL(clean(env?.CHURCH_PASTOR_API, 800) || DEFAULT_CHURCH_API);
  endpoint.searchParams.set('table','church_staff');
  endpoint.searchParams.set('church_slug','eq.ekodi-church');
  endpoint.searchParams.set('user_id',`eq.${identity.id}`);
  endpoint.searchParams.set('active','eq.true');
  endpoint.searchParams.set('limit','1');
  const staffResponse = await fetch(endpoint.toString(), {
    headers:{ authorization:`Bearer ${token}`, accept:'application/json' }, cache:'no-store'
  });
  const rows = staffResponse.ok ? await staffResponse.json().catch(() => []) : [];
  const staff = rows?.[0] || null;
  if (!staff) {
    const error = new Error('에코디교회 목회자 운영권한이 필요합니다.'); error.status = 403; throw error;
  }
  return {
    userId:String(identity.id),
    email:String(identity.email).toLowerCase(),
    role:String(staff.role || ''),
    displayName:staff.display_name || '',
  };
}

export function createPartnerNewsAdminAdapter({ prefix, scope, authenticate, canWrite, canPublish }) {
  const normalizedScope = normalizePartnerNewsScope(scope);
  return async function handle(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!(path === prefix || path.startsWith(prefix + '/'))) return null;
    if (request.method === 'OPTIONS') return preflight(request, env, false);
    if (!env?.DB?.prepare) return json({ error:'협력 소식 데이터베이스가 연결되지 않았습니다.', code:'PARTNER_NEWS_DB_UNAVAILABLE' }, 503, request, env);
    let actor;
    try { actor = await authenticate(request, env); }
    catch (error) { return safeError(error, request, env); }

    const capabilities = {
      canWrite:Boolean(canWrite(actor)),
      canPublish:Boolean(canPublish(actor)),
      role:actor.role || '',
      privateFirst:true,
    };
    try {
      if (request.method === 'GET' && path === prefix) {
        return json({
          contract:PARTNER_NEWS_CONTRACT,
          scope:normalizedScope,
          capabilities,
          items:await listAdminPartnerNews(env.DB, normalizedScope, url.searchParams.get('limit') || 100),
        }, 200, request, env);
      }
      if (request.method === 'POST' && path === prefix) {
        if (!capabilities.canWrite) return json({ error:'협력 소식 작성 권한이 없습니다.' }, 403, request, env);
        const body = await readJson(request);
        if (!body) return json({ error:'협력 소식 내용을 확인해 주세요.' }, 400, request, env);
        const item = await createPartnerNewsItem(env.DB, normalizedScope, body, actor);
        return json({ ok:true, item }, 201, request, env);
      }

      const suffix = path.slice(prefix.length + 1);
      const parts = suffix.split('/').filter(Boolean).map(decodeURIComponent);
      if (parts.length < 1 || parts.length > 2) return json({ error:'협력 소식 API 경로를 찾을 수 없습니다.' }, 404, request, env);
      const id = clean(parts[0], 100);
      const action = clean(parts[1], 40).toLowerCase();

      if (request.method === 'PUT' && !action) {
        if (!capabilities.canWrite) return json({ error:'협력 소식 수정 권한이 없습니다.' }, 403, request, env);
        const body = await readJson(request);
        if (!body) return json({ error:'협력 소식 내용을 확인해 주세요.' }, 400, request, env);
        return json({ ok:true, item:await updatePartnerNewsItem(env.DB, normalizedScope, id, body, actor) }, 200, request, env);
      }
      if (request.method === 'POST' && action) {
        const publishAction = ['publish','archive','reopen'].includes(action);
        if (publishAction && !capabilities.canPublish) return json({ error:'협력 소식 공개·보관 권한이 없습니다.' }, 403, request, env);
        if (!publishAction && !capabilities.canWrite) return json({ error:'협력 소식 검토 권한이 없습니다.' }, 403, request, env);
        return json({ ok:true, item:await transitionPartnerNewsItem(env.DB, normalizedScope, id, action, actor) }, 200, request, env);
      }
      return json({ error:'지원하지 않는 요청입니다.' }, 405, request, env);
    } catch (error) {
      console.error('Partner News admin error', error);
      return safeError(error, request, env);
    }
  };
}

const churchAdmin = createPartnerNewsAdminAdapter({
  prefix:CHURCH_PREFIX,
  scope:CHURCH_SCOPE,
  authenticate:churchAuthenticate,
  canWrite:actor => CHURCH_WRITE_ROLES.has(actor?.role),
  canPublish:actor => CHURCH_PUBLISH_ROLES.has(actor?.role),
});

async function publicHandler(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== PUBLIC_PATH) return null;
  if (request.method === 'OPTIONS') return preflight(request, env, true);
  if (request.method !== 'GET') return json({ error:'Method not allowed' }, 405, request, env);
  if (!env?.DB?.prepare) return json({ error:'협력 소식 데이터베이스가 연결되지 않았습니다.' }, 503, request, env);
  try {
    const scope = normalizePartnerNewsScope({
      tenantSlug:url.searchParams.get('tenant'),
      serviceKey:url.searchParams.get('service'),
    });
    const items = await listPublicPartnerNews(env.DB, scope, url.searchParams.get('limit') || 12);
    return json({
      contract:{ version:PARTNER_NEWS_CONTRACT.version, publicState:PARTNER_NEWS_CONTRACT.publicState, privateFirst:true },
      scope,
      items,
      generatedAt:new Date().toISOString(),
    }, 200, request, env, 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
  } catch (error) {
    return safeError(error, request, env);
  }
}

export async function handlePartnerNewsRequest(request, env) {
  const publicResponse = await publicHandler(request, env);
  if (publicResponse) return publicResponse;
  return churchAdmin(request, env);
}
