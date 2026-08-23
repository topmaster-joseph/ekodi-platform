import { isAllowedOrigin } from './auth-worker.js';
import { createGeminiPersonalProvider } from './gemini-provider-adapter.js';
import { createSponsoredUserOpenAiProvider } from './user-openai-provider-adapter.js';

const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MODES = new Set(['auto', 'personal-first', 'ekodi-first', 'off']);
const PROVIDERS = Object.freeze([
  { id:'chatgpt-web', label:'ChatGPT', kind:'personal-web', url:'https://chatgpt.com/', ekodiCost:false },
  { id:'gemini-web', label:'Gemini', kind:'personal-web', url:'https://gemini.google.com/', ekodiCost:false },
  { id:'gemini-api', label:'Gemini 내 API', kind:'personal-api', url:'https://aistudio.google.com/apikey', ekodiCost:false },
]);
const DEFAULT_SPONSORED_REQUESTS = Object.freeze({ free:0, flex:0, basic:25, plus:100, pro:500, auto:1500 });
const SENSITIVE_RE = /(비밀번호|패스워드|password|secret|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|주민등록|주민번호|여권번호|카드번호|계좌번호|보안코드|cvv|개인정보|진료|질병|건강정보)/i;

function json(data, status, request, env) {
  const origin = request.headers.get('origin') || '';
  const headers = {
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    vary:'Origin',
    'access-control-allow-methods':'GET, PUT, POST, DELETE, OPTIONS',
    'access-control-allow-headers':'content-type, authorization',
  };
  if (origin && isAllowedOrigin(origin, env)) headers['access-control-allow-origin'] = origin;
  return new Response(JSON.stringify(data), { status, headers });
}

function bearerToken(request) {
  const auth = String(request.headers.get('authorization') || '');
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

async function userIdentity(request) {
  const token = bearerToken(request);
  if (!token || token.length > 8192) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization:`Bearer ${token}` },
  });
  if (!response.ok) return null;
  const user = await response.json();
  const email = String(user?.email || '').trim().toLowerCase();
  if (!user?.id || !email || !user?.email_confirmed_at) return null;
  return { id:String(user.id), email };
}

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS user_ai_preferences (
      user_id TEXT PRIMARY KEY,
      mode TEXT NOT NULL DEFAULT 'auto',
      preferred_provider TEXT NOT NULL DEFAULT 'gemini-api',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS user_ai_credentials (
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      secret_cipher TEXT NOT NULL,
      secret_iv TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      revoked_at TEXT,
      PRIMARY KEY (user_id, provider)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS user_ai_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      site TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      funding TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_user_ai_usage_month ON user_ai_usage(user_id,site,funding,created_at)'),
  ]);
}

function normalizeSite(value) {
  const site = String(value || 'my').trim().toLowerCase();
  return /^[a-z0-9-]{1,50}$/.test(site) ? site : 'my';
}

function envQuota(env, planId) {
  const name = `USER_AI_${String(planId || '').toUpperCase()}_MONTHLY_REQUESTS`;
  const raw = env?.[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return DEFAULT_SPONSORED_REQUESTS[planId] ?? 0;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function fundingPolicyForPlan(planId = 'free', env = {}) {
  const id = String(planId || 'free').trim().toLowerCase();
  const sponsoredRequests = envQuota(env, id);
  return Object.freeze({
    planId:id,
    personalAiFirst:true,
    sponsoredRequests,
    sponsoredEligible:sponsoredRequests > 0,
    freeEkodiApiCost:id === 'free' ? 0 : null,
  });
}

export function classifyUserAiData(message = '', declared = 'general') {
  const level = ['public','general','private','sensitive'].includes(String(declared || '').toLowerCase())
    ? String(declared).toLowerCase() : 'general';
  if (level === 'sensitive' || SENSITIVE_RE.test(String(message || ''))) return 'sensitive';
  return level;
}

export function chooseUserAiRoute(options = {}) {
  const mode = MODES.has(options.mode) ? options.mode : 'auto';
  if (mode === 'off') return 'core-only';
  const personal = Boolean(options.hasPersonal && options.personalAllowed);
  const sponsored = Boolean(options.sponsoredAvailable && Number(options.sponsoredRemaining || 0) > 0);
  if (mode === 'ekodi-first') {
    if (sponsored) return 'ekodi-sponsored';
    if (personal) return 'personal-api';
    return 'personal-web';
  }
  if (personal) return 'personal-api';
  if (sponsored) return 'ekodi-sponsored';
  return 'personal-web';
}

function bytesToB64(value) {
  let binary = '';
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function b64ToBytes(value) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}
async function vaultKey(env) {
  const secret = String(env.USER_AI_CREDENTIAL_ENCRYPTION_KEY || '').trim();
  if (!secret) return null;
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`ekodi:user-ai:v1:${secret}`));
  return crypto.subtle.importKey('raw', digest, { name:'AES-GCM' }, false, ['encrypt','decrypt']);
}
async function encryptSecret(env, value) {
  const key = await vaultKey(env);
  if (!key) throw new Error('USER_AI_VAULT_NOT_CONFIGURED');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, encoder.encode(value));
  return { cipher:bytesToB64(cipher), iv:bytesToB64(iv) };
}
async function decryptSecret(env, cipher, iv) {
  const key = await vaultKey(env);
  if (!key) throw new Error('USER_AI_VAULT_NOT_CONFIGURED');
  const clear = await crypto.subtle.decrypt({ name:'AES-GCM', iv:b64ToBytes(iv) }, key, b64ToBytes(cipher));
  return decoder.decode(clear);
}

async function preferenceFor(env, identity) {
  const row = await env.DB.prepare('SELECT mode,preferred_provider FROM user_ai_preferences WHERE user_id=?').bind(identity.id).first();
  return {
    mode: MODES.has(row?.mode) ? row.mode : 'auto',
    preferredProvider: String(row?.preferred_provider || 'gemini-api'),
  };
}

async function credentialFor(env, identity, provider = 'gemini-api') {
  return env.DB.prepare(`SELECT provider,secret_cipher,secret_iv,updated_at FROM user_ai_credentials
    WHERE user_id=? AND provider=? AND revoked_at IS NULL`).bind(identity.id, provider).first();
}

async function planFor(env, identity, site) {
  const row = await env.DB.prepare(`SELECT plan_id,status FROM service_subscriptions
    WHERE subject_type='person' AND subject_key=? AND site=? LIMIT 1`).bind(identity.id, site).first();
  if (!row) return { planId:'free', status:'eligible' };
  return { planId:String(row.plan_id || 'free').toLowerCase(), status:String(row.status || 'free').toLowerCase() };
}

function monthStart() {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

async function sponsoredUsage(env, identity, site) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM user_ai_usage
    WHERE user_id=? AND site=? AND funding='ekodi' AND created_at>=?`).bind(identity.id, site, monthStart()).first();
  return Number(row?.count || 0);
}

async function recordUsage(env, identity, { site, planId, funding, provider, model='' }) {
  await env.DB.prepare(`INSERT INTO user_ai_usage(user_id,site,plan_id,funding,provider,model,created_at)
    VALUES(?,?,?,?,?,?,?)`).bind(identity.id, site, planId, funding, provider, model, new Date().toISOString()).run();
}

function publicProviders(connectedGemini = false, vaultReady = false) {
  return PROVIDERS.map(provider => ({
    ...provider,
    connected:provider.id === 'gemini-api' ? connectedGemini : null,
    connectionReady:provider.id === 'gemini-api' ? vaultReady : true,
  }));
}

async function status(request, env, identity) {
  const url = new URL(request.url);
  const site = normalizeSite(url.searchParams.get('site'));
  const pref = await preferenceFor(env, identity);
  const credential = await credentialFor(env, identity);
  const plan = await planFor(env, identity, site);
  const policy = fundingPolicyForPlan(plan.planId, env);
  const used = await sponsoredUsage(env, identity, site);
  const remaining = Math.max(0, policy.sponsoredRequests - used);
  const vaultReady = Boolean(String(env.USER_AI_CREDENTIAL_ENCRYPTION_KEY || '').trim());
  return json({
    schemaVersion:1,
    policy:'personal-ai-first-ekodi-sponsored-by-membership',
    account:{ email:identity.email },
    site,
    preference:pref,
    plan:{ ...plan, sponsoredRequests:policy.sponsoredRequests, sponsoredUsed:used, sponsoredRemaining:remaining },
    providers:publicProviders(Boolean(credential), vaultReady),
    rules:{
      freeUsesEkodiPaidApi:false,
      personalWebQuotaIsProviderOwned:true,
      personalApiCostOwnedByUser:true,
      sensitiveDataToPersonalFreeApi:false,
      coreWorksWithoutAi:true,
    },
  }, 200, request, env);
}

async function savePreference(request, env, identity) {
  let body = null;
  try { body = await request.json(); } catch {}
  const mode = MODES.has(body?.mode) ? body.mode : '';
  const provider = ['chatgpt-web','gemini-web','gemini-api'].includes(body?.preferredProvider) ? body.preferredProvider : '';
  if (!mode || !provider) return json({ error:'AI 사용 방식 또는 공급자를 확인해 주세요.', code:'USER_AI_PREFERENCE_INVALID' }, 400, request, env);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO user_ai_preferences(user_id,mode,preferred_provider,created_at,updated_at)
    VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET mode=excluded.mode,preferred_provider=excluded.preferred_provider,updated_at=excluded.updated_at`)
    .bind(identity.id, mode, provider, now, now).run();
  return json({ ok:true, preference:{ mode, preferredProvider:provider } }, 200, request, env);
}

async function saveGeminiCredential(request, env, identity) {
  if (!String(env.USER_AI_CREDENTIAL_ENCRYPTION_KEY || '').trim()) {
    return json({ error:'개인 AI 보안 저장소가 아직 활성화되지 않았습니다.', code:'USER_AI_VAULT_NOT_CONFIGURED' }, 503, request, env);
  }
  let body = null;
  try { body = await request.json(); } catch {}
  const apiKey = String(body?.apiKey || '').trim();
  if (apiKey.length < 20 || apiKey.length > 256 || /\s/.test(apiKey)) {
    return json({ error:'Gemini API 키 형식을 확인해 주세요.', code:'USER_AI_CREDENTIAL_INVALID' }, 400, request, env);
  }
  const encrypted = await encryptSecret(env, apiKey);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO user_ai_credentials(user_id,provider,secret_cipher,secret_iv,created_at,updated_at,revoked_at)
    VALUES(?,?,?,?,?,?,NULL) ON CONFLICT(user_id,provider) DO UPDATE SET secret_cipher=excluded.secret_cipher,secret_iv=excluded.secret_iv,updated_at=excluded.updated_at,revoked_at=NULL`)
    .bind(identity.id, 'gemini-api', encrypted.cipher, encrypted.iv, now, now).run();
  return json({ ok:true, provider:'gemini-api', connected:true }, 200, request, env);
}

async function revokeGeminiCredential(request, env, identity) {
  await env.DB.prepare(`UPDATE user_ai_credentials SET revoked_at=?,updated_at=? WHERE user_id=? AND provider='gemini-api'`)
    .bind(new Date().toISOString(), new Date().toISOString(), identity.id).run();
  return json({ ok:true, provider:'gemini-api', connected:false }, 200, request, env);
}

function handoffPayload(preferred = 'gemini-web', notice = '') {
  const order = [preferred, 'gemini-web', 'chatgpt-web'];
  const seen = new Set();
  const handoffs = [];
  for (const id of order) {
    if (seen.has(id)) continue;
    seen.add(id);
    const provider = PROVIDERS.find(item => item.id === id && item.kind === 'personal-web');
    if (provider) handoffs.push({ id:provider.id, label:provider.label, url:provider.url });
  }
  return { mode:'personal-web', funding:'personal', provider:null, text:'개인 무료 AI에서 계속할 수 있습니다.', notice, handoffs };
}

async function assist(request, env, identity) {
  let body = null;
  try { body = await request.json(); } catch {}
  const message = String(body?.message || '').trim().slice(0, 4000);
  if (!message) return json({ error:'질문을 입력해 주세요.', code:'USER_AI_EMPTY_MESSAGE' }, 400, request, env);
  const site = normalizeSite(body?.site);
  const dataClass = classifyUserAiData(message, body?.dataClass || 'general');
  const pref = await preferenceFor(env, identity);
  const credential = await credentialFor(env, identity);
  const plan = await planFor(env, identity, site);
  const policy = fundingPolicyForPlan(plan.planId, env);
  const used = await sponsoredUsage(env, identity, site);
  const remaining = Math.max(0, policy.sponsoredRequests - used);
  const sponsoredProvider = createSponsoredUserOpenAiProvider(env);
  const personalAllowed = dataClass === 'public' || dataClass === 'general';
  const route = chooseUserAiRoute({
    mode:pref.mode,
    hasPersonal:Boolean(credential),
    personalAllowed,
    sponsoredAvailable:sponsoredProvider.available && policy.sponsoredEligible && !['canceled','past_due'].includes(plan.status),
    sponsoredRemaining:remaining,
  });

  if (route === 'core-only') {
    return json({ mode:'core-only', funding:'none', provider:null, text:'AI 호출 없이 EKODI Core 기본 기능을 계속 이용합니다.', dataClass }, 200, request, env);
  }

  const tryPersonal = async () => {
    if (!credential || !personalAllowed) return null;
    const apiKey = await decryptSecret(env, credential.secret_cipher, credential.secret_iv);
    const provider = createGeminiPersonalProvider({ apiKey });
    if (!provider.available) return null;
    const result = await provider.invoke({ message });
    await recordUsage(env, identity, { site, planId:plan.planId, funding:'personal', provider:provider.id, model:result.model });
    return { mode:'ai', funding:'personal', provider:provider.id, text:result.text, model:result.model, dataClass, ekodiCost:false };
  };

  const trySponsored = async () => {
    if (!sponsoredProvider.available || remaining <= 0 || !policy.sponsoredEligible) return null;
    const result = await sponsoredProvider.invoke({ message, site });
    await recordUsage(env, identity, { site, planId:plan.planId, funding:'ekodi', provider:sponsoredProvider.id, model:result.model });
    return {
      mode:'ai', funding:'ekodi', provider:sponsoredProvider.id, text:result.text, model:result.model, dataClass, ekodiCost:true,
      quota:{ monthly:policy.sponsoredRequests, used:used + 1, remaining:Math.max(0, remaining - 1) },
    };
  };

  try {
    if (route === 'personal-api') {
      const personal = await tryPersonal();
      if (personal) return json(personal, 200, request, env);
      const sponsored = await trySponsored();
      if (sponsored) return json(sponsored, 200, request, env);
    } else if (route === 'ekodi-sponsored') {
      const sponsored = await trySponsored();
      if (sponsored) return json(sponsored, 200, request, env);
      const personal = await tryPersonal();
      if (personal) return json(personal, 200, request, env);
    }
  } catch (error) {
    console.error('User AI provider invocation failed', { route, provider: route, error:String(error?.message || error) });
  }

  const notice = dataClass === 'sensitive'
    ? '민감정보로 판단되어 개인 무료 API로 자동 전송하지 않았습니다.'
    : plan.planId === 'free'
      ? 'FREE 회원의 요청은 EKODI 유료 API로 자동 전환하지 않습니다.'
      : '연결된 개인 AI 또는 회원등급 지원 AI를 사용할 수 없어 개인 AI 화면으로 전환합니다.';
  return json({ ...handoffPayload(pref.preferredProvider, notice), dataClass, ekodiCost:false }, 200, request, env);
}

export async function handleUserAiControl(request, env = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/user-ai/')) return null;
  const origin = request.headers.get('origin');
  if (origin && !isAllowedOrigin(origin, env)) return json({ error:'허용되지 않은 요청입니다.', code:'USER_AI_ORIGIN_FORBIDDEN' }, 403, request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:{
    'access-control-allow-methods':'GET, PUT, POST, DELETE, OPTIONS',
    'access-control-allow-headers':'content-type, authorization',
    ...(origin ? { 'access-control-allow-origin':origin, vary:'Origin' } : {}),
  }});
  if (!env.DB) return json({ error:'데이터베이스 연결이 설정되지 않았습니다.', code:'USER_AI_DATABASE_UNAVAILABLE' }, 503, request, env);
  const identity = await userIdentity(request);
  if (!identity) return json({ error:'EKODI Google 로그인이 필요합니다.', code:'USER_AI_AUTH_REQUIRED' }, 401, request, env);
  await ensureSchema(env.DB);

  if (request.method === 'GET' && url.pathname === '/api/user-ai/status') return status(request, env, identity);
  if (request.method === 'PUT' && url.pathname === '/api/user-ai/preferences') return savePreference(request, env, identity);
  if (request.method === 'POST' && url.pathname === '/api/user-ai/credentials/gemini') return saveGeminiCredential(request, env, identity);
  if (request.method === 'DELETE' && url.pathname === '/api/user-ai/credentials/gemini') return revokeGeminiCredential(request, env, identity);
  if (request.method === 'POST' && url.pathname === '/api/user-ai/assist') return assist(request, env, identity);
  return json({ error:'User AI endpoint not found', code:'USER_AI_NOT_FOUND' }, 404, request, env);
}

export const USER_AI_POLICY = Object.freeze({
  modes:[...MODES],
  providers:PROVIDERS,
  defaultSponsoredRequests:DEFAULT_SPONSORED_REQUESTS,
});
