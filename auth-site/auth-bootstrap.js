// Strict-CSP bootstrap owns loop/recovery decisions before the auth router starts.
const params = new URLSearchParams(location.search);
const manageMode = params.get('manage') === '1';
const reviewMode = params.get('review') === '1';
const interactive = manageMode || reviewMode;
const site = params.get('site') || 'portal';
const directAdmin = site === 'admin' && params.get('direct') === '1';
const returnTo = params.get('return_to') || params.get('returnTo') || '';

const root = document.documentElement;
root.dataset.identityManage = manageMode ? '1' : '0';
root.dataset.seamlessSso = interactive ? '0' : '1';
root.dataset.adminDirectBridge = directAdmin ? '1' : '0';

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

function trustedReturnTarget() {
  let target = 'https://ekodi.kr/';
  try {
    const url = new URL(returnTo);
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.hostname.toLowerCase() === 'ekodi.kr'
    ) {
      target = url.href;
    }
  } catch {}
  return target;
}

async function startRouter() {
  await import('/auth-router.js?v=20260904-direct-login-1');
}

if (repeated) {
  root.dataset.authLoopBlocked = '1';
  root.dataset.adminDirectBridge = 'loop-blocked';

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
    delete root.dataset.authLoopBlocked;
    root.dataset.adminDirectBridge = directAdmin ? '1' : '0';
    await startRouter();
  }, { once: true });

  cancel?.addEventListener('click', () => {
    location.assign(trustedReturnTarget());
  }, { once: true });
} else {
  await startRouter();
}
