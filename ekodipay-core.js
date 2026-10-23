// EKODIPAY-CORE-001 — EKODI 공통 결제 모듈 (Toss Payments)
//
// 모든 EKODI 사이트(큐티인, 에코디몰, 에코디비즈 계산대, 에코디북 …)가 같은 방식으로
// 결제 준비 상태를 판단하고, 토스 API를 호출하고, 상점(MID)을 고르도록 하는 공통 모듈이다.
//
// 상점(MID) 전환 설계
//  • MERCHANT_PROFILES 에 상점 프로필을 등록한다. 사이트는 EKODIPAY_PROFILE 로 사용할 프로필을 고른다.
//  • 키 이름: TOSS_CLIENT_KEY__<PROFILE>, TOSS_SECRET_KEY__<PROFILE> (시크릿은 Worker secret 전용).
//    기본 프로필 'ekodi'만 기존 이름(TOSS_CLIENT_KEY, TOSS_SECRET_KEY)도 받는다(무중단 호환).
//  • 주문번호에 프로필 표시를 넣는다: 'QTIN-mchurch-202612-…'. 기본 프로필은 표시 없음(기존 주문 호환).
//    → MID를 바꾼 뒤에도 이전 주문의 승인·조회·취소는 원래 MID 키로 처리된다.
//  • 정기결제(빌링)는 토스에서 별도 MID·키로 운영되므로 product: 'billing' 프로필로 등록한다.
//
// 결제 안전 규칙
//  • PAYMENTS_ENABLED=true, 클라이언트·시크릿 키가 모두 있어야 ready.
//  • test_ 키는 실제 돈이 움직이지 않는다: 공개 결제는 live_ 키에서만 연다(publicReady).

export const TOSS_API = 'https://api.tosspayments.com';
export const DEFAULT_PROFILE = 'ekodi';
const PROFILE_ID = /^[a-z0-9]{2,16}$/;
const TOSS_TIMEOUT_MS = 15000;

export const MERCHANT_PROFILES = Object.freeze({
  // 큐티인 공동구매(기본 프로필 — 기존 키 이름 TOSS_CLIENT_KEY/TOSS_SECRET_KEY 호환)
  ekodi: Object.freeze({ id: 'ekodi', label: '에코디', mid: 'q_ekodib62hb', owner: 'EKODIBIZ', product: 'general' }),
  // 에코디몰 — 키: TOSS_CLIENT_KEY__MALL, TOSS_SECRET_KEY__MALL (기존 이름은 쓰지 않음)
  mall: Object.freeze({ id: 'mall', label: '에코디몰', mid: 'ekobizav68', owner: 'EKODIBIZ', product: 'general' }),
  // 보류: q_ekodim56wc (용도 결정 후 등록)
  // 추가 예시(등록 시 주석 해제 + 키 등록):
  // church: { id: 'church', label: '에코디교회', mid: '<MID>', owner: '에코디교회', product: 'general' },
  // billing: { id: 'billing', label: '에코디 정기결제', mid: '<MID>', owner: 'EKODIBIZ', product: 'billing' },
});

const flag = value => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
const text = value => String(value ?? '').trim();

export function normalizeProfileId(value) {
  const id = text(value).toLowerCase();
  return PROFILE_ID.test(id) ? id : '';
}

/**
 * Built-in profiles plus EKODIPAY_MERCHANTS (JSON var) so a new church/business MID can be added by
 * configuration alone, e.g. {"church":{"label":"에코디교회","mid":"q_xxx","owner":"에코디교회"}}.
 * Built-in ids cannot be overridden; malformed entries are ignored (fail closed).
 */
export function merchantProfiles(env) {
  const out = { ...MERCHANT_PROFILES };
  let extra = {};
  try { extra = JSON.parse(text(env?.EKODIPAY_MERCHANTS) || '{}'); } catch { extra = {}; }
  if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
    for (const [rawId, value] of Object.entries(extra)) {
      const id = normalizeProfileId(rawId);
      const mid = text(value?.mid);
      if (!id || out[id] || !/^[A-Za-z0-9_-]{3,40}$/.test(mid)) continue;
      out[id] = Object.freeze({ id, label: text(value?.label).slice(0, 60) || id, mid, owner: text(value?.owner).slice(0, 60), product: value?.product === 'billing' ? 'billing' : 'general' });
    }
  }
  return Object.freeze(out);
}

export function merchantProfile(id, profiles = MERCHANT_PROFILES) {
  const key = normalizeProfileId(id);
  return key && Object.prototype.hasOwnProperty.call(profiles, key) ? profiles[key] : null;
}

/** The profile a site uses for new payments (EKODIPAY_PROFILE, default 'ekodi'). */
export function activeProfileId(env) {
  return normalizeProfileId(env?.EKODIPAY_PROFILE) || (text(env?.EKODIPAY_PROFILE) ? '' : DEFAULT_PROFILE);
}

/**
 * Key values pasted into a dashboard often carry wrapping quotes, spaces or line breaks
 * (e.g. copied from a wrangler snippet: "live_ck_…"). Those are never part of a Toss key,
 * so they are removed. Case is kept: Toss keys are case-sensitive.
 */
export function cleanKey(value) {
  let key = String(value ?? '').replace(/[\s\u200b\ufeff]+/g, '');
  while (/^["'`]/.test(key) && /["'`]$/.test(key) && key.length > 1) key = key.slice(1, -1);
  return key.replace(/^["'`]+|["'`]+$/g, '');
}

export function merchantKeys(env, profileId) {
  const id = normalizeProfileId(profileId);
  if (!id) return { clientKey: '', secretKey: '' };
  const suffix = id.toUpperCase();
  const legacy = id === DEFAULT_PROFILE;
  return {
    clientKey: cleanKey(env?.[`TOSS_CLIENT_KEY__${suffix}`]) || (legacy ? cleanKey(env?.TOSS_CLIENT_KEY) : ''),
    secretKey: cleanKey(env?.[`TOSS_SECRET_KEY__${suffix}`]) || (legacy ? cleanKey(env?.TOSS_SECRET_KEY) : ''),
  };
}

/** Shape of a key without revealing it: where it came from and what is wrong with it. */
function describeKey(raw, kind) {
  if (raw == null || String(raw) === '') return { present: false };
  const original = String(raw);
  const key = cleanKey(original);
  const issues = [];
  if (original !== key) issues.push(/["'`]/.test(original) ? 'quotes-removed' : 'whitespace-removed');
  const prefix = (/^[A-Za-z]+_[A-Za-z]+_/.exec(key) || [''])[0];
  const expected = kind === 'client' ? /^(test|live)_g?ck_$/ : /^(test|live)_g?sk_$/;
  if (!prefix) issues.push('no-prefix');
  else if (prefix !== prefix.toLowerCase()) issues.push('uppercase-prefix');
  else if (!expected.test(prefix)) issues.push(kind === 'client' && /_g?sk_$/.test(prefix) ? 'secret-key-in-client-slot' : kind === 'secret' && /_g?ck_$/.test(prefix) ? 'client-key-in-secret-slot' : 'unexpected-prefix');
  return { present: true, prefix: prefix || '(none)', length: key.length, ok: expected.test(prefix), issues };
}

/** Admin-only diagnostics: which binding supplied each key and its shape (never the value). */
export function keyDiagnostics(env, profileId = activeProfileId(env)) {
  const id = normalizeProfileId(profileId);
  const suffix = (id || DEFAULT_PROFILE).toUpperCase();
  const legacy = (id || DEFAULT_PROFILE) === DEFAULT_PROFILE;
  const pick = (base) => {
    const named = `${base}__${suffix}`;
    if (env?.[named] != null && String(env[named]) !== '') return { binding: named, raw: env[named] };
    if (legacy && env?.[base] != null && String(env[base]) !== '') return { binding: base, raw: env[base] };
    return { binding: named, raw: '' };
  };
  const client = pick('TOSS_CLIENT_KEY');
  const secret = pick('TOSS_SECRET_KEY');
  return {
    profile: id || DEFAULT_PROFILE,
    client: { binding: client.binding, ...describeKey(client.raw, 'client') },
    secret: { binding: secret.binding, ...describeKey(secret.raw, 'secret') },
  };
}

/** 결제위젯 연동 클라이언트 키(test_gck_/live_gck_)인지 여부. */
export function isWidgetKey(clientKey) {
  return /^(test|live)_gck_/.test(text(clientKey));
}

/**
 * Copy of a Worker env whose TOSS_CLIENT_KEY/TOSS_SECRET_KEY are the given merchant's keys only.
 * Lets existing site code that reads the plain names run on one MID without seeing another
 * merchant's keys. Missing keys become '' (fail closed). Bindings are kept (own enumerable props).
 */
export function withMerchantKeys(env, profileId) {
  const id = normalizeProfileId(profileId) || DEFAULT_PROFILE;
  const { clientKey, secretKey } = merchantKeys(env, id);
  const profile = merchantProfile(id, merchantProfiles(env));
  return { ...env, TOSS_CLIENT_KEY: clientKey, TOSS_SECRET_KEY: secretKey, EKODIPAY_PROFILE: id, EKODIPAY_MID: profile?.mid || '' };
}

export function keyMode(clientKey) {
  const key = text(clientKey);
  if (key.startsWith('live_')) return 'live';
  if (key.startsWith('test_')) return 'test';
  return 'none';
}

/**
 * Payment readiness for one merchant profile.
 * missing: payments-disabled | unknown-merchant-profile | toss-client-key | toss-secret-key | key-mode-mismatch | isolated-staging
 */
export function readiness(env, { profileId = activeProfileId(env), staging = false, profiles = merchantProfiles(env) } = {}) {
  const missing = [];
  const profile = merchantProfile(profileId, profiles);
  const { clientKey, secretKey } = merchantKeys(env, profileId);
  if (!flag(env?.PAYMENTS_ENABLED)) missing.push('payments-disabled');
  if (!profile) missing.push('unknown-merchant-profile');
  if (!/^(test|live)_(g?ck)_/.test(clientKey)) missing.push('toss-client-key');
  if (!/^(test|live)_(g?sk)_/.test(secretKey)) missing.push('toss-secret-key');
  else if (keyMode(clientKey) !== 'none' && !secretKey.startsWith(`${keyMode(clientKey)}_`)) missing.push('key-mode-mismatch');
  // 결제위젯 연동 키(gck/gsk)와 API 개별 연동 키(ck/sk)는 짝을 맞춰야 승인이 된다.
  else if (isWidgetKey(clientKey) !== /^(test|live)_gsk_/.test(secretKey)) missing.push('key-type-mismatch');
  if (staging) missing.push('isolated-staging');
  const mode = keyMode(clientKey);
  const ready = missing.length === 0;
  return {
    ready,
    missing,
    mode,
    publicReady: ready && mode === 'live',
    widget: isWidgetKey(clientKey),
    testReady: ready && mode === 'test',
    profile: profile?.id || normalizeProfileId(profileId) || '',
    mid: profile?.mid || '',
    merchant: profile?.label || '',
  };
}

/** Tag an order id with its merchant profile so later calls use the same MID. */
export function tagOrderId(orderId, profileId) {
  const id = normalizeProfileId(profileId);
  if (!id || id === DEFAULT_PROFILE) return orderId;
  const match = /^([A-Za-z0-9]+)-(.+)$/.exec(String(orderId));
  if (!match) return orderId;
  return `${match[1]}-m${id}-${match[2]}`.slice(0, 64);
}

export function profileFromOrderId(orderId) {
  const match = /^[A-Za-z0-9]+-m([a-z0-9]{2,16})-/.exec(String(orderId || ''));
  return match ? match[1] : DEFAULT_PROFILE;
}

export class TossError extends Error {
  constructor(message, { code = '', status = 0 } = {}) {
    super(message);
    this.name = 'TossError';
    this.code = code;
    this.status = status;
  }
}

/** Call the Toss Payments API with the given profile's secret key. */
export async function tossRequest(env, profileId, path, { method = 'GET', body, idempotencyKey, timeoutMs = TOSS_TIMEOUT_MS } = {}) {
  const { secretKey } = merchantKeys(env, profileId);
  if (!secretKey) throw new TossError('결제 연결 키가 등록되지 않았습니다.', { code: 'MERCHANT_KEY_MISSING', status: 503 });
  const headers = { authorization: `Basic ${btoa(`${secretKey}:`)}`, 'content-type': 'application/json' };
  if (idempotencyKey) headers['idempotency-key'] = String(idempotencyKey).slice(0, 300);
  const init = { method, headers, body: body ? JSON.stringify(body) : undefined };
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') init.signal = AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response = await fetch(TOSS_API + path, init);
  } catch (error) {
    throw new TossError('결제 서버 응답이 지연되었습니다.', { code: error?.name === 'TimeoutError' ? 'TOSS_TIMEOUT' : 'TOSS_NETWORK', status: 504 });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new TossError(text(data.message || data.code || `TOSS_${response.status}`).slice(0, 300), { code: text(data.code).slice(0, 80), status: response.status });
  }
  return data;
}

export const confirmPayment = (env, profileId, { paymentKey, orderId, amount }, idempotencyKey) =>
  tossRequest(env, profileId, '/v1/payments/confirm', { method: 'POST', body: { paymentKey, orderId, amount: Math.trunc(Number(amount)) }, idempotencyKey });

export const getPayment = (env, profileId, paymentKey) =>
  tossRequest(env, profileId, `/v1/payments/${encodeURIComponent(paymentKey)}`);

export const cancelPayment = (env, profileId, paymentKey, cancelReason, idempotencyKey) =>
  tossRequest(env, profileId, `/v1/payments/${encodeURIComponent(paymentKey)}/cancel`, { method: 'POST', body: { cancelReason }, idempotencyKey });
