import { isAllowedOrigin } from './auth-worker.js';
import { createSponsoredUserOpenAiProvider } from './user-openai-provider-adapter.js';
import {
  buildPersonalAiBridgeSnapshot,
  canonicalAiSubject,
  legacyAiSubject,
  personalAiSubjectCandidates,
  resolveCanonicalEkodiIdentity,
} from './personal-ai-bridge.js';
import { AI_ACCESS_POLICY, resolveAiAccessRoute, routeSequence } from './ai-access-orchestration.js';
import {
  PERSONAL_AI_PROVIDER_REGISTRY,
  createPersonalProvider,
  firstConnectionGuide,
  getPersonalAiProvider,
  personalAiProviders,
  personalApiProviderIds,
  personalWebProviderIds,
  validatePersonalApiKey,
} from './personal-ai-provider-registry.js';

const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MODES = new Set(['auto', 'personal-first', 'ekodi-first', 'off']);
const INTENTS = new Set(['interactive', 'proactive']);
const PROVIDERS = Object.freeze(personalAiProviders());
const PROVIDER_IDS = new Set(PROVIDERS.map(item => item.id));
const API_PROVIDER_IDS = new Set(personalApiProviderIds());
const WEB_PROVIDER_IDS = new Set(personalWebProviderIds());
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
    headers:{ apikey:SUPABASE_PUBLISHABLE_KEY, authorization:`Bearer ${token}` },
  });
  if (!response.ok) return null;
  const user = await response.json();
  const email = String(user?.email || '').trim().toLowerCase();
  if (!user?.id || !email || !user?.email_confirmed_at) return null;
  return resolveCanonicalEkodiIdentity({ token, authUser:{ id:String(user.id), email } });
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
function normalizeIntent(value) { return INTENTS.has(value) ? value : 'interactive'; }

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
    freeEkodiApiCost:id === 'free' || id === 'flex' ? 0 : null,
  });
}

export function classifyUserAiData(message = '', declared = 'general') {
  const requested = String(declared || '').toLowerCase();
  const level = ['public','general','private','sensitive'].includes(requested) ? requested : 'general';
  if (level === 'sensitive' || SENSITIVE_RE.test(String(message || ''))) return 'sensitive';
  return level;
}

export function chooseUserAiRoute(options = {}) {
  return resolveAiAccessRoute({
    mode:options.mode,
    intent:options.intent || 'interactive',
    surface:'user',
    aiRequired:options.aiRequired,
    hasPersonalApi:options.hasPersonal,
    personalApiAllowed:options.personalAllowed,
    personalWebAvailable:options.personalWebAvailable !== false,
    sponsoredAvailable:options.sponsoredAvailable,
    sponsoredRemaining:options.sponsoredRemaining,
  }).route;
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
  let row = null;
  for (const subject of personalAiSubjectCandidates(identity)) {
    row = await env.DB.prepare('SELECT mode,preferred_provider FROM user_ai_preferences WHERE user_id=?').bind(subject).first();
    if (row) break;
  }
  const preferred = String(row?.preferred_provider || 'gemini-api');
  return {
    mode:MODES.has(row?.mode) ? row.mode : 'auto',
    preferredProvider:PROVIDER_IDS.has(preferred) ? preferred : 'gemini-api',
  };
}

async function credentialsFor(env, identity) {
  const byProvider = new Map();
  for (const subject of personalAiSubjectCandidates(identity)) {
    const rows = await env.DB.prepare(`SELECT provider,secret_cipher,secret_iv,updated_at FROM user_ai_credentials
      WHERE user_id=? AND revoked_at IS NULL ORDER BY updated_at DESC`).bind(subject).all();
    for (const row of rows.results || []) {
      const provider = String(row.provider || '');
      if (API_PROVIDER_IDS.has(provider) && !byProvider.has(provider)) byProvider.set(provider, row);
    }
  }
  return [...byProvider.values()];
}

function selectedCredential(pref, credentials) {
  if (!Array.isArray(credentials) || !credentials.length) return null;
  const preferred = credentials.find(row => row.provider === pref.preferredProvider);
  if (preferred) return preferred;
  const order = personalApiProviderIds();
  return [...credentials].sort((a, b) => order.indexOf(a.provider) - order.indexOf(b.provider))[0] || null;
}

function membershipSubjectCandidates(identity) {
  return [...new Set([identity.personId, canonicalAiSubject(identity), legacyAiSubject(identity)].filter(Boolean).map(String))];
}

async function planFor(env, identity, site) {
  for (const subject of membershipSubjectCandidates(identity)) {
    const row = await env.DB.prepare(`SELECT plan_id,status FROM service_subscriptions
      WHERE subject_type='person' AND subject_key=? AND site=? LIMIT 1`).bind(subject, site).first();
    if (row) return { planId:String(row.plan_id || 'free').toLowerCase(), status:String(row.status || 'free').toLowerCase() };
  }
  return { planId:'free', status:'eligible' };
}
function monthStart() {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}
async function sponsoredUsage(env, identity, site) {
  let count = 0;
  for (const subject of personalAiSubjectCandidates(identity)) {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM user_ai_usage
      WHERE user_id=? AND site=? AND funding='ekodi' AND created_at>=?`).bind(subject, site, monthStart()).first();
    count += Number(row?.count || 0);
  }
  return count;
}
async function recordUsage(env, identity, { site, planId, funding, provider, model='' }) {
  await env.DB.prepare(`INSERT INTO user_ai_usage(user_id,site,plan_id,funding,provider,model,created_at)
    VALUES(?,?,?,?,?,?,?)`).bind(canonicalAiSubject(identity), site, planId, funding, provider, model, new Date().toISOString()).run();
}

function publicProviders(credentials = [], vaultReady = false) {
  const connected = new Set(credentials.map(row => row.provider));
  return PROVIDERS.map(provider => ({
    ...provider,
    connected:provider.kind === 'personal-api' ? connected.has(provider.id) : null,
    connectionReady:provider.kind === 'personal-api' ? vaultReady : true,
  }));
}

async function status(request, env, identity) {
  const url = new URL(request.url);
  const site = normalizeSite(url.searchParams.get('site'));
  const pref = await preferenceFor(env, identity);
  const credentials = await credentialsFor(env, identity);
  const plan = await planFor(env, identity, site);
  const policy = fundingPolicyForPlan(plan.planId, env);
  const used = await sponsoredUsage(env, identity, site);
  const remaining = Math.max(0, policy.sponsoredRequests - used);
  const vaultReady = Boolean(String(env.USER_AI_CREDENTIAL_ENCRYPTION_KEY || '').trim());
  const connectedProviderIds = credentials.map(row => row.provider);
  return json({
    schemaVersion:4,
    policy:'automatic-personal-first-provider-independent',
    accessPolicyVersion:AI_ACCESS_POLICY.version,
    providerRegistryVersion:PERSONAL_AI_PROVIDER_REGISTRY.version,
    bridge:buildPersonalAiBridgeSnapshot(identity),
    account:{ email:identity.email, ekodiId:identity.ekodiId || null },
    site,
    preference:pref,
    plan:{ ...plan, sponsoredRequests:policy.sponsoredRequests, sponsoredUsed:used, sponsoredRemaining:remaining },
    providers:publicProviders(credentials, vaultReady),
    connectedProviderIds,
    connectionGuide:firstConnectionGuide(connectedProviderIds),
    routing:{
      automatic:true,
      interactive:routeSequence({ mode:pref.mode, intent:'interactive', surface:'user' }),
      proactive:routeSequence({ mode:pref.mode, intent:'proactive', surface:'user' }),
      userShouldNotNeedProviderKnowledge:true,
    },
    rules:{
      coreFirst:true,
      freeUsesEkodiPaidApi:false,
      personalWebQuotaIsProviderOwned:true,
      personalApiCostOwnedByUser:true,
      sensitiveDataToPersonalFreeApi:false,
      personalWebForProactive:false,
      paidInteractiveMayUseSponsoredApiForContinuity:true,
      coreWorksWithoutAi:true,
    },
  }, 200, request, env);
}

export async function userAiStatusForIdentity(request, env, identity) {
  if (!env?.DB || !identity?.canonical) return json({ error:'EKODI ID가 필요합니다.', code:'USER_AI_CANONICAL_ID_REQUIRED' }, 403, request, env || {});
  await ensureSchema(env.DB);
  return status(request, env, identity);
}

async function savePreference(request, env, identity) {
  let body = null;
  try { body = await request.json(); } catch {}
  const mode = MODES.has(body?.mode) ? body.mode : '';
  const provider = PROVIDER_IDS.has(body?.preferredProvider) ? body.preferredProvider : '';
  if (!mode || !provider) return json({ error:'AI 사용 방식 또는 공급자를 확인해 주세요.', code:'USER_AI_PREFERENCE_INVALID' }, 400, request, env);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO user_ai_preferences(user_id,mode,preferred_provider,created_at,updated_at)
    VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET mode=excluded.mode,preferred_provider=excluded.preferred_provider,updated_at=excluded.updated_at`)
    .bind(canonicalAiSubject(identity), mode, provider, now, now).run();
  return json({ ok:true, preference:{ mode, preferredProvider:provider } }, 200, request, env);
}

async function saveCredential(request, env, identity, providerId) {
  if (!API_PROVIDER_IDS.has(providerId)) return json({ error:'지원하지 않는 개인 AI 공급자입니다.', code:'USER_AI_PROVIDER_UNSUPPORTED' }, 404, request, env);
  if (!String(env.USER_AI_CREDENTIAL_ENCRYPTION_KEY || '').trim()) {
    return json({ error:'개인 AI 보안 저장소가 아직 활성화되지 않았습니다.', code:'USER_AI_VAULT_NOT_CONFIGURED' }, 503, request, env);
  }
  let body = null;
  try { body = await request.json(); } catch {}
  const apiKey = String(body?.apiKey || '').trim();
  const validation = validatePersonalApiKey(providerId, apiKey);
  if (!validation.ok) return json({ error:'API 키 형식을 확인해 주세요.', code:`USER_AI_${validation.code}` }, 400, request, env);
  const encrypted = await encryptSecret(env, apiKey);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO user_ai_credentials(user_id,provider,secret_cipher,secret_iv,created_at,updated_at,revoked_at)
    VALUES(?,?,?,?,?,?,NULL) ON CONFLICT(user_id,provider) DO UPDATE SET secret_cipher=excluded.secret_cipher,secret_iv=excluded.secret_iv,updated_at=excluded.updated_at,revoked_at=NULL`)
    .bind(canonicalAiSubject(identity), providerId, encrypted.cipher, encrypted.iv, now, now).run();
  const definition = getPersonalAiProvider(providerId);
  return json({ ok:true, provider:providerId, label:definition?.label || providerId, connected:true }, 200, request, env);
}

async function revokeCredential(request, env, identity, providerId) {
  if (!API_PROVIDER_IDS.has(providerId)) return json({ error:'지원하지 않는 개인 AI 공급자입니다.', code:'USER_AI_PROVIDER_UNSUPPORTED' }, 404, request, env);
  const now = new Date().toISOString();
  for (const subject of personalAiSubjectCandidates(identity)) {
    await env.DB.prepare(`UPDATE user_ai_credentials SET revoked_at=?,updated_at=? WHERE user_id=? AND provider=?`)
      .bind(now, now, subject, providerId).run();
  }
  return json({ ok:true, provider:providerId, connected:false }, 200, request, env);
}

function webProviderFor(preferred) {
  if (WEB_PROVIDER_IDS.has(preferred)) return preferred;
  if (preferred === 'openai-api') return 'chatgpt-web';
  if (preferred === 'claude-api') return 'claude-web';
  return 'gemini-web';
}

function handoffPayload(preferred = 'gemini-web', notice = '') {
  const order = [webProviderFor(preferred), 'gemini-web', 'chatgpt-web', 'claude-web'];
  const seen = new Set();
  const handoffs = [];
  for (const id of order) {
    if (seen.has(id)) continue;
    seen.add(id);
    const provider = getPersonalAiProvider(id);
    if (provider?.kind === 'personal-web') handoffs.push({ id:provider.id, label:provider.label, url:provider.url });
  }
  return { mode:'personal-web', funding:'personal', provider:null, text:'내 개인 AI에서 계속할 수 있습니다.', notice, handoffs, ekodiCost:false };
}

function personalProviderOptions(providerId, apiKey, env) {
  if (providerId === 'gemini-api') return { apiKey, model:String(env.USER_AI_GEMINI_MODEL || '').trim() || undefined };
  if (providerId === 'openai-api') return { apiKey, model:String(env.USER_AI_OPENAI_MODEL || '').trim() || undefined };
  if (providerId === 'claude-api') return { apiKey, model:String(env.USER_AI_CLAUDE_MODEL || '').trim() || undefined };
  return { apiKey };
}

async function assist(request, env, identity) {
  let body = null;
  try { body = await request.json(); } catch {}
  const message = String(body?.message || '').trim().slice(0, 4000);
  if (!message) return json({ error:'질문을 입력해 주세요.', code:'USER_AI_EMPTY_MESSAGE' }, 400, request, env);
  const site = normalizeSite(body?.site);
  const intent = normalizeIntent(body?.intent);
  const aiRequired = body?.aiRequired !== false;
  const dataClass = classifyUserAiData(message, body?.dataClass || 'general');
  const pref = await preferenceFor(env, identity);
  const credentials = await credentialsFor(env, identity);
  const credential = selectedCredential(pref, credentials);
  const plan = await planFor(env, identity, site);
  const policy = fundingPolicyForPlan(plan.planId, env);
  const used = await sponsoredUsage(env, identity, site);
  const remaining = Math.max(0, policy.sponsoredRequests - used);
  const sponsoredProvider = createSponsoredUserOpenAiProvider(env);
  const personalAllowed = dataClass === 'public' || dataClass === 'general';
  const sponsoredAvailable = sponsoredProvider.available && policy.sponsoredEligible && !['canceled','past_due'].includes(plan.status);
  const decision = resolveAiAccessRoute({
    mode:pref.mode,
    intent,
    surface:'user',
    aiRequired,
    hasPersonalApi:Boolean(credential),
    personalApiAllowed:personalAllowed,
    personalWebAvailable:personalAllowed,
    sponsoredAvailable,
    sponsoredRemaining:remaining,
  });

  const coreResult = notice => json({
    mode:'core-only', funding:'none', provider:null,
    text:'AI 호출 없이 EKODI Core 기본 기능을 계속 이용합니다.',
    notice, dataClass, intent, routeReason:decision.reason, ekodiCost:false,
  }, 200, request, env);

  if (decision.route === 'core-only') {
    const notice = dataClass === 'sensitive'
      ? '민감정보로 판단되어 개인 무료 AI로 전송하지 않았습니다.'
      : !aiRequired ? '이 작업은 AI 없이 처리하도록 분류되었습니다.' : '';
    return coreResult(notice);
  }

  const tryPersonal = async () => {
    if (!credential || !personalAllowed) return null;
    const apiKey = await decryptSecret(env, credential.secret_cipher, credential.secret_iv);
    const provider = createPersonalProvider(credential.provider, personalProviderOptions(credential.provider, apiKey, env));
    if (!provider?.available) return null;
    const result = await provider.invoke({ message });
    await recordUsage(env, identity, { site, planId:plan.planId, funding:'personal', provider:credential.provider, model:result.model });
    const definition = getPersonalAiProvider(credential.provider);
    return {
      mode:'ai', funding:'personal', provider:credential.provider, providerLabel:definition?.shortLabel || definition?.label || credential.provider,
      text:result.text, model:result.model, dataClass, intent, ekodiCost:false,
    };
  };

  const trySponsored = async () => {
    if (!sponsoredAvailable || remaining <= 0) return null;
    const result = await sponsoredProvider.invoke({ message, site });
    await recordUsage(env, identity, { site, planId:plan.planId, funding:'ekodi', provider:sponsoredProvider.id, model:result.model });
    return {
      mode:'ai', funding:'ekodi', provider:sponsoredProvider.id, providerLabel:'OpenAI · EKODI 지원', text:result.text, model:result.model, dataClass, intent, ekodiCost:true,
      quota:{ monthly:policy.sponsoredRequests, used:used + 1, remaining:Math.max(0, remaining - 1) },
    };
  };

  try {
    if (decision.route === 'personal-web') {
      return json({ ...handoffPayload(pref.preferredProvider, '개인 AI 계정의 사용량을 이용합니다.'), dataClass, intent, routeReason:decision.reason }, 200, request, env);
    }
    if (decision.route === 'personal-api') {
      const personal = await tryPersonal();
      if (personal) return json({ ...personal, routeReason:decision.reason }, 200, request, env);
      const fallbackDecision = resolveAiAccessRoute({
        mode:pref.mode === 'personal-first' ? 'personal-first' : 'auto', intent, surface:'user', aiRequired:true,
        hasPersonalApi:false, personalApiAllowed:false, personalWebAvailable:personalAllowed,
        sponsoredAvailable, sponsoredRemaining:remaining,
      });
      if (fallbackDecision.route === 'personal-web') return json({ ...handoffPayload(pref.preferredProvider, '연결된 개인 API가 응답하지 않아 내 AI 화면으로 이어드립니다.'), dataClass, intent, routeReason:fallbackDecision.reason }, 200, request, env);
      if (fallbackDecision.route === 'ekodi-sponsored') {
        const sponsored = await trySponsored();
        if (sponsored) return json({ ...sponsored, routeReason:fallbackDecision.reason }, 200, request, env);
      }
    }
    if (decision.route === 'ekodi-sponsored') {
      const sponsored = await trySponsored();
      if (sponsored) return json({ ...sponsored, routeReason:decision.reason }, 200, request, env);
      const personal = await tryPersonal();
      if (personal) return json({ ...personal, routeReason:'sponsored-unavailable-personal-api' }, 200, request, env);
      if (intent === 'interactive' && personalAllowed) {
        return json({ ...handoffPayload(pref.preferredProvider, '회원 지원 AI가 응답하지 않아 내 개인 AI로 이어드립니다.'), dataClass, intent, routeReason:'sponsored-unavailable-personal-web' }, 200, request, env);
      }
    }
  } catch (error) {
    console.error('User AI provider invocation failed', { route:decision.route, intent, provider:credential?.provider || null, error:String(error?.message || error) });
  }

  if (intent === 'interactive' && personalAllowed) {
    const notice = policy.sponsoredEligible
      ? '현재 연결 가능한 API가 없어 내 개인 AI로 이어드립니다.'
      : 'FREE/FLEX 회원은 EKODI 유료 API로 자동 전환하지 않습니다.';
    return json({ ...handoffPayload(pref.preferredProvider, notice), dataClass, intent, routeReason:'final-personal-web-fallback' }, 200, request, env);
  }
  return coreResult('선제 실행에 사용할 수 있는 서버 API가 없어 Core 모드로 유지합니다.');
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
  if (!identity) return json({ error:'EKODI 로그인이 필요합니다.', code:'USER_AI_AUTH_REQUIRED' }, 401, request, env);
  await ensureSchema(env.DB);

  if (request.method === 'GET' && url.pathname === '/api/user-ai/status') return status(request, env, identity);
  if (request.method === 'PUT' && url.pathname === '/api/user-ai/preferences') return savePreference(request, env, identity);

  const connectionMatch = url.pathname.match(/^\/api\/user-ai\/connections\/(gemini-api|openai-api|claude-api)$/);
  if (connectionMatch && request.method === 'POST') return saveCredential(request, env, identity, connectionMatch[1]);
  if (connectionMatch && request.method === 'DELETE') return revokeCredential(request, env, identity, connectionMatch[1]);

  if (request.method === 'POST' && url.pathname === '/api/user-ai/credentials/gemini') return saveCredential(request, env, identity, 'gemini-api');
  if (request.method === 'DELETE' && url.pathname === '/api/user-ai/credentials/gemini') return revokeCredential(request, env, identity, 'gemini-api');
  if (request.method === 'POST' && url.pathname === '/api/user-ai/assist') return assist(request, env, identity);
  return json({ error:'User AI endpoint not found', code:'USER_AI_NOT_FOUND' }, 404, request, env);
}

export const USER_AI_POLICY = Object.freeze({
  modes:[...MODES],
  intents:[...INTENTS],
  providers:PROVIDERS,
  defaultSponsoredRequests:DEFAULT_SPONSORED_REQUESTS,
  accessPolicyVersion:AI_ACCESS_POLICY.version,
  providerRegistryVersion:PERSONAL_AI_PROVIDER_REGISTRY.version,
});
