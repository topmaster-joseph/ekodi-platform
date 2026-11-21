// Production worker for 에코디 펀딩 (ekodi.kr/funding) — EKODI-FUNDING-001 1단계.
// Identity: unified EKODI login (Supabase). Any confirmed EKODI account may plan a campaign;
// platform operators (OPERATOR_EMAILS) review, approve and close.
// Payment: only through the central EKODI Pay gateway (EKODIPAY service binding, callerId 'funding').
// No Toss key ever reaches this worker. Payments stay closed unless FUNDING_PAYMENTS_ENABLED and
// FUNDING_MID_APPROVED are both "true", the gateway reports ready, and this is not staging.
import { createApp, clean, PUBLIC_PATH } from './funding-core.js';
import { createD1Store } from './funding-d1-store.js';
import { activeProfileId, tagOrderId } from './ekodipay-core.js';
import { createTossPayoutClient } from './funding-payout.js';
import { withFooterTraffic } from './footer-traffic-guarantee.js';
import { withEdgeTrafficShield } from './edge-traffic-shield.js';

const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const CALLER = 'funding';
const yes = value => String(value ?? '').toLowerCase() === 'true';

function deny(message, status) {
  return { response: new Response(JSON.stringify({ error: message }), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }) };
}
export function operators(env) {
  return new Set(String(env.OPERATOR_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean));
}

export async function authenticate(request, env, fetcher = fetch) {
  const header = String(request.headers.get('authorization') || '');
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token || token.length > 8192) return deny('로그인이 필요합니다.', 401);
  let identity = null;
  try {
    const r = await fetcher(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` }, cache: 'no-store' });
    identity = r.ok ? await r.json().catch(() => null) : null;
  } catch { identity = null; }
  if (!identity?.id || !identity?.email || !identity?.email_confirmed_at) return deny('에코디 로그인을 확인할 수 없습니다. 다시 로그인해 주세요.', 401);
  const email = String(identity.email).toLowerCase();
  return { data: { userId: String(identity.id), email, isOperator: operators(env).has(email) } };
}

/** Payment adapter over the central gateway. Every failure path reports "closed", never throws open. */
export function createGatewayPay(env) {
  const profileId = activeProfileId(env);
  const enabled = yes(env.FUNDING_PAYMENTS_ENABLED) && yes(env.FUNDING_MID_APPROVED) && env.DATA_MODE !== 'isolated-staging';
  return {
    tagOrderId: orderId => tagOrderId(orderId, profileId),
    async state() {
      if (!enabled) return { ready: false, mode: 'none', clientKey: '', profile: profileId, reason: yes(env.FUNDING_MID_APPROVED) ? '결제 스위치 꺼짐' : '펀딩 결제 상점(MID) 승인 대기' };
      if (!env.EKODIPAY) return { ready: false, mode: 'none', clientKey: '', profile: profileId, reason: '공통결제 게이트웨이 미연결' };
      let state = null; let key = null;
      try {
        [state, key] = await Promise.all([
          env.EKODIPAY.readiness({ callerId: CALLER, profileId }),
          env.EKODIPAY.clientKey({ callerId: CALLER, profileId }),
        ]);
      } catch { state = null; key = null; }
      const r = state?.ok ? state.data : null;
      const ready = Boolean(r?.ready && r.mode === 'live' && key?.ok && key.data);
      return { ready, mode: r?.mode || 'none', clientKey: ready ? key.data : '', profile: profileId, reason: ready ? '' : (r ? `게이트웨이 준비 안 됨 (${(r.missing || []).join(',') || r.mode})` : '공통결제 게이트웨이가 펀딩 호출을 아직 허용하지 않습니다') };
    },
    async confirm({ paymentKey, orderId, amount }) {
      if (!enabled || !env.EKODIPAY) throw Object.assign(new Error('결제가 열려 있지 않습니다.'), { status: 503 });
      let result;
      try { result = await env.EKODIPAY.confirm({ callerId: CALLER, profileId, paymentKey, orderId, amount, idempotencyKey: `funding-confirm-${orderId}` }); }
      catch { throw Object.assign(new Error('결제 게이트웨이에 연결하지 못했습니다.'), { status: 503, code: 'GATEWAY_UNAVAILABLE' }); }
      if (result?.ok) return result.data;
      throw Object.assign(new Error(clean(result?.error?.message, 200) || '결제를 승인하지 못했습니다.'), { status: result?.error?.status || 502, code: result?.error?.code || '' });
    },
  };
}

/** Private operator phone notice (OperatorNotifier RPC on ekodi-auth-api). Off unless explicitly enabled. */
export function createOperatorNotify(env) {
  if (!yes(env.FUNDING_OPERATOR_NOTIFY_ENABLED) || env.DATA_MODE === 'isolated-staging' || !env.OPERATOR_NOTIFY?.notify) return null;
  return notice => env.OPERATOR_NOTIFY.notify(notice);
}

const ekodiWorkerEntry = {
  async fetch(request, env, ctx) {
    const app = createApp({
      store: createD1Store(env.DB),
      authenticate: req => authenticate(req, env),
      pay: createGatewayPay(env),
      notify: createOperatorNotify(env),
      payout: createTossPayoutClient(env),
      digitalApproved: yes(env.FUNDING_DIGITAL_MID_APPROVED),
      extraHeaders: { 'x-ekodi-route': 'funding' },
    });
    try {
      return await app(request, ctx);
    } catch (error) {
      console.error('funding-worker', error?.message || error);
      const url = new URL(request.url);
      if (url.pathname.startsWith(PUBLIC_PATH)) {
        return new Response('<!doctype html><meta charset="utf-8"><title>에코디 펀딩</title><p>에코디 펀딩을 잠시 불러오지 못했습니다. 잠시 후 다시 열어 주세요.</p>', { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
      }
      return new Response(JSON.stringify({ error: '펀딩 처리 중 오류가 발생했습니다.' }), { status: 500, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    }
  },
};
// FOOTER-TRAFFIC-GUARANTEE + EKODI-EDGE-TRAFFIC-SHIELD-001: apex path route, so it carries its own guard.
export default withEdgeTrafficShield(withFooterTraffic(ekodiWorkerEntry), { service: 'funding' });
