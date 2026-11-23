// Production worker for 사역소식 통합 발행 허브 (ekodi.kr/sosik).
// Auth: unified EKODI login (Supabase) → operator emails, 에코디교회 church_staff, or 에코디선교회 tenant admin.
// Mail: each organisation sends from its own account connected in EKODI Mail (교회 ekodichurch@, 선교회 ekodimission@).
import { createApp, clean, PUBLIC_PATH } from './ministry-news-core.js';
import { createD1Store } from './ministry-news-d1-store.js';
import { withFooterTraffic } from './footer-traffic-guarantee.js';
import { withEdgeTrafficShield } from './edge-traffic-shield.js';

const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const CHURCH_PASTOR_API = `${SUPABASE_URL}/functions/v1/church-pastor-api`;
const CHURCH_ROLES = new Set(['senior_pastor', 'pastor', 'staff']);
const MISSION_ROLES = new Set(['tenant_admin', 'store_owner']);

function deny(message, status) {
  return { response: new Response(JSON.stringify({ error: message }), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }) };
}
function operators(env) {
  return new Set(String(env.OPERATOR_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean));
}

export async function authenticate(request, env, fetcher = fetch) {
  const header = String(request.headers.get('authorization') || '');
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token || token.length > 8192) return deny('로그인이 필요합니다.', 401);
  const identityResponse = await fetcher(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` }, cache: 'no-store' });
  const identity = identityResponse.ok ? await identityResponse.json().catch(() => null) : null;
  if (!identity?.id || !identity?.email || !identity?.email_confirmed_at) return deny('로그인을 확인할 수 없습니다.', 401);
  const email = String(identity.email).toLowerCase();
  const base = { userId: String(identity.id), email, token };
  if (operators(env).has(email)) return { data: { ...base, role: 'operator', orgs: ['church', 'mission'] } };

  const orgs = []; let role = '';
  try {
    const staffUrl = new URL(CHURCH_PASTOR_API);
    staffUrl.searchParams.set('table', 'church_staff'); staffUrl.searchParams.set('user_id', `eq.${identity.id}`); staffUrl.searchParams.set('limit', '1');
    const r = await fetcher(staffUrl.toString(), { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, cache: 'no-store' });
    const staff = r.ok ? (await r.json().catch(() => []))?.[0] : null;
    if (staff && CHURCH_ROLES.has(clean(staff.role, 80))) { orgs.push('church'); role = clean(staff.role, 80); }
  } catch { /* church check unavailable: fall through */ }
  try {
    const r = await fetcher(`${SUPABASE_URL}/rest/v1/rpc/current_site_activity_contexts`, { method: 'POST', headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}' });
    const contexts = r.ok ? await r.json().catch(() => []) : [];
    const ctx = (Array.isArray(contexts) ? contexts : []).find(c => String(c?.tenant || '').toLowerCase() === 'ekodimission');
    const missionRole = String(ctx?.authorization_role || '').toLowerCase();
    if (MISSION_ROLES.has(missionRole)) { orgs.push('mission'); role ||= missionRole; }
  } catch { /* mission check unavailable */ }
  if (!orgs.length) return deny('에코디교회 또는 에코디선교회 운영 권한이 필요합니다.', 403);
  return { data: { ...base, role, orgs } };
}

function encodedHeader(value) {
  const bytes = new TextEncoder().encode(String(value || '').replace(/[\r\n]+/g, ' ')); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

/**
 * Sends through accounts the organisation already connected in EKODI Mail (https://ekodi.kr/mail/admin),
 * via the CONTROL_API service binding (ekodi-auth-api). No mail secrets live in this worker, and the
 * signed-in operator must hold the send grant on that account — Mail Hub keeps that boundary.
 */
export function createConnectedMailer(env, call = env.CONTROL_API ? (url, init) => env.CONTROL_API.fetch(url, init) : null) {
  const senders = {
    church: clean(env.SENDER_CHURCH, 200).toLowerCase(),
    mission: clean(env.SENDER_MISSION, 200).toLowerCase(),
  };
  const cache = new Map();
  async function accounts(session) {
    if (!cache.has(session.token)) {
      cache.set(session.token, (async () => {
        if (!call) return { error: '메일 서비스 연결(CONTROL_API)이 없습니다.' };
        const r = await call('https://ekodi.kr/api/mail/control/accounts', { headers: { authorization: `Bearer ${session.token}` } });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return { error: d.error || `메일 계정 목록을 불러오지 못했습니다 (${r.status}).` };
        return { list: Array.isArray(d.accounts) ? d.accounts : [] };
      })().catch(error => ({ error: clean(error?.message, 200) || '메일 계정 목록을 불러오지 못했습니다.' })));
    }
    return cache.get(session.token);
  }
  function pickAccount(list, address) {
    const mine = list.filter(a => String(a.emailAddress || '').toLowerCase() === address && a.provider === 'gmail');
    return mine.find(a => a.connectionStatus === 'connected' && a.enabled && a.permissions?.send) || mine[0] || null;
  }
  async function status(session) {
    const out = {};
    const result = await accounts(session);
    for (const [org, address] of Object.entries(senders)) {
      if (!address) { out[org] = { address: '', ready: false, reason: '보내는 메일 미지정' }; continue; }
      if (result.error) { out[org] = { address, ready: false, reason: result.error }; continue; }
      const account = pickAccount(result.list, address);
      let reason = '';
      if (!account) reason = '에코디 메일에 아직 연결되지 않은 계정입니다';
      else if (account.connectionStatus !== 'connected' || !account.enabled) reason = `연결 상태: ${account.connectionStatus || '확인필요'}`;
      else if (!account.permissions?.send) reason = '지금 로그인한 계정에 이 메일의 발송 권한이 없습니다';
      out[org] = { address, ready: !reason, reason, accountId: account?.id || null };
    }
    return out;
  }
  return {
    status,
    async send(session, org, { to, subject, body }) {
      const sender = (await status(session))[org];
      if (!sender?.ready) throw new Error(sender?.reason || '보내는 메일이 연결되지 않았습니다.');
      const r = await call(`https://ekodi.kr/api/mail/control/accounts/${encodeURIComponent(sender.accountId)}/send`, {
        method: 'POST', headers: { authorization: `Bearer ${session.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ to, subject: encodedHeader(subject), body }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        if (d.code === 'MAIL_SEND_SCOPE_REQUIRED') throw new Error(`${sender.address}의 Gmail 발송 권한을 에코디 메일 관리에서 추가 승인해 주세요.`);
        throw new Error(d.error || `메일 발송 실패 (${r.status})`);
      }
      return d.id || '';
    },
  };
}

const ekodiWorkerEntry={
  async fetch(request, env) {
    const app = createApp({
      store: createD1Store(env.DB),
      authenticate: req => authenticate(req, env),
      mailer: createConnectedMailer(env),
      extraHeaders: { 'x-ekodi-route': 'ministry-news' },
    });
    try {
      return await app(request);
    } catch (error) {
      console.error('ministry-news-worker', error?.message || error);
      const url = new URL(request.url);
      if (url.pathname.replace(/\/+$/, '') === PUBLIC_PATH) {
        return new Response('<!doctype html><meta charset="utf-8"><title>사역소식</title><p>사역소식을 잠시 불러오지 못했습니다. 잠시 후 다시 열어 주세요.</p>', { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
      }
      return new Response(JSON.stringify({ error: '사역소식 처리 중 오류가 발생했습니다.' }), { status: 500, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    }
  },
};
// FOOTER-TRAFFIC-GUARANTEE: public HTML from this route always carries footer visit stats.
// EKODI-EDGE-TRAFFIC-SHIELD-001: this apex route bypasses the Shared Site guard, so it carries its own.
export default withEdgeTrafficShield(withFooterTraffic(ekodiWorkerEntry),{service:'ministry-news'});
