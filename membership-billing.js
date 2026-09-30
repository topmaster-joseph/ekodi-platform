import authWorker, { isAllowedOrigin } from './auth-worker.js';

const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const TOSS_API = 'https://api.tosspayments.com/v1';
const enc = new TextEncoder();

const SITES = new Set(['portal','marketing','biz','trade','mall','books','church','lab','community','edu','media']);
const TENANT_PLAN_MANAGERS = new Set(['store_owner','accounting_manager','hq_manager','client_admin']);
const STORE_PLAN_MANAGERS = new Set(['store_owner','tenant_admin','platform_admin','accounting_manager','hq_manager','client_admin']);
const MARKETING_PLANS = Object.freeze([
  { id:'free', label:'FREE', monthlyFee:0, summary:'직접 만들어 보고 판단', billing:'free' },
  { id:'flex', label:'FLEX', monthlyFee:0, summary:'월 기본료 없이 필요한 기능만 종량제', billing:'metered' },
  { id:'plus', label:'PLUS', monthlyFee:9900, summary:'매주 꾸준히 예약 운영', billing:'subscription' },
  { id:'pro', label:'PRO', monthlyFee:39900, summary:'다채널 반복 운영과 분석', billing:'subscription' },
  { id:'auto', label:'AUTO', monthlyFee:69900, summary:'승인 규칙 안에서 상시 자동화', billing:'subscription' },
]);
const DEFAULT_PLANS = Object.freeze([
  { id:'free', label:'FREE', monthlyFee:0, summary:'기본 무료 이용', billing:'free' },
]);

function normalizeSite(value) {
  const site = String(value || '').trim().toLowerCase();
  return SITES.has(site) ? site : '';
}
function normalizeTenant(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80);
}
function normalizeStoreId(value) {
  const id = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) ? id : '';
}
function plansFor(site) { return site === 'marketing' ? MARKETING_PLANS : DEFAULT_PLANS; }
function planFor(site, id) { return plansFor(site).find(plan => plan.id === String(id || '').toLowerCase()) || null; }
function billingReady(env) {
  return Boolean(
    String(env.TOSS_BILLING_CLIENT_KEY || '').trim()
    && String(env.TOSS_BILLING_SECRET_KEY || '').trim()
    && String(env.MEMBERSHIP_BILLING_ENCRYPTION_KEY || '').trim()
  );
}
function canManagePlan(subject) {
  if (subject?.type === 'person') return true;
  if (subject?.type === 'store') return STORE_PLAN_MANAGERS.has(String(subject?.role || ''));
  return TENANT_PLAN_MANAGERS.has(String(subject?.tenant?.role || ''));
}
function cors(origin, env) {
  const headers = {
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  if (origin && isAllowedOrigin(origin, env)) headers['access-control-allow-origin'] = origin;
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
async function readJson(request) { try { return await request.json(); } catch { return null; } }
function randomToken(bytes = 24) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map(value => value.toString(16).padStart(2, '0')).join('');
}
function addMonth(dateValue) {
  const date = new Date(dateValue || Date.now());
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString();
}

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS service_subscriptions (
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
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS membership_checkout_intents (
      id TEXT PRIMARY KEY,
      subject_type TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      site TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      customer_key TEXT NOT NULL,
      email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS billing_charge_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER NOT NULL,
      cycle_key TEXT NOT NULL UNIQUE,
      order_id TEXT NOT NULL UNIQUE,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL,
      provider_payment_key TEXT,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      completed_at TEXT
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_service_subscriptions_due ON service_subscriptions(status,next_billing_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_membership_checkout_expiry ON membership_checkout_intents(status,expires_at)'),
  ]);
}

function bearerToken(request) {
  const auth = String(request.headers.get('authorization') || '');
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}
async function supabaseUser(accessToken) {
  if (!accessToken || accessToken.length > 8192) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const user = await response.json();
  const email = String(user?.email || '').trim().toLowerCase();
  if (!user?.id || !email || !user?.email_confirmed_at) return null;
  return {
    id: user.id,
    email,
    displayName: String(user?.user_metadata?.full_name || user?.user_metadata?.name || '').slice(0, 100),
  };
}
async function identityFromRequest(request) {
  return supabaseUser(bearerToken(request));
}
async function supabaseWorkspaces(request, site = 'marketing') {
  const token = bearerToken(request);
  if (!token) return [];
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/current_site_workspaces`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ p_site_key: site }),
  });
  if (!response.ok) return [];
  const value = await response.json();
  return Array.isArray(value) ? value : [];
}
async function adminSession(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method:'GET', headers:request.headers }), env);
  if (!response.ok) return null;
  return response.json();
}

async function resolveStoreSubject(request, identity, site, storeId) {
  const store = normalizeStoreId(storeId);
  if (!store || site !== 'marketing') return null;
  const workspaces = await supabaseWorkspaces(request, 'marketing');
  const item = workspaces.find(row => String(row?.store_id || '').toLowerCase() === store && String(row?.workspace_key || '') === `store:${store}`);
  if (!item) return null;
  return {
    type:'store',
    key:store,
    email:identity.email,
    role:String(item.role || ''),
    basePlan:String(item.plan || '').toLowerCase() === 'basic' ? 'basic' : 'free',
    tenant:{ slug:String(item.tenant || ''), role:String(item.role || '') },
    store:{
      id:store,
      slug:String(item.store || ''),
      name:String(item.store_name || item.workspace_name || ''),
    },
  };
}
async function resolveSubject(env, identity, tenantSlug = '') {
  const tenant = normalizeTenant(tenantSlug);
  if (!tenant) return { type:'person', key:identity.id, email:identity.email, tenant:null, basePlan:'free' };

  const row = await env.DB.prepare('SELECT id,slug,status FROM customer_tenants WHERE slug = ?').bind(tenant).first();
  if (!row || row.status !== 'active') return null;
  const grant = await env.DB.prepare('SELECT role,enabled FROM customer_access_grants WHERE tenant_id = ? AND email = ?')
    .bind(row.id, identity.email).first();
  if (!grant || Number(grant.enabled) !== 1) return null;
  return {
    type:'tenant',
    key:row.slug,
    email:identity.email,
    basePlan:'free',
    tenant:{ id:row.id, slug:row.slug, role:grant.role },
  };
}
async function subjectFor(request, env, identity, site, tenantSlug = '', storeId = '') {
  if (storeId) return resolveStoreSubject(request, identity, site, storeId);
  return resolveSubject(env, identity, tenantSlug);
}

async function subscriptionFor(env, subject, site) {
  let row = await env.DB.prepare('SELECT * FROM service_subscriptions WHERE subject_type = ? AND subject_key = ? AND site = ?')
    .bind(subject.type, subject.key, site).first();
  const basePlan = subject.type === 'store' && site === 'marketing' && subject.basePlan === 'basic' ? 'basic' : 'free';
  const baseStatus = basePlan === 'basic' ? 'active' : 'free';
  if (row) {
    if (basePlan === 'basic' && row.status === 'canceled') {
      const now = new Date().toISOString();
      await env.DB.prepare(`UPDATE service_subscriptions SET
        plan_id='basic',status='active',monthly_fee=0,provider='',provider_customer_key=NULL,
        billing_key_cipher=NULL,billing_key_iv=NULL,current_period_start=NULL,current_period_end=NULL,
        next_billing_at=NULL,cancel_at_period_end=0,updated_at=? WHERE id=?`).bind(now, row.id).run();
      row = await env.DB.prepare('SELECT * FROM service_subscriptions WHERE id=?').bind(row.id).first();
    }
    return row;
  }
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT OR IGNORE INTO service_subscriptions
    (subject_type,subject_key,site,plan_id,status,monthly_fee,created_at,updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)`).bind(subject.type, subject.key, site, basePlan, baseStatus, now, now).run();
  row = await env.DB.prepare('SELECT * FROM service_subscriptions WHERE subject_type = ? AND subject_key = ? AND site = ?')
    .bind(subject.type, subject.key, site).first();
  return row;
}
function publicSubscription(row, subject = null) {
  return {
    planId: row.plan_id,
    status: row.status,
    monthlyFee: Number(row.monthly_fee || 0),
    currentPeriodEnd: row.current_period_end || null,
    nextBillingAt: row.next_billing_at || null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    basePlan: subject?.basePlan || 'free',
  };
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
async function cryptoKey(env) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(String(env.MEMBERSHIP_BILLING_ENCRYPTION_KEY || '')));
  return crypto.subtle.importKey('raw', digest, { name:'AES-GCM' }, false, ['encrypt','decrypt']);
}
async function encryptBillingKey(env, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, await cryptoKey(env), enc.encode(value));
  return { cipher:bytesToB64(cipher), iv:bytesToB64(iv) };
}
async function decryptBillingKey(env, cipher, iv) {
  const clear = await crypto.subtle.decrypt({ name:'AES-GCM', iv:b64ToBytes(iv) }, await cryptoKey(env), b64ToBytes(cipher));
  return new TextDecoder().decode(clear);
}
function tossAuth(env) { return `Basic ${btoa(`${String(env.TOSS_BILLING_SECRET_KEY || '')}:`)}`; }
async function toss(path, { method='GET', body } = {}, env) {
  const response = await fetch(`${TOSS_API}${path}`, {
    method,
    headers: { authorization:tossAuth(env), 'content-type':'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message:text }; }
  if (!response.ok) throw Object.assign(new Error(data.message || data.code || `toss_${response.status}`), { status:response.status, data });
  return data;
}
async function charge(env, { billingKey, customerKey, amount, orderId, orderName, email='' }) {
  const body = { customerKey, amount, orderId, orderName };
  if (email) body.customerEmail = email;
  try {
    return await toss(`/billing/${encodeURIComponent(billingKey)}`, { method:'POST', body }, env);
  } catch (error) {
    try {
      const found = await toss(`/payments/orders/${encodeURIComponent(orderId)}`, {}, env);
      if (found?.status === 'DONE') return found;
    } catch {}
    throw error;
  }
}

async function catalog(request, env) {
  const site = normalizeSite(new URL(request.url).searchParams.get('site'));
  if (!site) return json({ error:'지원하지 않는 서비스입니다.' }, 400, request, env);
  return json({ site, plans:plansFor(site), billingReady:billingReady(env), billingProvider:'toss-billing' }, 200, request, env);
}

async function me(request, env) {
  const url = new URL(request.url);
  const site = normalizeSite(url.searchParams.get('site'));
  const identity = await identityFromRequest(request);
  if (!site || !identity) return json({ error:'Google 로그인 세션을 확인해 주세요.' }, 401, request, env);
  const subject = await subjectFor(request, env, identity, site, url.searchParams.get('tenant'), url.searchParams.get('store'));
  if (!subject) return json({ error:'이 계정은 해당 조직·점포에 등록되어 있지 않습니다.' }, 403, request, env);
  const subscription = await subscriptionFor(env, subject, site);
  return json({
    site,
    subjectType:subject.type,
    tenant:subject.tenant?.slug || null,
    store:subject.store || null,
    role:subject.role || subject.tenant?.role || null,
    basePlan:subject.basePlan || 'free',
    email:identity.email,
    canManagePlan:canManagePlan(subject),
    subscription:publicSubscription(subscription, subject),
    plans:plansFor(site),
    billingReady:billingReady(env),
  }, 200, request, env);
}

async function selectFree(request, env) {
  const identity = await identityFromRequest(request);
  const body = await readJson(request);
  const site = normalizeSite(body?.site);
  const plan = planFor(site, body?.planId);
  if (!identity || !site || !plan) return json({ error:'요청을 확인해 주세요.' }, 400, request, env);
  if (plan.monthlyFee > 0) return json({ error:'유료 플랜은 결제 등록이 필요합니다.', code:'BILLING_REQUIRED' }, 409, request, env);
  const subject = await subjectFor(request, env, identity, site, body?.tenant, body?.store);
  if (!subject) return json({ error:'이 계정은 해당 조직·점포에 등록되어 있지 않습니다.' }, 403, request, env);
  if (!canManagePlan(subject)) return json({ error:'이 조직·점포의 회원등급을 변경할 권한이 없습니다.', code:'PLAN_MANAGER_REQUIRED' }, 403, request, env);
  const current = await subscriptionFor(env, subject, site);
  if (Number(current.monthly_fee) > 0 && current.status === 'active') {
    return json({ error:'현재 월 구독을 먼저 기간 종료 예약한 뒤 무료·종량제로 변경해 주세요.', code:'CANCEL_SUBSCRIPTION_FIRST' }, 409, request, env);
  }
  const baseBasic = subject.type === 'store' && site === 'marketing' && subject.basePlan === 'basic';
  const nextPlan = baseBasic ? 'basic' : plan.id;
  const nextStatus = baseBasic ? 'active' : (plan.id === 'free' ? 'free' : 'active');
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE service_subscriptions
    SET plan_id=?, status=?, monthly_fee=0, provider='', provider_customer_key=NULL,
      billing_key_cipher=NULL, billing_key_iv=NULL, current_period_start=NULL,
      current_period_end=NULL, next_billing_at=NULL, cancel_at_period_end=0, updated_at=?
    WHERE id=?`).bind(nextPlan, nextStatus, now, current.id).run();
  const row = await env.DB.prepare('SELECT * FROM service_subscriptions WHERE id=?').bind(current.id).first();
  return json({ ok:true, subscription:publicSubscription(row, subject) }, 200, request, env);
}

async function billingStart(request, env) {
  const identity = await identityFromRequest(request);
  const body = await readJson(request);
  const site = normalizeSite(body?.site);
  const plan = planFor(site, body?.planId);
  if (!identity || !site || !plan || plan.monthlyFee <= 0) return json({ error:'유료 구독 플랜을 선택해 주세요.' }, 400, request, env);
  if (!billingReady(env)) return json({ error:'자동결제 계약 또는 결제키 연결이 아직 완료되지 않았습니다.', code:'BILLING_NOT_READY' }, 503, request, env);
  const subject = await subjectFor(request, env, identity, site, body?.tenant, body?.store);
  if (!subject) return json({ error:'이 계정은 해당 조직·점포에 등록되어 있지 않습니다.' }, 403, request, env);
  if (!canManagePlan(subject)) return json({ error:'이 조직·점포의 유료 구독을 변경할 권한이 없습니다.', code:'PLAN_MANAGER_REQUIRED' }, 403, request, env);
  const current = await subscriptionFor(env, subject, site);
  if (Number(current.monthly_fee) > 0 && current.status === 'active') {
    return json({
      error: current.plan_id === plan.id ? '이미 이용 중인 월 구독입니다.' : '현재 월 구독 기간이 끝난 뒤 다른 유료 플랜으로 변경해 주세요.',
      code: current.plan_id === plan.id ? 'ALREADY_SUBSCRIBED' : 'ACTIVE_SUBSCRIPTION_EXISTS',
      subscription: publicSubscription(current, subject),
    }, 409, request, env);
  }

  const checkout = randomToken(24);
  const customerKey = `ekodi-${crypto.randomUUID()}`;
  const now = new Date();
  const expires = new Date(now.getTime() + 20 * 60 * 1000);
  await env.DB.prepare(`INSERT INTO membership_checkout_intents
    (id,subject_type,subject_key,site,plan_id,amount,customer_key,email,status,expires_at,created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
    .bind(checkout, subject.type, subject.key, site, plan.id, plan.monthlyFee, customerKey, identity.email, expires.toISOString(), now.toISOString()).run();

  const returnTo = String(body?.returnTo || '').slice(0, 500);
  const callback = new URL('https://auth.ekodi.kr/');
  callback.searchParams.set('site', site);
  callback.searchParams.set('billing', 'success');
  callback.searchParams.set('checkout', checkout);
  if (subject.type === 'store') callback.searchParams.set('store', subject.key);
  if (returnTo) callback.searchParams.set('return_to', returnTo);
  const fail = new URL(callback);
  fail.searchParams.set('billing', 'fail');
  return json({
    ok:true,
    clientKey:String(env.TOSS_BILLING_CLIENT_KEY),
    customerKey,
    checkout,
    successUrl:callback.href,
    failUrl:fail.href,
    amount:plan.monthlyFee,
    plan,
    subjectType:subject.type,
    store:subject.store || null,
  }, 200, request, env);
}

async function authorizeCheckout(request, env, identity, row) {
  if (String(row.email || '').toLowerCase() !== identity.email) return false;
  if (row.subject_type === 'person') return row.subject_key === identity.id;
  if (row.subject_type === 'store') {
    const subject = await resolveStoreSubject(request, identity, row.site, row.subject_key);
    return Boolean(subject && canManagePlan(subject));
  }
  if (row.subject_type !== 'tenant') return false;
  const tenant = await env.DB.prepare('SELECT id,status FROM customer_tenants WHERE slug = ?').bind(row.subject_key).first();
  if (!tenant || tenant.status !== 'active') return false;
  const grant = await env.DB.prepare('SELECT role,enabled FROM customer_access_grants WHERE tenant_id = ? AND email = ?')
    .bind(tenant.id, identity.email).first();
  return Boolean(grant && Number(grant.enabled) === 1 && TENANT_PLAN_MANAGERS.has(String(grant.role || '')));
}

async function billingComplete(request, env) {
  const identity = await identityFromRequest(request);
  const body = await readJson(request);
  if (!identity || !body?.checkout || !body?.authKey || !body?.customerKey) return json({ error:'결제 인증 정보를 확인해 주세요.' }, 400, request, env);
  if (!billingReady(env)) return json({ error:'자동결제 연결이 준비되지 않았습니다.', code:'BILLING_NOT_READY' }, 503, request, env);

  const checkout = await env.DB.prepare('SELECT * FROM membership_checkout_intents WHERE id = ?').bind(String(body.checkout)).first();
  if (!checkout || checkout.status !== 'pending' || checkout.expires_at <= new Date().toISOString()) {
    return json({ error:'결제 요청이 만료되었거나 이미 처리되었습니다.' }, 409, request, env);
  }
  if (checkout.customer_key !== String(body.customerKey) || !(await authorizeCheckout(request, env, identity, checkout))) {
    return json({ error:'결제 요청 계정을 확인할 수 없습니다.' }, 403, request, env);
  }
  const plan = planFor(checkout.site, checkout.plan_id);
  if (!plan || plan.monthlyFee !== Number(checkout.amount)) return json({ error:'요금제 금액 검증에 실패했습니다.' }, 409, request, env);

  let billing;
  try {
    billing = await toss('/billing/authorizations/issue', {
      method:'POST',
      body:{ authKey:String(body.authKey), customerKey:checkout.customer_key },
    }, env);
  } catch (error) {
    await env.DB.prepare("UPDATE membership_checkout_intents SET status='failed' WHERE id = ?").bind(checkout.id).run();
    return json({ error:`결제수단 등록 실패: ${error.message}` }, 502, request, env);
  }
  if (!billing?.billingKey) return json({ error:'빌링키가 발급되지 않았습니다.' }, 502, request, env);

  const now = new Date();
  const orderId = `ekodi-${checkout.plan_id}-${randomToken(8)}`;
  let payment;
  try {
    payment = await charge(env, {
      billingKey:billing.billingKey,
      customerKey:checkout.customer_key,
      amount:plan.monthlyFee,
      orderId,
      orderName:`EKODI ${plan.label} 월 구독`,
      email:checkout.email,
    });
  } catch (error) {
    await env.DB.prepare("UPDATE membership_checkout_intents SET status='payment_failed' WHERE id = ?").bind(checkout.id).run();
    return json({ error:`첫 구독 결제 실패: ${error.message}` }, 502, request, env);
  }
  if (payment?.status !== 'DONE') return json({ error:'결제가 완료 상태가 아닙니다.' }, 502, request, env);

  const encrypted = await encryptBillingKey(env, billing.billingKey);
  const periodStart = now.toISOString();
  const periodEnd = addMonth(now);
  await env.DB.prepare(`INSERT INTO service_subscriptions
    (subject_type,subject_key,site,plan_id,status,monthly_fee,provider,provider_customer_key,
      billing_key_cipher,billing_key_iv,current_period_start,current_period_end,next_billing_at,
      cancel_at_period_end,created_at,updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, 'toss', ?, ?, ?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT(subject_type,subject_key,site) DO UPDATE SET
      plan_id=excluded.plan_id,status='active',monthly_fee=excluded.monthly_fee,provider='toss',
      provider_customer_key=excluded.provider_customer_key,billing_key_cipher=excluded.billing_key_cipher,
      billing_key_iv=excluded.billing_key_iv,current_period_start=excluded.current_period_start,
      current_period_end=excluded.current_period_end,next_billing_at=excluded.next_billing_at,
      cancel_at_period_end=0,updated_at=excluded.updated_at`)
    .bind(checkout.subject_type, checkout.subject_key, checkout.site, checkout.plan_id, plan.monthlyFee,
      checkout.customer_key, encrypted.cipher, encrypted.iv, periodStart, periodEnd, periodEnd, periodStart, periodStart).run();

  const subscription = await env.DB.prepare('SELECT * FROM service_subscriptions WHERE subject_type=? AND subject_key=? AND site=?')
    .bind(checkout.subject_type, checkout.subject_key, checkout.site).first();
  await env.DB.batch([
    env.DB.prepare("UPDATE membership_checkout_intents SET status='completed',completed_at=? WHERE id=?").bind(periodStart, checkout.id),
    env.DB.prepare(`INSERT INTO billing_charge_events
      (subscription_id,cycle_key,order_id,amount,status,provider_payment_key,created_at,completed_at)
      VALUES (?, ?, ?, ?, 'done', ?, ?, ?)`)
      .bind(subscription.id, `initial:${checkout.id}`, orderId, plan.monthlyFee, payment.paymentKey || '', periodStart, periodStart),
  ]);
  return json({ ok:true, subscription:publicSubscription(subscription), payment:{ orderId, paymentKey:payment.paymentKey || null } }, 200, request, env);
}

async function cancel(request, env) {
  const identity = await identityFromRequest(request);
  const body = await readJson(request);
  const site = normalizeSite(body?.site);
  if (!identity || !site) return json({ error:'요청을 확인해 주세요.' }, 400, request, env);
  const subject = await subjectFor(request, env, identity, site, body?.tenant, body?.store);
  if (!subject) return json({ error:'이 계정은 해당 조직·점포에 등록되어 있지 않습니다.' }, 403, request, env);
  if (!canManagePlan(subject)) return json({ error:'이 조직·점포의 구독을 해지할 권한이 없습니다.', code:'PLAN_MANAGER_REQUIRED' }, 403, request, env);
  const row = await subscriptionFor(env, subject, site);
  if (Number(row.monthly_fee) <= 0) return json({ ok:true, subscription:publicSubscription(row, subject) }, 200, request, env);
  await env.DB.prepare('UPDATE service_subscriptions SET cancel_at_period_end=1,updated_at=? WHERE id=?')
    .bind(new Date().toISOString(), row.id).run();
  const updated = await env.DB.prepare('SELECT * FROM service_subscriptions WHERE id=?').bind(row.id).first();
  return json({ ok:true, subscription:publicSubscription(updated, subject) }, 200, request, env);
}

async function adminSubscriptions(request, env) {
  const session = await adminSession(request, env);
  if (!session) return json({ error:'EKODI 관리자 인증이 필요합니다.' }, 401, request, env);
  const rows = await env.DB.prepare(`SELECT id,subject_type,subject_key,site,plan_id,status,monthly_fee,provider,
    current_period_start,current_period_end,next_billing_at,cancel_at_period_end,created_at,updated_at
    FROM service_subscriptions ORDER BY updated_at DESC LIMIT 200`).all();
  return json({ subscriptions:rows.results || [], billingReady:billingReady(env) }, 200, request, env);
}
async function adminCharges(request, env) {
  const session = await adminSession(request, env);
  if (!session) return json({ error:'EKODI 관리자 인증이 필요합니다.' }, 401, request, env);
  const rows = await env.DB.prepare(`SELECT c.id,c.subscription_id,c.cycle_key,c.order_id,c.amount,c.status,
    c.provider_payment_key,c.detail,c.created_at,c.completed_at,
    s.subject_type,s.subject_key,s.site,s.plan_id
    FROM billing_charge_events c JOIN service_subscriptions s ON s.id=c.subscription_id
    ORDER BY c.created_at DESC LIMIT 200`).all();
  return json({ charges:rows.results || [] }, 200, request, env);
}

export async function handleMembershipBilling(request, env) {
  if (!env.DB) return json({ error:'데이터베이스 연결이 설정되지 않았습니다.' }, 503, request, env);
  const origin = request.headers.get('origin');
  if (origin && !isAllowedOrigin(origin, env)) return json({ error:'허용되지 않은 요청입니다.' }, 403, request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:cors(origin, env) });
  await ensureSchema(env.DB);
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === '/api/membership/catalog') return catalog(request, env);
  if (request.method === 'GET' && path === '/api/membership/me') return me(request, env);
  if (request.method === 'POST' && path === '/api/membership/select') return selectFree(request, env);
  if (request.method === 'POST' && path === '/api/membership/billing/start') return billingStart(request, env);
  if (request.method === 'POST' && path === '/api/membership/billing/complete') return billingComplete(request, env);
  if (request.method === 'POST' && path === '/api/membership/cancel') return cancel(request, env);
  if (request.method === 'GET' && path === '/api/membership/admin/subscriptions') return adminSubscriptions(request, env);
  if (request.method === 'GET' && path === '/api/membership/admin/charges') return adminCharges(request, env);
  return null;
}

export async function runMembershipBillingSchedule(env) {
  if (!env.DB) return { processed:0 };
  await ensureSchema(env.DB);
  const now = new Date().toISOString();

  await env.DB.prepare(`UPDATE service_subscriptions SET
    status='canceled',next_billing_at=NULL,provider_customer_key=NULL,billing_key_cipher=NULL,billing_key_iv=NULL,updated_at=?
    WHERE status='active' AND cancel_at_period_end=1 AND current_period_end IS NOT NULL AND current_period_end<=?`)
    .bind(now, now).run();

  if (!billingReady(env)) return { processed:0, billingReady:false };
  const due = await env.DB.prepare(`SELECT * FROM service_subscriptions
    WHERE status='active' AND cancel_at_period_end=0 AND monthly_fee>0
      AND next_billing_at IS NOT NULL AND next_billing_at<=?
    ORDER BY next_billing_at LIMIT 20`).bind(now).all();

  let processed = 0;
  for (const row of due.results || []) {
    const cycle = `renew:${row.id}:${String(row.next_billing_at).slice(0, 10)}`;
    const exists = await env.DB.prepare('SELECT status FROM billing_charge_events WHERE cycle_key=?').bind(cycle).first();
    if (exists) continue;
    const orderId = `ekodi-renew-${row.id}-${randomToken(6)}`;
    await env.DB.prepare(`INSERT INTO billing_charge_events
      (subscription_id,cycle_key,order_id,amount,status,created_at)
      VALUES (?, ?, ?, ?, 'processing', ?)`)
      .bind(row.id, cycle, orderId, row.monthly_fee, now).run();
    try {
      const billingKey = await decryptBillingKey(env, row.billing_key_cipher, row.billing_key_iv);
      const payment = await charge(env, {
        billingKey,
        customerKey:row.provider_customer_key,
        amount:Number(row.monthly_fee),
        orderId,
        orderName:`EKODI ${String(row.plan_id).toUpperCase()} 월 구독`,
      });
      if (payment?.status !== 'DONE') throw new Error(`payment_status_${payment?.status || 'unknown'}`);
      const next = addMonth(row.next_billing_at);
      await env.DB.batch([
        env.DB.prepare("UPDATE billing_charge_events SET status='done',provider_payment_key=?,completed_at=? WHERE cycle_key=?")
          .bind(payment.paymentKey || '', now, cycle),
        env.DB.prepare(`UPDATE service_subscriptions SET current_period_start=?,current_period_end=?,next_billing_at=?,updated_at=? WHERE id=?`)
          .bind(row.next_billing_at, next, next, now, row.id),
      ]);
      processed += 1;
    } catch (error) {
      await env.DB.batch([
        env.DB.prepare("UPDATE billing_charge_events SET status='failed',detail=?,completed_at=? WHERE cycle_key=?")
          .bind(String(error?.message || error).slice(0, 300), now, cycle),
        env.DB.prepare("UPDATE service_subscriptions SET status='past_due',updated_at=? WHERE id=?").bind(now, row.id),
      ]);
    }
  }

  await env.DB.prepare("DELETE FROM membership_checkout_intents WHERE status='pending' AND expires_at<=?").bind(now).run();
  return { processed, billingReady:true };
}