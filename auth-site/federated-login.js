// EKODI federated login paths (Naver, Kakao) — dormant until an operator enables them.
//
// Every login path signs the person into ONE EKODI account (people + login_identities).
// login_identities.provider records which path was used (google / naver / kakao ...).
// Buttons render only when identity-api lists the provider, which requires BOTH:
//   1) the provider's secrets are set on the identity-api edge function, and
//   2) public.identity_providers.enabled = true for that provider.
// With either gate closed this module renders nothing and changes nothing.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const IDENTITY = `${SUPABASE_URL}/functions/v1/identity-api`;
const PENDING_KEY = 'ekodi.federated.pending';
const PENDING_MAX_AGE_MS = 10 * 60 * 1000;
const ALIAS_EMAIL = /^identity\+[a-z0-9_-]+\.[0-9a-f]{32}@ekodi\.kr$/i;

export const PROVIDER_LABELS = Object.freeze({
  google: 'Google', naver: '네이버', kakao: '카카오', apple: 'Apple', microsoft: 'Microsoft', passkey: '패스키',
});

let sbClient = null;
function sb() {
  sbClient ||= createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  return sbClient;
}

const $ = id => document.getElementById(id);
function show(id, on = true) { $(id)?.classList.toggle('hide', !on); }
function notice(id, text, tone = '') {
  const el = $(id); if (!el) return;
  el.textContent = text; el.className = `notice${tone ? ` ${tone}` : ''}`; el.classList.remove('hide');
}

async function identity(path, { authenticated = false, ...options } = {}) {
  const headers = { apikey: PUBLISHABLE_KEY, ...(options.headers || {}) };
  if (authenticated) {
    const { data: { session } } = await sb().auth.getSession();
    if (!session) throw new Error('login_required');
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  if (options.body && !headers['content-type']) headers['content-type'] = 'application/json';
  const response = await fetch(`${IDENTITY}${path}`, { ...options, headers, cache: 'no-store' });
  const text = await response.text();
  let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) throw Object.assign(new Error(data.error || `http_${response.status}`), { status: response.status, data });
  return data;
}

export function identityLabel(item) {
  const label = PROVIDER_LABELS[item?.provider] || item?.provider || 'Google';
  const email = String(item?.email || '');
  return { label, display: !email || ALIAS_EMAIL.test(email) ? `${label} 계정` : email };
}

let providersPromise = null;
export function redirectProviders() {
  providersPromise ||= identity('/providers', { method: 'GET' })
    .then(data => (data.providers || []).filter(p => p.redirect === true && p.id !== 'google' && PROVIDER_LABELS[p.id]))
    .catch(error => { console.warn('identity providers', error); return []; });
  return providersPromise;
}

// Daum IDs were folded into Kakao accounts and Daum offers no separate third-party
// login, so the Kakao path is labelled for both. The recorded provider stays 'kakao'.
export const BUTTON_LABELS = { kakao: '카카오·다음' };
export function buttonText(provider, purpose) {
  const name = BUTTON_LABELS[provider?.id] || provider?.name || PROVIDER_LABELS[provider?.id] || '';
  return purpose === 'link' ? `${name} 계정 추가` : `${name} 계정으로 계속하기`;
}

function button(provider, purpose, statusId) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `federated-btn federated-${provider.id}`;
  b.textContent = buttonText(provider, purpose);
  b.addEventListener('click', () => start(provider, purpose, b, statusId));
  return b;
}

async function renderInto(hostId, purpose, statusId) {
  const host = $(hostId); if (!host) return 0;
  host.replaceChildren(); show(hostId, false);
  const list = (await redirectProviders()).filter(p => (purpose === 'link' ? p.supportsLink : p.supportsLogin));
  for (const provider of list) host.append(button(provider, purpose, statusId));
  show(hostId, list.length > 0);
  return list.length;
}

/** Sign-in buttons under the Google button. Renders nothing while signed in or while providers are dormant. */
export async function renderLoginButtons() {
  try {
    const { data: { session } } = await sb().auth.getSession();
    if (session) return 0;
  } catch { return 0; }
  return renderInto('federatedButtonHost', 'login', 'authStatus');
}

/** "계정 추가" buttons inside the signed-in identity panel (links another path to the same EKODI account). */
export function renderLinkButtons() {
  return renderInto('federatedLinkHost', 'link', 'identityLinkStatus');
}

async function start(provider, purpose, el, statusId) {
  el.disabled = true;
  try {
    const path = purpose === 'link' ? `/providers/${provider.id}/link/challenge` : `/providers/${provider.id}/challenge`;
    const challenge = await identity(path, { method: 'POST', authenticated: purpose === 'link' });
    if (!challenge.authorizeUrl || !challenge.nonce) throw new Error('provider_unavailable');
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ provider: provider.id, purpose, nonce: challenge.nonce, search: location.search, at: Date.now() }));
    } catch { throw new Error('storage_unavailable'); }
    notice(statusId, `${provider.name} 인증 화면으로 이동합니다.`);
    location.assign(challenge.authorizeUrl);
  } catch (error) {
    console.error('federated start', error);
    el.disabled = false;
    notice(statusId, error.message === 'storage_unavailable'
      ? '브라우저 저장소를 사용할 수 없어 이 로그인 방식을 시작하지 못했습니다.'
      : `${provider.name} 로그인을 시작하지 못했습니다. 다시 시도해 주세요.`, 'error');
  }
}

export function errorMessage(code, name) {
  if (code === 'challenge_expired_or_used') return `${name} 인증 시간이 만료되었습니다. 다시 시도해 주세요.`;
  if (code === 'account_merge_review_required') return `${name}으로 이미 별도의 EKODI 계정을 사용하고 있습니다. 기존 유료구독·포인트·권한을 확인한 뒤 연결할 수 있습니다.`;
  if (code === 'identity_conflict' || code === 'identity_already_linked') return `이 ${name} 계정은 다른 EKODI 계정에 이미 연결되어 있습니다. 관리자 확인이 필요합니다.`;
  if (code === 'provider_unavailable') return `${name} 로그인은 현재 사용하지 않습니다.`;
  if (code === 'access_denied') return `${name} 인증이 취소되었습니다.`;
  if (code === 'verified_email_required') return `${name} 계정의 인증된 이메일이 필요합니다.`;
  return `${name} 본인 인증에 실패했습니다. 다시 시도하거나 취소해 주세요.`;
}

/** Pure decision used by the callback handler (exported for tests). */
export function classifyCallback(search, pendingRaw, now = Date.now()) {
  const params = new URLSearchParams(search);
  const state = params.get('state');
  if (!state || !(params.has('code') || params.has('error'))) return { kind: 'none' };
  // Only a callback this module started (a pending record exists) is ours. Any other
  // ?code=&state= on the auth page belongs to a different flow and is left untouched.
  if (!pendingRaw) return { kind: 'none' };
  let pending = null;
  try { pending = JSON.parse(pendingRaw); } catch { pending = null; }
  if (!pending || pending.nonce !== state || !PROVIDER_LABELS[pending.provider]
      || !['login', 'link'].includes(pending.purpose) || now - Number(pending.at || 0) > PENDING_MAX_AGE_MS) {
    return { kind: 'invalid' };
  }
  if (params.get('error')) return { kind: 'denied', pending };
  return { kind: 'exchange', pending, code: params.get('code'), state };
}

function fail(text, restoreSearch) {
  history.replaceState({}, document.title, `${location.pathname}${restoreSearch || ''}`);
  const badge = $('serviceBadge'); if (badge) badge.textContent = '인증 실패';
  show('signedIn', false); show('signedOut', true); show('cancelSignedOut', true);
  notice('authStatus', text, 'error');
}

/**
 * Must run before any site-specific login script. Returns true when this page load was a
 * Naver/Kakao callback; the module then owns the page (redirects or shows the failure).
 */
export async function handleCallback() {
  let pendingRaw = null;
  try { pendingRaw = sessionStorage.getItem(PENDING_KEY); } catch { pendingRaw = null; }
  const result = classifyCallback(location.search, pendingRaw);
  if (result.kind === 'none') return false;
  try { sessionStorage.removeItem(PENDING_KEY); } catch {}
  if (result.kind === 'invalid') { fail('로그인 요청을 확인하지 못했습니다. 처음부터 다시 시도해 주세요.', ''); return true; }
  const { pending } = result;
  const name = PROVIDER_LABELS[pending.provider];
  if (result.kind === 'denied') { fail(errorMessage('access_denied', name), pending.search); return true; }
  const badge = $('serviceBadge'); if (badge) badge.textContent = '인증 확인 중';
  notice('authStatus', pending.purpose === 'link' ? `${name} 계정을 현재 EKODI 계정에 연결하고 있습니다.` : `${name} 계정을 확인하고 있습니다.`);
  try {
    const body = JSON.stringify({ credential: result.code, nonce: result.state });
    if (pending.purpose === 'link') {
      await identity(`/providers/${pending.provider}/link/exchange`, { method: 'POST', authenticated: true, body });
    } else {
      const proof = await identity(`/providers/${pending.provider}/exchange`, { method: 'POST', body });
      const { error } = await sb().auth.verifyOtp({ token_hash: proof.tokenHash, type: 'email' });
      if (error) throw error;
    }
    // Continue with the original site/return_to; the normal signed-in flow takes over.
    location.replace(`${location.pathname}${pending.search || ''}`);
  } catch (error) {
    console.error('federated callback', error);
    fail(errorMessage(error.message, name), pending.search);
  }
  return true;
}
