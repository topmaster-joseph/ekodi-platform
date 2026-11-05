import { verifyEkodiAdult, completeEkodiAdult, ekodiAdultStatus } from './client.js';

const byId = id => document.getElementById(id);
const status = byId('status'), startButton = byId('startButton');
const loginLink = byId('loginLink'), returnLink = byId('returnLink');
const params = new URL(location.href).searchParams;
const site = params.get('site') || '';
const SITE_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;
const errors = {
  unauthorized: '로그인이 필요합니다.',
  provider_not_verified: '인증기관의 본인확인이 완료되지 않았습니다.',
  provider_unavailable: '인증기관의 응답이 지연되고 있습니다. 다시 시도해 주세요.',
  too_many_attempts: '하루 인증 시도 한도를 초과했습니다.',
  site_not_enabled: '이 서비스는 아직 성인인증을 제공하지 않습니다.',
  age_verification_unavailable: '성인인증 연동을 준비 중입니다.',
  attempt_expired: '인증 유효시간이 지났습니다. 다시 시작해 주세요.',
  attempt_already_consumed: '이미 처리된 인증입니다. 인증 상태를 확인해 주세요.',
  sdk_unavailable: '인증 창을 불러올 수 없습니다. 나중에 다시 시도해 주세요.',
  origin_not_allowed: '이 페이지에서는 인증을 시작할 수 없습니다.',
};
function show(message, kind = '') {
  status.textContent = message;
  status.className = 'status' + (kind ? ' ' + kind : '');
}
function destination(raw) {
  // Only same-origin, site-owned paths; never send authorization details or result IDs to another domain.
  if (!SITE_PATTERN.test(site)) return '/';
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/' + site;
  try {
    const url = new URL(raw, location.origin);
    if (url.origin !== location.origin || (url.pathname !== '/' + site && !url.pathname.startsWith('/' + site + '/'))) return '/' + site;
    if (url.pathname.startsWith('/' + site + '/admin')) return '/' + site;
    return url.pathname + url.search + url.hash;
  } catch { return '/' + site; }
}
const back = destination(params.get('return_to'));
returnLink.href = back;
const cleanUrl = new URL(location.href);
for (const key of ['identityVerificationId','code','message','pgCode','pgMessage']) cleanUrl.searchParams.delete(key);
const canonicalRedirectUrl = cleanUrl.origin + cleanUrl.pathname + cleanUrl.search;

function authRedirect() {
  return '/auth/?site=' + encodeURIComponent(site) + '&select_account=1&return_to=' + encodeURIComponent(canonicalRedirectUrl);
}
async function getJson(url) {
  const result = await fetch(url,{cache:'no-store',credentials:'omit'});
  if (!result.ok) throw new Error('server_unavailable');
  return result.json();
}
async function main() {
  if (!SITE_PATTERN.test(site)) { show('인증을 요청한 서비스를 확인할 수 없습니다.', 'error'); return; }
  const cfg = await getJson('/api/age-verification/config?site=' + encodeURIComponent(site));
  if (!cfg?.enabled || !cfg.auth?.supabaseUrl || !cfg.auth?.publishableKey) {
    show('성인인증 서비스 연동을 준비 중입니다. 현재 인증은 진행되지 않습니다.');
    return;
  }
  byId('purpose').textContent = cfg.policy === 'youth_protection_19'
    ? '확인 기준: 청소년보호법상 19세가 되는 해의 1월 1일부터.'
    : '확인 기준: 민법상 만 19세 생일이 지난 사람.';
  const createClient = window.supabase?.createClient;
  if (typeof createClient !== 'function') { show('로그인 연결 모듈을 불러오지 못했습니다.', 'error'); return; }
  const client = createClient(cfg.auth.supabaseUrl, cfg.auth.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  async function accessToken() {
    const { data } = await client.auth.getSession();
    return data?.session?.access_token || null;
  }
  const token = await accessToken();
  if (!token) { loginLink.href = authRedirect(); loginLink.hidden = false; show('에코디 로그인 후 본인인증을 진행할 수 있습니다.'); return; }
  const returnedId = params.get('identityVerificationId');
  // Clean provider identifiers from the address bar and browser-history before displaying results.
  if (returnedId || params.has('code')) history.replaceState(null, '', canonicalRedirectUrl);
  if (params.has('code')) {
    show('인증이 취소되었거나 실패했습니다. 다시 시도해 주세요.', 'error');
  } else if (returnedId) {
    if (!/^ekodi-age-[0-9a-f]{32}$/.test(returnedId)) {
      show('잘못된 인증 응답입니다.', 'error');
    } else {
      try {
        show('인증기관 결과를 서버에서 확인하고 있습니다.');
        const result = await completeEkodiAdult({site,accessToken: token,identityVerificationId:returnedId});
        if (result.verified) {
          show('성인 본인인증이 완료되었습니다.', 'done');
          returnLink.textContent = '서비스로 돌아가기';
          return;
        }
      } catch (error) { show(errors[error.message] || '본인인증을 완료하지 못했습니다.', 'error'); }
    }
  }
  try {
    const state = await ekodiAdultStatus({site,accessToken: token});
    if (state.verified) {
      show('성인 본인인증이 완료된 계정입니다.', 'done');
      returnLink.textContent = '서비스로 돌아가기';
      return;
    }
  } catch (error) {
    show(errors[error.message] || '인증 상태를 확인할 수 없습니다.', 'error');
    return;
  }
  startButton.hidden = false;
  if (!returnedId && !params.has('code')) show('아래 버튼으로 휴대폰 본인인증을 시작해 주세요.');
  startButton.addEventListener('click', async () => {
    startButton.disabled = true;
    show('휴대폰 본인인증을 연결하고 있습니다.');
    try {
      const freshToken = await accessToken();
      if (!freshToken) { loginLink.href = authRedirect(); loginLink.hidden = false; throw new Error('unauthorized'); }
      const result = await verifyEkodiAdult({
        site, accessToken: freshToken, redirectUrl: canonicalRedirectUrl
      });
      if (result.verified) { show('성인 본인인증이 완료되었습니다.', 'done'); startButton.hidden = true; returnLink.textContent = '서비스로 돌아가기'; }
    } catch (error) {
      show(errors[error.message] || '본인인증 중 오류가 발생했습니다. 다시 시도해 주세요.', 'error');
    } finally { startButton.disabled = false; }
  });
}
main().catch(() => show('서비스 연결 상태를 확인할 수 없습니다.', 'error'));
