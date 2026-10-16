const params = new URLSearchParams(location.search);
const interactive = params.get('manage') === '1' || params.get('review') === '1' || params.get('purpose') === 'seonammedi-board-admin' || (params.get('site') === 'seonammedi' && params.get('select_account') === '1');
const site = params.get('site') || 'portal';
const returnTo = params.get('return_to') || params.get('returnTo') || '';
const guardKey = `ekodi-auth-entry:${site}:${returnTo}`;
const now = Date.now();
const navigationType = performance.getEntriesByType?.('navigation')?.[0]?.type || '';
let previous = 0;

try {
  previous = Number(sessionStorage.getItem(guardKey) || 0);
} catch {}

const repeated = !interactive && navigationType !== 'reload' && previous > 0 && now - previous < 120000;

if (!interactive) {
  try {
    sessionStorage.setItem(guardKey, String(now));
  } catch {}
}

async function loadAuthRouter() {
  return import('./auth-router.js?v=20261017-exact-origin-1');
}

if (repeated) {
  document.documentElement.dataset.authLoopBlocked = '1';
  if (site === 'admin' && params.get('direct') === '1') {
    document.documentElement.dataset.adminDirectBridge = 'fallback';
  }
  const badge = document.getElementById('serviceBadge');
  const status = document.getElementById('authStatus');
  const retry = document.getElementById('googleRetry');
  const cancel = document.getElementById('cancelSignedOut');

  if (badge) badge.textContent = '반복 이동 차단';
  if (status) {
    status.textContent = '로그인과 서비스 화면이 반복 이동하는 것을 감지해 자동 이동을 중단했습니다. 다시 시도하면 새 인증 흐름으로 시작합니다.';
    status.className = 'notice error';
  }

  retry?.classList.remove('hide');
  cancel?.classList.remove('hide');

  retry?.addEventListener('click', async () => {
    try {
      sessionStorage.removeItem(guardKey);
    } catch {}
    retry.disabled = true;
    await loadAuthRouter();
  }, { once: true });

  cancel?.addEventListener('click', () => {
    // The loop guard must not send a customer site to the platform home or My EKODI.
    // Preserve the exact initiating URL, including the user's compose/query context.
    let target = null;
    try {
      const url = new URL(returnTo);
      const ekodiOrigin = url.hostname === 'ekodi.kr' || url.hostname.endsWith('.ekodi.kr');
      const customerOrigin = (site === 'seonammedi' || site === 'portal') &&
        ['seonammedi.kr','www.seonammedi.kr','xn--3e0b8b58jw4co4mnpll3k.kr','www.xn--3e0b8b58jw4co4mnpll3k.kr'].includes(url.hostname);
      const foreignMy = site !== 'my' && site !== 'portal' &&
        url.origin === 'https://ekodi.kr' && (url.pathname === '/my' || url.pathname.startsWith('/my/'));
      if (url.protocol === 'https:' && !url.username && !url.password &&
          (ekodiOrigin || customerOrigin) && !foreignMy) target = url.href;
    } catch {}
    if (!target && site === 'seonammedi') target = 'https://seonammedi.kr/board/voices';
    if (target) location.assign(target);
    else if (status) status.textContent = '원래 서비스 복귀 주소를 확인하지 못했습니다. 로그인 시작 사이트에서 다시 시도해 주세요.';
  }, { once: true });
} else {
  await loadAuthRouter();
}
