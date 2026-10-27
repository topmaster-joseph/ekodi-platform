// EKODIPAY-GATEWAY-001 — 중앙 결제 게이트웨이 (토스 키를 한 곳에서만 보관)
//
// 토스 시크릿 키는 ekodi-qtin-order Worker 비밀값으로만 존재한다. 다른 EKODI 서비스(에코디서점 등)는
// 키를 복사하지 않고, 서비스 바인딩 RPC(EkodiPayGateway, HTTP로는 노출되지 않음)로 이 게이트웨이를 호출한다.
// 라이브 키를 한 번만 등록하면 연결된 모든 서비스가 함께 라이브로 전환된다.
// 허용 동작은 '준비 상태 조회 · 공개 클라이언트 키 · 결제 승인 · 결제 조회'뿐이다(취소·환불은 각 서비스 운영자 화면에서 별도 승인).
import * as ekodipay from './ekodipay-core.js';

const PAYMENT_KEY = /^[A-Za-z0-9_-]{6,220}$/;
const ORDER_ID = /^[A-Za-z0-9_-]{6,64}$/;
const CALLERS = new Set(['books', 'mall', 'qtin']);

function profileFor(env, profileId) {
  const id = ekodipay.normalizeProfileId(profileId) || ekodipay.activeProfileId(env);
  return ekodipay.merchantProfile(id, ekodipay.merchantProfiles(env)) ? id : '';
}
function caller(value) {
  const id = String(value || '').trim().toLowerCase();
  if (!CALLERS.has(id)) throw new Error('EKODIPAY_CALLER_NOT_ALLOWED');
  return id;
}

export function gatewayReadiness(env, { callerId, profileId } = {}) {
  caller(callerId);
  const profile = profileFor(env, profileId);
  const r = ekodipay.readiness(env, { profileId: profile || 'invalid' });
  return { ready: r.ready, mode: r.mode, publicReady: r.publicReady, widget: r.widget, profile: r.profile, mid: r.mid, merchant: r.merchant, missing: r.missing };
}

export function gatewayClientKey(env, { callerId, profileId } = {}) {
  caller(callerId);
  const profile = profileFor(env, profileId);
  const { clientKey } = ekodipay.merchantKeys(env, profile);
  return /^(test|live)_g?ck_/.test(clientKey) ? clientKey : '';
}

export async function gatewayConfirm(env, { callerId, profileId, paymentKey, orderId, amount, idempotencyKey } = {}, toss = ekodipay.tossRequest) {
  const who = caller(callerId);
  const profile = profileFor(env, profileId);
  if (!profile || !PAYMENT_KEY.test(String(paymentKey || '')) || !ORDER_ID.test(String(orderId || '')) || !Number.isInteger(Number(amount)) || Number(amount) <= 0) {
    throw new ekodipay.TossError('결제 정보가 올바르지 않습니다.', { code: 'BAD_REQUEST', status: 400 });
  }
  return toss(env, profile, '/v1/payments/confirm', { method: 'POST', body: { paymentKey, orderId, amount: Number(amount) }, idempotencyKey: String(idempotencyKey || `${who}-confirm-${orderId}`).slice(0, 300) });
}

export async function gatewayGetPayment(env, { callerId, profileId, paymentKey } = {}, toss = ekodipay.tossRequest) {
  caller(callerId);
  const profile = profileFor(env, profileId);
  if (!profile || !PAYMENT_KEY.test(String(paymentKey || ''))) throw new ekodipay.TossError('결제 정보가 올바르지 않습니다.', { code: 'BAD_REQUEST', status: 400 });
  return toss(env, profile, `/v1/payments/${encodeURIComponent(paymentKey)}`, {});
}

/** RPC errors lose their class; return plain objects so callers can branch on code/status. */
export async function settle(promise) {
  try { return { ok: true, data: await promise }; }
  catch (error) { return { ok: false, error: { message: String(error?.message || 'EKODIPAY_ERROR').slice(0, 300), code: String(error?.code || '').slice(0, 80), status: Number(error?.status) || 502 } }; }
}
