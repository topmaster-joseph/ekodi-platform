import authWorker, { isAllowedOrigin } from './auth-worker.js';

const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const TOSS_API = 'https://api.tosspayments.com/v1';
const AUTHOR_ORIGIN = 'https://author.ekodi.kr';
const PAID_PLANS = new Set(['author', 'pro']);
const enc = new TextEncoder();

function cors(origin, env) {
  const headers = {
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
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

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

function bearerToken(request) {
  const value = String(request.headers.get('authorization') || '');
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}

async function supabaseUser(accessToken) {
  if (!accessToken || accessToken.length > 8192) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) return null;
  const user = await response.json();
  const email = String(user?.email || '').trim().toLowerCase();
  if (!user?.id || !email || !user?.email_confirmed_at) return null;
  return { id:String(user.id), email };
}

async function identityFromRequest(request) {
  return supabaseUser(bearerToken(request));
}

async function adminSession(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), {
    method:'GET',
    headers:request.headers,
  }), env);
  if (!response.ok) return null;
  return response.json();
}

function billingReady(env) {
  return Boolean(
    String(env.TOSS_BILLING_CLIENT_KEY || '').trim()
    && String(env.TOSS_BILLING_SECRET_KEY || '').trim()
    && String(env.MEMBERSHIP_BILLING_ENCRYPTION_KEY || '').trim()
  );
}

function randomToken(bytes = 24) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map(value => value.toString(16).padStart(2, '0')).join('');
}

function addMonth(value) {
  const date = new Date(value || Date.now());
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString();
}

function validReturnTo(raw) {
  try {
    const target = new URL(String(raw || `${AUTHOR_ORIGIN}/#membership`));
    if (target.protocol !== 'https:' || target.origin !== AUTHOR_ORIGIN) return `${AUTHOR_ORIGIN}/#membership`;
    return target.href;
  } catch {
    return `${AUTHOR_ORIGIN}/#membership`;
  }
}

function bytesToB64(value) {
  let binary = '';
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function b64ToBytes(value) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
  return out;
}

async function cryptoKey(env) {
  const secret = String(env.MEMBERSHIP_BILLING_ENCRYPTION_KEY || '');
  if (!secret) throw new Error('billing_encryption_not_configured');
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(secret));
  return crypto.subtle.importKey('raw', digest, { name:'AES-GCM' }, false, ['encrypt','decrypt']);
}

async function encryptBillingKey(env, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, await cryptoKey(env), enc.encode(value));
  return { cipher:bytesToB64(cipher), iv:bytesToB64(iv) };
}

async function decryptBillingKey(env, cipher, iv) {
  const clear = await crypto.subtle.decrypt(
    { name:'AES-GCM', iv:b64ToBytes(iv) },
    await cryptoKey(env),
    b64ToBytes(cipher),
  );
  return new TextDecoder().decode(clear);
}

function tossAuth(env) {
  return `Basic ${btoa(`${String(env.TOSS_BILLING_SECRET_KEY || '')}:`)}`;
}

async function toss(path, { method='GET', body } = {}, env) {
  const response = await fetch(`${TOSS_API}${path}`, {
    method,
    headers: {
      authorization:tossAuth(env),
      'content-type':'application/json',
    },
    body:body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message:text }; }
  if (!response.ok) {
    throw Object.assign(new Error(data.message || data.code || `toss_${response.status}`), {
      status:response.status,
      data,
    });
  }
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

async function ensureSchema(db) {
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS author_billing_plans (
      plan_id TEXT PRIMARY KEY CHECK (plan_id IN ('author','pro')),
      display_name TEXT NOT NULL,
      monthly_fee INTEGER NOT NULL DEFAULT 0 CHECK (monthly_fee >= 0),
      enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS author_billing_subscriptions (
      user_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      plan_id TEXT NOT NULL CHECK (plan_id IN ('author','pro')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','past_due','canceled')),
      monthly_fee INTEGER NOT NULL CHECK (monthly_fee > 0),
      provider TEXT NOT NULL DEFAULT 'toss',
      provider_customer_key TEXT NOT NULL,
      billing_key_cipher TEXT NOT NULL,
      billing_key_iv TEXT NOT NULL,
      current_period_start TEXT NOT NULL,
      current_period_end TEXT NOT NULL,
      next_billing_at TEXT,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0,1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS author_billing_checkout_intents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      plan_id TEXT NOT NULL CHECK (plan_id IN ('author','pro')),
      amount INTEGER NOT NULL CHECK (amount > 0),
      customer_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','payment_failed','expired')),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS author_billing_charge_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      cycle_key TEXT NOT NULL UNIQUE,
      order_id TEXT NOT NULL UNIQUE,
      plan_id TEXT NOT NULL CHECK (plan_id IN ('author','pro')),
      amount INTEGER NOT NULL CHECK (amount > 0),
      status TEXT NOT NULL CHECK (status IN ('processing','done','failed')),
      provider_payment_key TEXT,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      completed_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS author_billing_plan_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id TEXT NOT NULL CHECK (plan_id IN ('author','pro')),
      previous_fee INTEGER NOT NULL DEFAULT 0,
      next_fee INTEGER NOT NULL DEFAULT 0,
      previous_enabled INTEGER NOT NULL DEFAULT 0,
      next_enabled INTEGER NOT NULL DEFAULT 0,
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_author_billing_subscriptions_due ON author_billing_subscriptions(status,cancel_at_period_end,next_billing_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_author_billing_checkout_expiry ON author_billing_checkout_intents(status,expires_at)'),
  ]);
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO author_billing_plans
      (plan_id,display_name,monthly_fee,enabled,updated_at,updated_by)
      VALUES ('author','CREATOR',0,0,?,'bootstrap')`).bind(now),
    db.prepare(`INSERT OR IGNORE INTO author_billing_plans
      (plan_id,display_name,monthly_fee,enabled,updated_at,updated_by)
      VALUES ('pro','PRO',0,0,?,'bootstrap')`).bind(now),
  ]);
}

function publicPlan(row) {
  return {
    id:String(row.plan_id),
    label:String(row.display_name),
    monthlyFee:Number(row.monthly_fee || 0),
    enabled:Boolean(row.enabled),
    purchasable:Boolean(row.enabled) && Number(row.monthly_fee || 0) > 0,
  };
}

function effectivePaid(row) {
  return Boolean(
    row
    && row.status === 'active'
    && Number(row.monthly_fee || 0) > 0
    && row.current_period_end
    && new Date(row.current_period_end).getTime() > Date.now()
  );
}

function publicSubscription(row) {
  if (!row) {
    return {
      planId:'free',
      status:'active',
      monthlyFee:0,
      currentPeriodStart:null,
      currentPeriodEnd:null,
      nextBillingAt:null,
      cancelAtPeriodEnd:false,
      paidAiActive:false,
    };
  }
  return {
    planId:String(row.plan_id),
    status:String(row.status),
    monthlyFee:Number(row.monthly_fee || 0),
    currentPeriodStart:row.current_period_start || null,
    currentPeriodEnd:row.current_period_end || null,
    nextBillingAt:row.next_billing_at || null,
    cancelAtPeriodEnd:Boolean(row.cancel_at_period_end),
    paidAiActive:effectivePaid(row),
  };
}

async function plans(env) {
  const rows = await env.DB.prepare(`SELECT plan_id,display_name,monthly_fee,enabled,updated_at
    FROM author_billing_plans ORDER BY CASE plan_id WHEN 'author' THEN 1 ELSE 2 END`).all();
  return (rows.results || []).map(publicPlan);
}

async function planFor(env, id) {
  const planId = String(id || '').trim().toLowerCase();
  if (!PAID_PLANS.has(planId)) return null;
  return env.DB.prepare(`SELECT plan_id,display_name,monthly_fee,enabled,updated_at,updated_by
    FROM author_billing_plans WHERE plan_id=?`).bind(planId).first();
}

async function subscriptionFor(env, userId) {
  return env.DB.prepare('SELECT * FROM author_billing_subscriptions WHERE user_id=?').bind(userId).first();
}

async function catalog(request, env) {
  return json({
    product:'creator-ai',
    plans:await plans(env),
    billingReady:billingReady(env),
    billingProvider:'toss-billing',
    policy:{ freePaidProviderCalls:0, cancellation:'period_end' },
  }, 200, request, env);
}

async function me(request, env) {
  const identity = await identityFromRequest(request);
  if (!identity) return json({ error:'Google 로그인 세션을 확인해 주세요.', code:'LOGIN_REQUIRED' }, 401, request, env);
  const subscription = await subscriptionFor(env, identity.id);
  return json({
    product:'creator-ai',
    userId:identity.id,
    email:identity.email,
    subscription:publicSubscription(subscription),
    plans:await plans(env),
    billingReady:billingReady(env),
  }, 200, request, env);
}

async function billingStart(request, env) {
  const identity = await identityFromRequest(request);
  const body = await readJson(request);
  const plan = await planFor(env, body?.planId);
  if (!identity) return json({ error:'Google 로그인이 필요합니다.', code:'LOGIN_REQUIRED' }, 401, request, env);
  if (!plan) return json({ error:'지원하지 않는 유료 플랜입니다.', code:'PLAN_NOT_FOUND' }, 400, request, env);
  if (!Boolean(plan.enabled) || Number(plan.monthly_fee || 0) <= 0) {
    return json({ error:'이 요금제는 아직 결제를 받지 않습니다.', code:'PLAN_NOT_PURCHASABLE' }, 409, request, env);
  }
  if (!billingReady(env)) {
    return json({ error:'자동결제 연결이 아직 준비되지 않았습니다.', code:'BILLING_NOT_READY' }, 503, request, env);
  }
  const current = await subscriptionFor(env, identity.id);
  if (effectivePaid(current)) {
    return json({
      error:current.plan_id === plan.plan_id
        ? '이미 이용 중인 월 구독입니다.'
        : '현재 결제기간이 끝난 뒤 다른 유료 플랜을 선택해 주세요.',
      code:current.plan_id === plan.plan_id ? 'ALREADY_SUBSCRIBED' : 'ACTIVE_SUBSCRIPTION_EXISTS',
      subscription:publicSubscription(current),
    }, 409, request, env);
  }

  const checkout = randomToken(24);
  const customerKey = `ekodi-author-${crypto.randomUUID()}`;
  const now = new Date();
  const expires = new Date(now.getTime() + 20 * 60 * 1000);
  await env.DB.prepare(`INSERT INTO author_billing_checkout_intents
    (id,user_id,email,plan_id,amount,customer_key,status,expires_at,created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
    .bind(checkout, identity.id, identity.email, plan.plan_id, Number(plan.monthly_fee), customerKey, expires.toISOString(), now.toISOString()).run();

  const success = new URL(validReturnTo(body?.returnTo));
  success.searchParams.set('billing', 'success');
  success.searchParams.set('checkout', checkout);
  const fail = new URL(success);
  fail.searchParams.set('billing', 'fail');
  return json({
    ok:true,
    clientKey:String(env.TOSS_BILLING_CLIENT_KEY),
    customerKey,
    checkout,
    successUrl:success.href,
    failUrl:fail.href,
    amount:Number(plan.monthly_fee),
    plan:publicPlan(plan),
  }, 200, request, env);
}

async function billingComplete(request, env) {
  const identity = await identityFromRequest(request);
  const body = await readJson(request);
  if (!identity) return json({ error:'Google 로그인이 필요합니다.', code:'LOGIN_REQUIRED' }, 401, request, env);
  if (!body?.checkout || !body?.authKey || !body?.customerKey) {
    return json({ error:'결제 인증 정보를 확인해 주세요.', code:'INVALID_BILLING_CALLBACK' }, 400, request, env);
  }
  if (!billingReady(env)) return json({ error:'자동결제 연결이 준비되지 않았습니다.', code:'BILLING_NOT_READY' }, 503, request, env);

  const checkout = await env.DB.prepare('SELECT * FROM author_billing_checkout_intents WHERE id=?')
    .bind(String(body.checkout)).first();
  const nowIso = new Date().toISOString();
  if (!checkout || checkout.status !== 'pending' || checkout.expires_at <= nowIso) {
    return json({ error:'결제 요청이 만료되었거나 이미 처리되었습니다.', code:'CHECKOUT_NOT_PENDING' }, 409, request, env);
  }
  if (checkout.user_id !== identity.id || String(checkout.email).toLowerCase() !== identity.email || checkout.customer_key !== String(body.customerKey)) {
    return json({ error:'결제 요청 계정을 확인할 수 없습니다.', code:'CHECKOUT_OWNER_MISMATCH' }, 403, request, env);
  }
  const plan = await planFor(env, checkout.plan_id);
  if (!plan || !Boolean(plan.enabled) || Number(plan.monthly_fee) <= 0 || Number(plan.monthly_fee) !== Number(checkout.amount)) {
    return json({ error:'요금제가 변경되었습니다. 현재 가격으로 다시 시작해 주세요.', code:'PLAN_CHANGED' }, 409, request, env);
  }

  let billing;
  try {
    billing = await toss('/billing/authorizations/issue', {
      method:'POST',
      body:{ authKey:String(body.authKey), customerKey:checkout.customer_key },
    }, env);
  } catch (error) {
    await env.DB.prepare("UPDATE author_billing_checkout_intents SET status='failed' WHERE id=?").bind(checkout.id).run();
    return json({ error:`결제수단 등록 실패: ${error.message}`, code:'BILLING_KEY_FAILED' }, 502, request, env);
  }
  if (!billing?.billingKey) return json({ error:'빌링키가 발급되지 않았습니다.', code:'BILLING_KEY_MISSING' }, 502, request, env);

  const now = new Date();
  const periodStart = now.toISOString();
  const periodEnd = addMonth(now);
  const orderId = `author-init-${checkout.id.slice(0, 24)}`;
  let payment;
  try {
    payment = await charge(env, {
      billingKey:billing.billingKey,
      customerKey:checkout.customer_key,
      amount:Number(plan.monthly_fee),
      orderId,
      orderName:`Creator AI ${plan.display_name} 월 구독`,
      email:identity.email,
    });
  } catch (error) {
    await env.DB.prepare("UPDATE author_billing_checkout_intents SET status='payment_failed' WHERE id=?").bind(checkout.id).run();
    return json({ error:`첫 구독 결제 실패: ${error.message}`, code:'INITIAL_CHARGE_FAILED' }, 502, request, env);
  }
  if (payment?.status !== 'DONE') return json({ error:'결제가 완료 상태가 아닙니다.', code:'PAYMENT_NOT_DONE' }, 502, request, env);

  const encrypted = await encryptBillingKey(env, billing.billingKey);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO author_billing_subscriptions
      (user_id,email,plan_id,status,monthly_fee,provider,provider_customer_key,billing_key_cipher,billing_key_iv,
       current_period_start,current_period_end,next_billing_at,cancel_at_period_end,created_at,updated_at)
      VALUES (?, ?, ?, 'active', ?, 'toss', ?, ?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        email=excluded.email,plan_id=excluded.plan_id,status='active',monthly_fee=excluded.monthly_fee,
        provider='toss',provider_customer_key=excluded.provider_customer_key,
        billing_key_cipher=excluded.billing_key_cipher,billing_key_iv=excluded.billing_key_iv,
        current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,
        next_billing_at=excluded.next_billing_at,cancel_at_period_end=0,updated_at=excluded.updated_at`)
      .bind(identity.id, identity.email, plan.plan_id, Number(plan.monthly_fee), checkout.customer_key,
        encrypted.cipher, encrypted.iv, periodStart, periodEnd, periodEnd, periodStart, periodStart),
    env.DB.prepare("UPDATE author_billing_checkout_intents SET status='completed',completed_at=? WHERE id=?")
      .bind(periodStart, checkout.id),
    env.DB.prepare(`INSERT OR REPLACE INTO author_billing_charge_events
      (user_id,cycle_key,order_id,plan_id,amount,status,provider_payment_key,detail,created_at,completed_at)
      VALUES (?, ?, ?, ?, ?, 'done', ?, '', ?, ?)`)
      .bind(identity.id, `initial:${checkout.id}`, orderId, plan.plan_id, Number(plan.monthly_fee), payment.paymentKey || '', periodStart, periodStart),
  ]);

  const subscription = await subscriptionFor(env, identity.id);
  return json({
    ok:true,
    paid:true,
    subscription:publicSubscription(subscription),
    payment:{ orderId, paymentKey:payment.paymentKey || null },
  }, 200, request, env);
}

async function cancel(request, env) {
  const identity = await identityFromRequest(request);
  if (!identity) return json({ error:'Google 로그인이 필요합니다.', code:'LOGIN_REQUIRED' }, 401, request, env);
  const row = await subscriptionFor(env, identity.id);
  if (!row || !effectivePaid(row)) return json({ ok:true, subscription:publicSubscription(row) }, 200, request, env);
  if (!row.cancel_at_period_end) {
    await env.DB.prepare('UPDATE author_billing_subscriptions SET cancel_at_period_end=1,updated_at=? WHERE user_id=?')
      .bind(new Date().toISOString(), identity.id).run();
  }
  const updated = await subscriptionFor(env, identity.id);
  return json({ ok:true, subscription:publicSubscription(updated), cancellation:'period_end' }, 200, request, env);
}

async function adminPlans(request, env) {
  const session = await adminSession(request, env);
  if (!session) return json({ error:'EKODI 관리자 인증이 필요합니다.' }, 401, request, env);
  if (request.method === 'GET') {
    return json({ plans:await plans(env), billingReady:billingReady(env) }, 200, request, env);
  }
  const body = await readJson(request);
  const planId = String(body?.planId || '').trim().toLowerCase();
  const monthlyFee = Number(body?.monthlyFee);
  const enabled = Boolean(body?.enabled);
  if (!PAID_PLANS.has(planId) || !Number.isSafeInteger(monthlyFee) || monthlyFee < 0 || monthlyFee > 10_000_000) {
    return json({ error:'요금제와 월 금액을 확인해 주세요.', code:'INVALID_PLAN_CONFIG' }, 400, request, env);
  }
  if (enabled && monthlyFee <= 0) {
    return json({ error:'결제를 활성화하려면 1원 이상의 월 금액이 필요합니다.', code:'PRICE_REQUIRED' }, 400, request, env);
  }
  const current = await planFor(env, planId);
  if (!current) return json({ error:'요금제를 찾을 수 없습니다.' }, 404, request, env);
  const now = new Date().toISOString();
  const actor = String(session.email || session.adminEmail || 'admin').slice(0, 160);
  await env.DB.batch([
    env.DB.prepare(`UPDATE author_billing_plans SET monthly_fee=?,enabled=?,updated_at=?,updated_by=? WHERE plan_id=?`)
      .bind(monthlyFee, enabled ? 1 : 0, now, actor, planId),
    env.DB.prepare(`INSERT INTO author_billing_plan_audit
      (plan_id,previous_fee,next_fee,previous_enabled,next_enabled,actor,created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(planId, Number(current.monthly_fee || 0), monthlyFee, Number(current.enabled || 0), enabled ? 1 : 0, actor, now),
  ]);
  return json({ ok:true, plans:await plans(env), note:'변경 가격은 새 구독에 적용되며 기존 구독의 현재 약정 금액은 자동 변경하지 않습니다.' }, 200, request, env);
}

async function adminSubscriptions(request, env) {
  const session = await adminSession(request, env);
  if (!session) return json({ error:'EKODI 관리자 인증이 필요합니다.' }, 401, request, env);
  const rows = await env.DB.prepare(`SELECT user_id,email,plan_id,status,monthly_fee,current_period_start,current_period_end,
    next_billing_at,cancel_at_period_end,created_at,updated_at
    FROM author_billing_subscriptions ORDER BY updated_at DESC LIMIT 200`).all();
  return json({ subscriptions:(rows.results || []).map(row => ({ ...row, paidAiActive:effectivePaid(row) })) }, 200, request, env);
}

async function adminCharges(request, env) {
  const session = await adminSession(request, env);
  if (!session) return json({ error:'EKODI 관리자 인증이 필요합니다.' }, 401, request, env);
  const rows = await env.DB.prepare(`SELECT id,user_id,cycle_key,order_id,plan_id,amount,status,provider_payment_key,detail,created_at,completed_at
    FROM author_billing_charge_events ORDER BY created_at DESC LIMIT 200`).all();
  return json({ charges:rows.results || [] }, 200, request, env);
}

export async function handleAuthorBillingControl(request, env) {
  if (!env.DB) return json({ error:'데이터베이스 연결이 설정되지 않았습니다.' }, 503, request, env);
  const origin = request.headers.get('origin');
  if (origin && !isAllowedOrigin(origin, env)) return json({ error:'허용되지 않은 요청입니다.' }, 403, request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:cors(origin, env) });
  await ensureSchema(env.DB);
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === '/api/author/billing/catalog') return catalog(request, env);
  if (request.method === 'GET' && path === '/api/author/billing/me') return me(request, env);
  if (request.method === 'POST' && path === '/api/author/billing/start') return billingStart(request, env);
  if (request.method === 'POST' && path === '/api/author/billing/complete') return billingComplete(request, env);
  if (request.method === 'POST' && path === '/api/author/billing/cancel') return cancel(request, env);
  if (path === '/api/author/billing/admin/plans' && ['GET','PUT'].includes(request.method)) return adminPlans(request, env);
  if (request.method === 'GET' && path === '/api/author/billing/admin/subscriptions') return adminSubscriptions(request, env);
  if (request.method === 'GET' && path === '/api/author/billing/admin/charges') return adminCharges(request, env);
  return null;
}

export async function runAuthorBillingSchedule(env) {
  if (!env.DB) return { processed:0, billingReady:false };
  await ensureSchema(env.DB);
  const now = new Date().toISOString();

  await env.DB.prepare("UPDATE author_billing_checkout_intents SET status='expired' WHERE status='pending' AND expires_at<=?")
    .bind(now).run();

  await env.DB.prepare(`UPDATE author_billing_subscriptions SET
    status='canceled',next_billing_at=NULL,provider_customer_key='',billing_key_cipher='',billing_key_iv='',updated_at=?
    WHERE status='active' AND cancel_at_period_end=1 AND current_period_end<=?`)
    .bind(now, now).run();

  if (!billingReady(env)) return { processed:0, billingReady:false };
  const due = await env.DB.prepare(`SELECT * FROM author_billing_subscriptions
    WHERE status='active' AND cancel_at_period_end=0 AND monthly_fee>0
      AND next_billing_at IS NOT NULL AND next_billing_at<=?
    ORDER BY next_billing_at LIMIT 20`).bind(now).all();

  let processed = 0;
  for (const row of due.results || []) {
    const cycle = `renew:${row.user_id}:${String(row.next_billing_at).slice(0, 10)}`;
    const exists = await env.DB.prepare('SELECT status FROM author_billing_charge_events WHERE cycle_key=?').bind(cycle).first();
    if (exists) continue;
    const orderId = `author-renew-${randomToken(10)}`;
    await env.DB.prepare(`INSERT INTO author_billing_charge_events
      (user_id,cycle_key,order_id,plan_id,amount,status,created_at)
      VALUES (?, ?, ?, ?, ?, 'processing', ?)`)
      .bind(row.user_id, cycle, orderId, row.plan_id, Number(row.monthly_fee), now).run();
    try {
      const billingKey = await decryptBillingKey(env, row.billing_key_cipher, row.billing_key_iv);
      const payment = await charge(env, {
        billingKey,
        customerKey:row.provider_customer_key,
        amount:Number(row.monthly_fee),
        orderId,
        orderName:`Creator AI ${String(row.plan_id).toUpperCase()} 월 구독`,
        email:row.email,
      });
      if (payment?.status !== 'DONE') throw new Error(`payment_status_${payment?.status || 'unknown'}`);
      const next = addMonth(row.next_billing_at);
      await env.DB.batch([
        env.DB.prepare("UPDATE author_billing_charge_events SET status='done',provider_payment_key=?,completed_at=? WHERE cycle_key=?")
          .bind(payment.paymentKey || '', now, cycle),
        env.DB.prepare(`UPDATE author_billing_subscriptions SET
          current_period_start=?,current_period_end=?,next_billing_at=?,updated_at=? WHERE user_id=?`)
          .bind(row.next_billing_at, next, next, now, row.user_id),
      ]);
      processed += 1;
    } catch (error) {
      await env.DB.batch([
        env.DB.prepare("UPDATE author_billing_charge_events SET status='failed',detail=?,completed_at=? WHERE cycle_key=?")
          .bind(String(error?.message || error).slice(0, 300), now, cycle),
        env.DB.prepare("UPDATE author_billing_subscriptions SET status='past_due',updated_at=? WHERE user_id=?")
          .bind(now, row.user_id),
      ]);
    }
  }
  return { processed, billingReady:true };
}
