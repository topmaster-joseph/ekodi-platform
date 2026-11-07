// Production worker for 사역소식 통합 발행 허브 (ekodi.kr/sosik).
// Auth: unified EKODI login (Supabase) → operator emails, 에코디교회 church_staff, or 에코디선교회 tenant admin.
// Mail: Gmail refresh-token secrets (same pattern as church-reports-control.js); sending stays off until they exist.
import { createApp, clean, PUBLIC_PATH } from './ministry-news-core.js';
import { createD1Store } from './ministry-news-d1-store.js';

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
  const base = { userId: String(identity.id), email };
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

function utf8Base64Url(value) {
  const bytes = new TextEncoder().encode(value); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function encodedHeader(value) {
  const bytes = new TextEncoder().encode(value); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

export function createGmailMailer(env, fetcher = fetch) {
  const configured = Boolean(clean(env.GMAIL_CLIENT_ID, 500) && clean(env.GMAIL_CLIENT_SECRET, 500) && clean(env.GMAIL_REFRESH_TOKEN, 2000));
  let cached = null;
  async function accessToken() {
    if (cached && cached.expires > Date.now() + 60_000) return cached.token;
    const body = new URLSearchParams({ client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET, refresh_token: env.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' });
    const r = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.access_token) throw new Error('Gmail 인증 토큰을 갱신하지 못했습니다.');
    cached = { token: d.access_token, expires: Date.now() + Number(d.expires_in || 3000) * 1000 };
    return cached.token;
  }
  return {
    configured,
    async send({ to, subject, body }) {
      if (!configured) throw new Error('메일 발송 연결이 설정되지 않았습니다.');
      // Gmail sets From to the authorised mailbox; we only add To/Subject.
      const raw = [
        `To: ${to}`,
        `Subject: ${encodedHeader(subject)}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        body,
      ].join('\r\n');
      const r = await fetcher('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST', headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' }, body: JSON.stringify({ raw: utf8Base64Url(raw) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.id) throw new Error(d?.error?.message || `Gmail 발송 실패 (${r.status})`);
      return d.id;
    },
  };
}

export default {
  async fetch(request, env) {
    const app = createApp({
      store: createD1Store(env.DB),
      authenticate: req => authenticate(req, env),
      mailer: createGmailMailer(env),
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
