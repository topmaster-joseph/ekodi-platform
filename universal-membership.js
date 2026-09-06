import { handleMembershipBilling as handleLegacyMembershipBilling, runMembershipBillingSchedule } from './membership-billing.js';
import { isAllowedOrigin } from './auth-worker.js';
import { USER_SERVICES, USER_SERVICE_IDS } from './generated/user-services.js';
import { canonicalAiSubject, legacyAiSubject, resolveCanonicalEkodiIdentity } from './personal-ai-bridge.js';

const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const LEGACY_MEMBERSHIP_SITES = new Set([
  'portal', 'marketing', 'biz', 'trade', 'mall', 'books', 'church', 'lab', 'community', 'edu', 'media',
]);
const USER_SERVICE_ORIGINS = new Set(USER_SERVICES.map((service) => `https://${service.domain}`));
const FREE_PLAN = Object.freeze({
  id: 'free',
  label: 'FREE',
  monthlyFee: 0,
  summary: 'EKODI 통합계정 기본 무료 이용',
  billing: 'free',
});

function isUniversalAllowedOrigin(origin, env) {
  return !origin || isAllowedOrigin(origin, env) || USER_SERVICE_ORIGINS.has(origin);
}

function cors(origin, env) {
  const headers = {
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  if (origin && isUniversalAllowedOrigin(origin, env)) headers['access-control-allow-origin'] = origin;
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

function bearerToken(request) {
  const auth = String(request.headers.get('authorization') || '');
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

function oauthClientToken(token) {
  try {
    const segment=String(token||'').split('.')[1]||'';
    const normalized=segment.replace(/-/g,'+').replace(/_/g,'/');
    const padded=normalized+'='.repeat((4-normalized.length%4)%4);
    const claims=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded),c=>c.charCodeAt(0))));
    return Boolean(String(claims?.client_id||'').trim());
  } catch { return false; }
}

async function userIdentity(request) {
  const token = bearerToken(request);
  if (!token || token.length > 8192 || oauthClientToken(token)) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const user = await response.json();
  const email = String(user?.email || '').trim().toLowerCase();
  if (!user?.id || !email || !user?.email_confirmed_at) return null;
  return resolveCanonicalEkodiIdentity({ token, authUser:{ id:String(user.id), email } });
}

async function ensureFreeSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS service_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_type TEXT NOT NULL,
    subject_key TEXT NOT NULL,
    site TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'free',
    monthly_fee INTEGER NOT NULL DEFAULT 0,
    provider TEXT NOT NULL DEFAULT '',
    provider_customer_key TEXT,
    billing_key_cipher TEXT,
    billing_key_iv TEXT,
    current_period_start TEXT,
    current_period_end TEXT,
    next_billing_at TEXT,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(subject_type, subject_key, site)
  )`).run();
}

function normalizeRegistrySite(value) {
  const site = String(value || '').trim().toLowerCase();
  return USER_SERVICE_IDS.has(site) ? site : '';
}

function freeSubscription(row = null) {
  if (!row) {
    return {
      planId: 'free',
      status: 'eligible',
      monthlyFee: 0,
      currentPeriodEnd: null,
      nextBillingAt: null,
      cancelAtPeriodEnd: false,
      inherited: true,
    };
  }
  return {
    planId: String(row.plan_id || 'free'),
    status: String(row.status || 'free'),
    monthlyFee: Number(row.monthly_fee || 0),
    currentPeriodEnd: row.current_period_end || null,
    nextBillingAt: row.next_billing_at || null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    inherited: false,
  };
}

function subscriptionSubjects(identity) {
  return [...new Set([canonicalAiSubject(identity), identity.personId, legacyAiSubject(identity)].filter(Boolean).map(String))];
}

async function materializeFree(db, identity, site) {
  const subject = canonicalAiSubject(identity);
  const now = new Date().toISOString();
  await db.prepare(`INSERT OR IGNORE INTO service_subscriptions
    (subject_type,subject_key,site,plan_id,status,monthly_fee,created_at,updated_at)
    VALUES ('person', ?, ?, 'free', 'free', 0, ?, ?)`)
    .bind(subject, site, now, now).run();
  return db.prepare(`SELECT * FROM service_subscriptions
    WHERE subject_type='person' AND subject_key=? AND site=?`)
    .bind(subject, site).first();
}

async function portfolioForIdentity(request, env, identity) {
  await ensureFreeSchema(env.DB);
  const bySite = new Map();
  for (const subject of subscriptionSubjects(identity)) {
    const rows = await env.DB.prepare(`SELECT site,plan_id,status,monthly_fee,current_period_end,next_billing_at,cancel_at_period_end
      FROM service_subscriptions WHERE subject_type='person' AND subject_key=?`).bind(subject).all();
    for (const row of rows.results || []) if (!bySite.has(String(row.site))) bySite.set(String(row.site), row);
  }
  return json({
    account: { email: identity.email, ekodiId:identity.ekodiId || null, defaultTier: 'free' },
    policy: 'one-account-free-everywhere-pay-where-needed',
    services: USER_SERVICES.map((service) => ({
      ...service,
      subscription: freeSubscription(bySite.get(service.id) || null),
    })),
  }, 200, request, env);
}

export async function membershipPortfolioForIdentity(request, env, identity) {
  if (!env?.DB || !identity?.canonical) return json({ error:'EKODI ID가 필요합니다.', code:'MEMBERSHIP_CANONICAL_ID_REQUIRED' }, 403, request, env || {});
  return portfolioForIdentity(request, env, identity);
}

async function portfolio(request, env) {
  const identity = await userIdentity(request);
  if (!identity) return json({ error: 'EKODI 로그인 세션을 확인해 주세요.' }, 401, request, env);
  return portfolioForIdentity(request, env, identity);
}

async function genericCatalog(request, env, site) {
  return json({
    site,
    inheritedDefault: true,
    plans: [FREE_PLAN],
    billingReady: false,
    billingProvider: null,
    paidPlanPolicy: 'service-specific',
  }, 200, request, env);
}

async function genericMe(request, env, site) {
  const identity = await userIdentity(request);
  if (!identity) return json({ error: 'EKODI 로그인 세션을 확인해 주세요.' }, 401, request, env);
  await ensureFreeSchema(env.DB);
  const row = await materializeFree(env.DB, identity, site);
  return json({
    site,
    subjectType: 'person',
    tenant: null,
    store: null,
    role: null,
    basePlan: 'free',
    email: identity.email,
    canManagePlan: true,
    subscription: freeSubscription(row),
    plans: [FREE_PLAN],
    billingReady: false,
    inheritedDefault: true,
  }, 200, request, env);
}

async function genericSelect(request, env) {
  const identity = await userIdentity(request);
  let body = null;
  try { body = await request.json(); } catch {}
  const site = normalizeRegistrySite(body?.site);
  const planId = String(body?.planId || 'free').trim().toLowerCase();
  if (!identity || !site) return json({ error: '요청을 확인해 주세요.' }, 400, request, env);
  if (planId !== 'free') {
    return json({
      error: '이 서비스의 유료 플랜은 아직 개별 요금제로 등록되지 않았습니다.',
      code: 'SERVICE_PAID_PLAN_NOT_CONFIGURED',
    }, 409, request, env);
  }
  await ensureFreeSchema(env.DB);
  const row = await materializeFree(env.DB, identity, site);
  return json({ ok: true, subscription: freeSubscription(row) }, 200, request, env);
}

export async function handleUniversalMembership(request, env) {
  if (!env.DB) return json({ error: '데이터베이스 연결이 설정되지 않았습니다.' }, 503, request, env);
  const origin = request.headers.get('origin');
  if (origin && !isUniversalAllowedOrigin(origin, env)) return json({ error: '허용되지 않은 요청입니다.' }, 403, request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin, env) });

  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === 'GET' && path === '/api/membership/portfolio') return portfolio(request, env);

  const querySite = normalizeRegistrySite(url.searchParams.get('site'));
  if (querySite && !LEGACY_MEMBERSHIP_SITES.has(querySite)) {
    if (request.method === 'GET' && path === '/api/membership/catalog') return genericCatalog(request, env, querySite);
    if (request.method === 'GET' && path === '/api/membership/me') return genericMe(request, env, querySite);
  }

  if (request.method === 'POST' && path === '/api/membership/select') {
    const cloned = request.clone();
    let body = null;
    try { body = await cloned.json(); } catch {}
    const bodySite = normalizeRegistrySite(body?.site);
    if (bodySite && !LEGACY_MEMBERSHIP_SITES.has(bodySite)) return genericSelect(request, env);
  }

  return handleLegacyMembershipBilling(request, env);
}

export async function runUniversalMembershipSchedule(env) {
  return runMembershipBillingSchedule(env);
}
