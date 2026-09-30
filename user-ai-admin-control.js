import authWorker from './auth-worker.js';

export const USER_AI_PLAN_DEFAULTS = Object.freeze({
  free:20,
  flex:20,
  basic:25,
  plus:100,
  pro:500,
  auto:1500,
});

const PLAN_IDS = Object.freeze(Object.keys(USER_AI_PLAN_DEFAULTS));
const PLAN_ID_SET = new Set(PLAN_IDS);
const CONTROL_ROOT = '/api/control/user-ai';
const LIMITS_PATH = `${CONTROL_ROOT}/limits`;

function json(data, status = 200, sourceHeaders = new Headers()) {
  const headers = new Headers({
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
  });
  for (const name of ['access-control-allow-origin','access-control-allow-headers','access-control-allow-methods','access-control-max-age','vary']) {
    const value = sourceHeaders.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(JSON.stringify(data), { status, headers });
}

async function sessionCheck(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method:'GET', headers:request.headers }), env);
  if (!response.ok) return { response };
  return { response, session:await response.clone().json() };
}

function adminIdentity(session = {}) {
  return String(session?.email || session?.user?.email || session?.account?.email || 'admin').trim().toLowerCase().slice(0, 254) || 'admin';
}

function envName(planId) {
  return `USER_AI_${String(planId || '').toUpperCase()}_MONTHLY_REQUESTS`;
}

export function configuredMonthlyRequests(env = {}, planId = 'free') {
  const id = String(planId || 'free').trim().toLowerCase();
  if (!PLAN_ID_SET.has(id)) return 0;
  const raw = env?.[envName(id)];
  if (raw === undefined || raw === null || String(raw).trim() === '') return USER_AI_PLAN_DEFAULTS[id];
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : USER_AI_PLAN_DEFAULTS[id];
}

export function validateLimitChange(input = {}) {
  const planId = String(input?.planId || '').trim().toLowerCase();
  const monthlyRequests = Number(input?.monthlyRequests);
  if (!PLAN_ID_SET.has(planId)) return { ok:false, code:'USER_AI_PLAN_INVALID' };
  if (!Number.isInteger(monthlyRequests) || monthlyRequests < 0 || monthlyRequests > 100000) {
    return { ok:false, code:'USER_AI_LIMIT_INVALID' };
  }
  return { ok:true, planId, monthlyRequests };
}

async function ensureAdminSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS user_ai_plan_limits (
    plan_id TEXT PRIMARY KEY,
    monthly_requests INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL
  )`).run();
}

function looksLikeMissingTable(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('no such table') || message.includes('user_ai_usage') || message.includes('user_ai_credentials');
}

async function readOverrides(db) {
  await ensureAdminSchema(db);
  const result = await db.prepare(`SELECT plan_id, monthly_requests, updated_at, updated_by
    FROM user_ai_plan_limits ORDER BY plan_id`).all();
  return result.results || [];
}

export async function applyUserAiPlanOverrides(env = {}) {
  const runtimeEnv = Object.create(env || null);
  for (const planId of PLAN_IDS) {
    runtimeEnv[envName(planId)] = String(configuredMonthlyRequests(env, planId));
  }
  if (!env?.DB) return runtimeEnv;

  let rows = [];
  try {
    const result = await env.DB.prepare('SELECT plan_id, monthly_requests FROM user_ai_plan_limits').all();
    rows = result.results || [];
  } catch (error) {
    if (!looksLikeMissingTable(error) && !String(error?.message || error || '').toLowerCase().includes('user_ai_plan_limits')) {
      console.error('User AI plan override read failed', error);
    }
    return runtimeEnv;
  }

  for (const row of rows) {
    const planId = String(row?.plan_id || '').trim().toLowerCase();
    const monthlyRequests = Number(row?.monthly_requests);
    if (!PLAN_ID_SET.has(planId) || !Number.isInteger(monthlyRequests) || monthlyRequests < 0) continue;
    runtimeEnv[envName(planId)] = String(monthlyRequests);
  }
  return runtimeEnv;
}

function monthStart() {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

async function usageSummary(db) {
  try {
    const [byPlan, bySite, byProvider, connected] = await Promise.all([
      db.prepare(`SELECT plan_id, funding, COUNT(*) AS requests, COUNT(DISTINCT user_id) AS users
        FROM user_ai_usage WHERE created_at>=? GROUP BY plan_id, funding ORDER BY plan_id, funding`).bind(monthStart()).all(),
      db.prepare(`SELECT site, funding, COUNT(*) AS requests, COUNT(DISTINCT user_id) AS users
        FROM user_ai_usage WHERE created_at>=? GROUP BY site, funding ORDER BY requests DESC, site`).bind(monthStart()).all(),
      db.prepare(`SELECT provider, funding, COUNT(*) AS requests
        FROM user_ai_usage WHERE created_at>=? GROUP BY provider, funding ORDER BY requests DESC`).bind(monthStart()).all(),
      db.prepare(`SELECT provider, COUNT(*) AS connections
        FROM user_ai_credentials WHERE revoked_at IS NULL GROUP BY provider ORDER BY connections DESC`).all(),
    ]);
    return {
      monthStart:monthStart(),
      byPlan:(byPlan.results || []).map(row => ({ planId:row.plan_id, funding:row.funding, requests:Number(row.requests || 0), users:Number(row.users || 0) })),
      bySite:(bySite.results || []).map(row => ({ site:row.site, funding:row.funding, requests:Number(row.requests || 0), users:Number(row.users || 0) })),
      byProvider:(byProvider.results || []).map(row => ({ provider:row.provider, funding:row.funding, requests:Number(row.requests || 0) })),
      connectedProviders:(connected.results || []).map(row => ({ provider:row.provider, connections:Number(row.connections || 0) })),
    };
  } catch (error) {
    if (!looksLikeMissingTable(error)) throw error;
    return { monthStart:monthStart(), byPlan:[], bySite:[], byProvider:[], connectedProviders:[] };
  }
}

async function getSummary(request, env, auth) {
  const overrides = await readOverrides(env.DB);
  const overrideMap = new Map(overrides.map(row => [String(row.plan_id), row]));
  const plans = PLAN_IDS.map(planId => {
    const override = overrideMap.get(planId);
    return {
      planId,
      monthlyRequests:override ? Number(override.monthly_requests || 0) : configuredMonthlyRequests(env, planId),
      source:override ? 'admin-override' : (env?.[envName(planId)] === undefined ? 'built-in-default' : 'environment'),
      updatedAt:override?.updated_at || null,
      updatedBy:override?.updated_by || null,
    };
  });
  const usage = await usageSummary(env.DB);
  return json({
    schemaVersion:1,
    policy:'bounded-user-ai-by-membership',
    plans,
    usage,
    rules:{
      personalApiPreferred:true,
      boundedEkodiSponsorship:true,
      successfulSponsoredCallsOnly:true,
      zeroLimitPausesEkodiSponsorship:true,
      providerDetailsHiddenFromDefaultUserFlow:true,
      coreWorksWithoutAi:true,
    },
  }, 200, auth.response.headers);
}

async function saveLimit(request, env, auth) {
  let body = null;
  try { body = await request.json(); } catch {}
  const validated = validateLimitChange(body);
  if (!validated.ok) return json({ error:'회원단계 또는 월 AI 한도를 확인해 주세요.', code:validated.code }, 400, auth.response.headers);
  await ensureAdminSchema(env.DB);
  const now = new Date().toISOString();
  const updatedBy = adminIdentity(auth.session);
  await env.DB.prepare(`INSERT INTO user_ai_plan_limits(plan_id, monthly_requests, updated_at, updated_by)
    VALUES(?,?,?,?) ON CONFLICT(plan_id) DO UPDATE SET monthly_requests=excluded.monthly_requests,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
    .bind(validated.planId, validated.monthlyRequests, now, updatedBy).run();
  return json({ ok:true, planId:validated.planId, monthlyRequests:validated.monthlyRequests, source:'admin-override', updatedAt:now }, 200, auth.response.headers);
}

async function resetLimit(request, env, auth, planId) {
  const id = String(planId || '').trim().toLowerCase();
  if (!PLAN_ID_SET.has(id)) return json({ error:'회원단계를 확인해 주세요.', code:'USER_AI_PLAN_INVALID' }, 400, auth.response.headers);
  await ensureAdminSchema(env.DB);
  await env.DB.prepare('DELETE FROM user_ai_plan_limits WHERE plan_id=?').bind(id).run();
  return json({ ok:true, planId:id, monthlyRequests:configuredMonthlyRequests(env, id), source:env?.[envName(id)] === undefined ? 'built-in-default' : 'environment' }, 200, auth.response.headers);
}

export async function handleUserAiAdminControl(request, env = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(CONTROL_ROOT)) return null;
  if (request.method === 'OPTIONS') return authWorker.fetch(request, env);
  if (!env.DB) return json({ error:'데이터베이스 연결이 설정되지 않았습니다.', code:'USER_AI_ADMIN_DATABASE_UNAVAILABLE' }, 503);
  const auth = await sessionCheck(request, env);
  if (!auth.session) return auth.response;

  try {
    if (request.method === 'GET' && url.pathname === CONTROL_ROOT) return getSummary(request, env, auth);
    if (request.method === 'PUT' && url.pathname === LIMITS_PATH) return saveLimit(request, env, auth);
    const resetMatch = url.pathname.match(/^\/api\/control\/user-ai\/limits\/(free|flex|basic|plus|pro|auto)$/);
    if (request.method === 'DELETE' && resetMatch) return resetLimit(request, env, auth, resetMatch[1]);
    return json({ error:'User AI 운영 endpoint not found', code:'USER_AI_ADMIN_NOT_FOUND' }, 404, auth.response.headers);
  } catch (error) {
    console.error('User AI admin control error', error);
    return json({ error:'User AI 운영 데이터를 처리하지 못했습니다.', code:'USER_AI_ADMIN_ERROR' }, 500, auth.response.headers);
  }
}

export const USER_AI_ADMIN_POLICY = Object.freeze({
  planIds:[...PLAN_IDS],
  defaults:USER_AI_PLAN_DEFAULTS,
  maxMonthlyRequests:100000,
});